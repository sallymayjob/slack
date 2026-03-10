/**
 * Queue status transition contract.
 *
 * Allowed transitions:
 * - pending    -> processing | dead
 * - processing -> done | retry | dead
 * - retry      -> pending | processing | dead
 * - done       -> (terminal, no transitions)
 * - dead       -> (terminal, no transitions)
 */
var Queue = Queue || {};

Queue.Status = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  RETRY: 'retry',
  DONE: 'done',
  DEAD: 'dead'
});

Queue.AllowedStatusTransitions = Object.freeze({
  pending: [Queue.Status.PROCESSING, Queue.Status.DEAD],
  processing: [Queue.Status.DONE, Queue.Status.RETRY, Queue.Status.DEAD],
  retry: [Queue.Status.PENDING, Queue.Status.PROCESSING, Queue.Status.DEAD],
  done: [],
  dead: []
});

Queue.LogTabs = Object.freeze({
  QUEUE: 'Queue',
  ERROR: 'Error_Log',
  AUDIT: 'Audit_Log'
});

/**
 * Checks whether a status transition is valid.
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {boolean}
 */
Queue.canTransitionStatus = function(fromStatus, toStatus) {
  var allowed = Queue.AllowedStatusTransitions[fromStatus] || [];
  return allowed.indexOf(toStatus) !== -1;
};

/**
 * Asserts transition validity and throws if invalid.
 * @param {string} fromStatus
 * @param {string} toStatus
 */
Queue.assertValidStatusTransition = function(fromStatus, toStatus) {
  if (!Queue.canTransitionStatus(fromStatus, toStatus)) {
    throw new Error('Invalid Queue.Status transition: ' + fromStatus + ' -> ' + toStatus);
  }
};

/**
 * Guarded Queue row status update.
 * Always updates UpdatedAt.
 * Writes failure context to Error_Log and Audit_Log with correlation ID.
 *
 * Required queue row fields:
 *   QueueID, Status
 * Optional queue row fields:
 *   AttemptCount, LastError
 *
 * @param {Object} queueRow mutable queue row object
 * @param {string} nextStatus
 * @param {Object=} options
 * @param {string=} options.actor actor/service user changing status
 * @param {string=} options.reason human-readable reason
 * @param {string=} options.correlationId trace ID; generated if omitted
 * @param {Object=} options.context extra context logged in audit/error logs
 * @returns {Object} updated queue row
 */
Queue.transitionStatus = function(queueRow, nextStatus, options) {
  options = options || {};

  var correlationId = options.correlationId || Queue.createCorrelationId();
  var actor = options.actor || 'system';
  var reason = options.reason || '';
  var context = options.context || {};
  var nowIso = new Date().toISOString();
  var previousStatus = queueRow.Status;

  try {
    Queue.assertValidStatusTransition(previousStatus, nextStatus);

    queueRow.Status = nextStatus;
    queueRow.UpdatedAt = nowIso;

    if (nextStatus === Queue.Status.RETRY) {
      queueRow.AttemptCount = Number(queueRow.AttemptCount || 0) + 1;
    }

    Queue.appendAuditLog({
      CorrelationID: correlationId,
      QueueID: queueRow.QueueID || '',
      EventType: 'QUEUE_STATUS_TRANSITION',
      Actor: actor,
      StatusFrom: previousStatus,
      StatusTo: nextStatus,
      Message: reason,
      ContextJSON: Queue.safeStringify(context),
      CreatedAt: nowIso
    });

    return queueRow;
  } catch (err) {
    queueRow.UpdatedAt = nowIso;
    queueRow.LastError = err && err.message ? err.message : String(err);

    var failureContext = Queue.mergeObjects(context, {
      queueRow: {
        QueueID: queueRow.QueueID || '',
        Status: previousStatus,
        NextStatus: nextStatus
      },
      reason: reason
    });

    Queue.appendErrorLog({
      CorrelationID: correlationId,
      QueueID: queueRow.QueueID || '',
      ErrorType: 'QUEUE_STATUS_TRANSITION_REJECTED',
      ErrorMessage: queueRow.LastError,
      ContextJSON: Queue.safeStringify(failureContext),
      CreatedAt: nowIso
    });

    Queue.appendAuditLog({
      CorrelationID: correlationId,
      QueueID: queueRow.QueueID || '',
      EventType: 'QUEUE_STATUS_TRANSITION_REJECTED',
      Actor: actor,
      StatusFrom: previousStatus,
      StatusTo: nextStatus,
      Message: queueRow.LastError,
      ContextJSON: Queue.safeStringify(failureContext),
      CreatedAt: nowIso
    });

    throw err;
  }
};

Queue.createCorrelationId = function() {
  return 'corr-' + Utilities.getUuid();
};

Queue.safeStringify = function(value) {
  try {
    return JSON.stringify(value || {});
  } catch (err) {
    return JSON.stringify({ stringifyError: String(err) });
  }
};

Queue.mergeObjects = function(left, right) {
  var target = {};
  var key;

  left = left || {};
  right = right || {};

  for (key in left) {
    if (Object.prototype.hasOwnProperty.call(left, key)) {
      target[key] = left[key];
    }
  }

  for (key in right) {
    if (Object.prototype.hasOwnProperty.call(right, key)) {
      target[key] = right[key];
    }
  }

  return target;
};

Queue.appendErrorLog = function(entry) {
  Queue.appendSheetRow(Queue.LogTabs.ERROR, [
    entry.CorrelationID || '',
    entry.QueueID || '',
    entry.ErrorType || '',
    entry.ErrorMessage || '',
    entry.ContextJSON || '{}',
    entry.CreatedAt || new Date().toISOString()
  ]);
};

Queue.appendAuditLog = function(entry) {
  Queue.appendSheetRow(Queue.LogTabs.AUDIT, [
    entry.CorrelationID || '',
    entry.QueueID || '',
    entry.EventType || '',
    entry.Actor || '',
    entry.StatusFrom || '',
    entry.StatusTo || '',
    entry.Message || '',
    entry.ContextJSON || '{}',
    entry.CreatedAt || new Date().toISOString()
  ]);
};

Queue.appendSheetRow = function(tabName, rowValues) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(tabName);

  if (!sheet) {
    throw new Error('Missing required log tab: ' + tabName);
  }

  sheet.appendRow(rowValues);
};
