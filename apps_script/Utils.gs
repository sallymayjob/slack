/**
 * Deterministic key helpers shared across routing, queueing, and delivery.
 */

var KEY_NAMESPACE = {
  INBOUND: 'inbound',
  QUEUE: 'queue',
  DELIVERY: 'delivery'
};

/**
 * Returns a deterministic key for inbound Slack requests.
 * Preferred ID fields: event_id, trigger_id, payload.callback_id, command+trigger_id.
 */
function buildInboundRequestKey(request) {
  var source = (request && request.source) || 'slack';
  var teamId = safeKeyPart_((request && request.teamId) || (request && request.team_id) || 'unknown-team');
  var requestId =
    (request && request.event_id) ||
    (request && request.trigger_id) ||
    (request && request.request_id) ||
    (request && request.callback_id) ||
    (request && request.command && request.command + ':' + (request.trigger_id || 'no-trigger')) ||
    'unknown-request';

  return [KEY_NAMESPACE.INBOUND, safeKeyPart_(source), teamId, safeKeyPart_(requestId)].join('|');
}

/**
 * Returns a deterministic queue dedupe key.
 * Format: queue|jobType|entityType|entityId|windowBucket
 */
function buildQueueDedupeKey(jobType, entityType, entityId, windowStart, windowMinutes) {
  var bucket = toTimeBucket_(windowStart, windowMinutes || 5);
  return [
    KEY_NAMESPACE.QUEUE,
    safeKeyPart_(jobType || 'unknown-job'),
    safeKeyPart_(entityType || 'unknown-entity-type'),
    safeKeyPart_(entityId || 'unknown-entity-id'),
    bucket
  ].join('|');
}

/**
 * Returns a deterministic fingerprint for lesson deliveries.
 * Format: delivery|enrollmentId|lessonId|deliveryType|windowBucket
 */
function buildDeliveryFingerprint(enrollmentId, lessonId, deliveryType, windowStart, windowMinutes) {
  return [
    KEY_NAMESPACE.DELIVERY,
    safeKeyPart_(enrollmentId || 'unknown-enrollment'),
    safeKeyPart_(lessonId || 'unknown-lesson'),
    safeKeyPart_(deliveryType || 'lesson'),
    toTimeBucket_(windowStart, windowMinutes || 1440)
  ].join('|');
}

function toTimeBucket_(inputDate, windowMinutes) {
  var date = inputDate instanceof Date ? inputDate : new Date(inputDate || new Date());
  var minutes = Math.max(1, Number(windowMinutes) || 1);
  var bucketMs = minutes * 60 * 1000;
  var bucketStart = Math.floor(date.getTime() / bucketMs) * bucketMs;
  return new Date(bucketStart).toISOString();
}

function safeKeyPart_(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9:_\-.]/g, '_');
}
