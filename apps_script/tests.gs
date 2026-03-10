/**
 * Lightweight manual test harness for Apps Script editor execution.
 *
 * Run these functions directly from the Apps Script editor before production rollout.
 */

function runAllPreflightTests() {
  var results = [
    testSlackSignatureVerificationEdgeCases(),
    testNextLessonResolutionWithSequenceGaps(),
    testQueueRetryBackoffCalculation(),
    testIdempotentDuplicateRejection()
  ];

  Logger.log('All preflight tests passed (%s checks).', results.length);
  return results;
}

function testSlackSignatureVerificationEdgeCases() {
  var signingSecret = 'unit-test-secret';
  var now = 1700000000;
  var toleranceSec = 60 * 5;
  var body = 'token=abc&command=%2Flearn&user_id=U123';

  var validTimestamp = String(now - 5);
  var validSig = _buildSlackSignature(signingSecret, validTimestamp, body);

  _assertTrue(
    _verifySlackSignature({
      signature: validSig,
      timestamp: validTimestamp,
      rawBody: body,
      signingSecret: signingSecret,
      nowEpochSec: now,
      toleranceSec: toleranceSec
    }),
    'Expected valid signature to pass.'
  );

  _assertTrue(
    !_verifySlackSignature({
      signature: 'v0=deadbeef',
      timestamp: validTimestamp,
      rawBody: body,
      signingSecret: signingSecret,
      nowEpochSec: now,
      toleranceSec: toleranceSec
    }),
    'Expected tampered signature to fail.'
  );

  _assertTrue(
    !_verifySlackSignature({
      signature: validSig,
      timestamp: String(now - toleranceSec - 1),
      rawBody: body,
      signingSecret: signingSecret,
      nowEpochSec: now,
      toleranceSec: toleranceSec
    }),
    'Expected stale timestamp to fail.'
  );

  _assertTrue(
    !_verifySlackSignature({
      signature: validSig,
      timestamp: String(now + toleranceSec + 1),
      rawBody: body,
      signingSecret: signingSecret,
      nowEpochSec: now,
      toleranceSec: toleranceSec
    }),
    'Expected future timestamp outside tolerance to fail.'
  );

  Logger.log('PASS testSlackSignatureVerificationEdgeCases');
  return 'testSlackSignatureVerificationEdgeCases';
}

function testNextLessonResolutionWithSequenceGaps() {
  var lessons = [
    { LessonID: 'LES-001', LessonSequence: 1, IsActive: true },
    { LessonID: 'LES-002', LessonSequence: 2, IsActive: false },
    { LessonID: 'LES-004', LessonSequence: 4, IsActive: true },
    { LessonID: 'LES-007', LessonSequence: 7, IsActive: true }
  ];

  var nextFromOne = _resolveNextLesson(lessons, 1);
  _assertEquals('LES-004', nextFromOne ? nextFromOne.LessonID : null, 'Should skip inactive and gap to sequence 4.');

  var nextFromFour = _resolveNextLesson(lessons, 4);
  _assertEquals('LES-007', nextFromFour ? nextFromFour.LessonID : null, 'Should jump from 4 to 7.');

  var nextFromSeven = _resolveNextLesson(lessons, 7);
  _assertEquals(null, nextFromSeven, 'Should return null at end of sequence.');

  Logger.log('PASS testNextLessonResolutionWithSequenceGaps');
  return 'testNextLessonResolutionWithSequenceGaps';
}

function testQueueRetryBackoffCalculation() {
  _assertEquals(1000, _calculateRetryBackoffMs(1), 'Attempt 1 should be 1s.');
  _assertEquals(2000, _calculateRetryBackoffMs(2), 'Attempt 2 should be 2s.');
  _assertEquals(4000, _calculateRetryBackoffMs(3), 'Attempt 3 should be 4s.');
  _assertEquals(300000, _calculateRetryBackoffMs(20), 'Backoff should clamp to max.');

  // Retry-After should dominate exponential delay when higher.
  _assertEquals(120000, _calculateRetryBackoffMs(2, 120), 'Retry-After should be honored.');

  Logger.log('PASS testQueueRetryBackoffCalculation');
  return 'testQueueRetryBackoffCalculation';
}

function testIdempotentDuplicateRejection() {
  var processedFingerprints = {
    'ENR-001|LES-001|SEND_LESSON|2026-01-01': true
  };

  _assertTrue(
    _shouldRejectDuplicate(processedFingerprints, 'ENR-001|LES-001|SEND_LESSON|2026-01-01'),
    'Previously processed fingerprint must be rejected.'
  );

  _assertTrue(
    !_shouldRejectDuplicate(processedFingerprints, 'ENR-001|LES-002|SEND_LESSON|2026-01-02'),
    'New fingerprint should be accepted.'
  );

  Logger.log('PASS testIdempotentDuplicateRejection');
  return 'testIdempotentDuplicateRejection';
}

function _verifySlackSignature(input) {
  if (!input || !input.signature || !input.timestamp || !input.rawBody) {
    return false;
  }

  var timestamp = Number(input.timestamp);
  if (!isFinite(timestamp)) {
    return false;
  }

  var drift = Math.abs(Number(input.nowEpochSec) - timestamp);
  if (drift > Number(input.toleranceSec)) {
    return false;
  }

  var expected = _buildSlackSignature(input.signingSecret, input.timestamp, input.rawBody);
  return expected === input.signature;
}

function _buildSlackSignature(secret, timestamp, rawBody) {
  var base = 'v0:' + timestamp + ':' + rawBody;
  var signatureBytes = Utilities.computeHmacSha256Signature(base, secret);
  var hex = signatureBytes
    .map(function(byte) {
      var value = byte;
      if (value < 0) {
        value += 256;
      }
      var h = value.toString(16);
      return h.length === 1 ? '0' + h : h;
    })
    .join('');

  return 'v0=' + hex;
}

function _resolveNextLesson(lessons, currentSequence) {
  var nextCandidates = lessons
    .filter(function(lesson) {
      return lesson.IsActive && Number(lesson.LessonSequence) > Number(currentSequence);
    })
    .sort(function(a, b) {
      return Number(a.LessonSequence) - Number(b.LessonSequence);
    });

  return nextCandidates.length ? nextCandidates[0] : null;
}

function _calculateRetryBackoffMs(attemptCount, retryAfterSeconds) {
  var maxBackoffMs = 300000;
  var attempt = Math.max(1, Number(attemptCount));
  var exponentialMs = Math.min(maxBackoffMs, Math.pow(2, attempt - 1) * 1000);

  if (retryAfterSeconds) {
    var retryAfterMs = Number(retryAfterSeconds) * 1000;
    return Math.max(exponentialMs, retryAfterMs);
  }

  return exponentialMs;
}

function _shouldRejectDuplicate(processedFingerprintMap, fingerprint) {
  return !!processedFingerprintMap[fingerprint];
}

function _assertEquals(expected, actual, message) {
  if (expected !== actual) {
    throw new Error(message + ' Expected: ' + expected + ', actual: ' + actual);
  }
}

function _assertTrue(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
