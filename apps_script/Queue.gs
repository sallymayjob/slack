/**
 * Queue dedupe checks before enqueue and process.
 */

var QUEUE_DEDUPE_PREFIX = 'queue:dedupe:';

function enqueueJob(job) {
  var dedupeKey = buildQueueDedupeKey(
    job.jobType,
    job.entityType,
    job.entityId,
    job.availableAt || new Date(),
    job.dedupeWindowMinutes || 5
  );

  if (!storeQueueDedupeKeyIfNew_(dedupeKey)) {
    return {
      ok: true,
      duplicate: true,
      dedupeKey: dedupeKey
    };
  }

  if (typeof enqueueJobRow_ === 'function') {
    return enqueueJobRow_(job, dedupeKey);
  }

  return {
    ok: true,
    duplicate: false,
    dedupeKey: dedupeKey
  };
}

function processQueueJob(job) {
  var dedupeKey = job.dedupeKey || buildQueueDedupeKey(
    job.jobType,
    job.entityType,
    job.entityId,
    job.availableAt || new Date(),
    job.dedupeWindowMinutes || 5
  );

  if (!storeQueueDedupeKeyIfNew_(dedupeKey)) {
    return {
      ok: true,
      duplicate: true,
      dedupeKey: dedupeKey
    };
  }

  if (typeof handleQueueJob_ === 'function') {
    return handleQueueJob_(job, dedupeKey);
  }

  return {
    ok: true,
    duplicate: false,
    dedupeKey: dedupeKey
  };
}

function storeQueueDedupeKeyIfNew_(dedupeKey) {
  var props = PropertiesService.getScriptProperties();
  var propKey = QUEUE_DEDUPE_PREFIX + dedupeKey;
  if (props.getProperty(propKey)) {
    return false;
  }

  props.setProperty(propKey, new Date().toISOString());
  return true;
}
