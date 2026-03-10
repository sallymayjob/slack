/**
 * Delivery fingerprint uniqueness guard and recording into Deliveries.RequestFingerprint.
 */

var DELIVERY_FINGERPRINT_PREFIX = 'delivery:fingerprint:';

function deliverLesson(payload) {
  var fingerprint = buildDeliveryFingerprint(
    payload.enrollmentId,
    payload.lessonId,
    payload.deliveryType,
    payload.windowStart || new Date(),
    payload.windowMinutes || 1440
  );

  if (!storeDeliveryFingerprintIfNew_(fingerprint)) {
    return {
      ok: true,
      duplicate: true,
      requestFingerprint: fingerprint
    };
  }

  if (typeof sendSlackLessonMessage_ !== 'function') {
    throw new Error('sendSlackLessonMessage_ is not defined');
  }

  var sendResult = sendSlackLessonMessage_(payload);
  recordDeliveryWithFingerprint_(payload, sendResult, fingerprint);

  return {
    ok: true,
    duplicate: false,
    requestFingerprint: fingerprint,
    sendResult: sendResult
  };
}

function storeDeliveryFingerprintIfNew_(fingerprint) {
  var props = PropertiesService.getScriptProperties();
  var propKey = DELIVERY_FINGERPRINT_PREFIX + fingerprint;
  if (props.getProperty(propKey)) {
    return false;
  }

  props.setProperty(propKey, new Date().toISOString());
  return true;
}

function recordDeliveryWithFingerprint_(payload, sendResult, fingerprint) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName('Deliveries');
  if (!sheet) {
    throw new Error('Deliveries sheet is required');
  }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var headerIndex = {};
  for (var i = 0; i < headers.length; i++) {
    headerIndex[headers[i]] = i;
  }

  if (headerIndex.RequestFingerprint === undefined) {
    throw new Error('Deliveries.RequestFingerprint column is required');
  }

  var row = new Array(headers.length).fill('');
  row[headerIndex.RequestFingerprint] = fingerprint;

  if (headerIndex.EnrollmentID !== undefined) row[headerIndex.EnrollmentID] = payload.enrollmentId || '';
  if (headerIndex.UserID !== undefined) row[headerIndex.UserID] = payload.userId || '';
  if (headerIndex.LessonID !== undefined) row[headerIndex.LessonID] = payload.lessonId || '';
  if (headerIndex.DeliveryType !== undefined) row[headerIndex.DeliveryType] = payload.deliveryType || 'lesson';
  if (headerIndex.ChannelID !== undefined) row[headerIndex.ChannelID] = sendResult.channel || '';
  if (headerIndex.MessageTS !== undefined) row[headerIndex.MessageTS] = sendResult.ts || '';
  if (headerIndex.DeliveredAt !== undefined) row[headerIndex.DeliveredAt] = new Date().toISOString();
  if (headerIndex.DeliveryStatus !== undefined) row[headerIndex.DeliveryStatus] = sendResult.ok ? 'SENT' : 'FAILED';

  sheet.appendRow(row);
}
