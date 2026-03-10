/**
 * Canonical tab/header schema for Slack LMS sheets.
 *
 * Headers are written exactly once: this setup only writes the header row when
 * row 1 is empty. Existing tabs with populated headers are left untouched.
 */
const SHEET_SCHEMA = {
  Users: [
    'UserID',
    'SlackUserID',
    'Email',
    'FullName',
    'RoleType',
    'ManagerSlackUserID',
    'TimeZone',
    'IsActive',
    'CreatedAt',
    'UpdatedAt'
  ],
  Lessons: [
    'LessonID',
    'TrackID',
    'LessonSequence',
    'ReleaseType',
    'ReleaseOffsetDays',
    'Title',
    'ContentTemplateID',
    'RequiresApproval',
    'IsActive'
  ],
  Enrollments: [
    'EnrollmentID',
    'UserID',
    'SlackUserID',
    'CohortID',
    'TrackID',
    'StartDate',
    'EnrollmentStatus',
    'CurrentLessonID',
    'CurrentSequence',
    'PausedAt',
    'CompletedAt'
  ],
  Progress: [
    'ProgressID',
    'EnrollmentID',
    'UserID',
    'LessonID',
    'LessonSequence',
    'Status',
    'AssignedAt',
    'DueDate',
    'SentAt',
    'CompletedAt',
    'ApprovedAt',
    'ReminderCount',
    'LastReminderAt'
  ],
  Deliveries: [
    'DeliveryID',
    'EnrollmentID',
    'UserID',
    'LessonID',
    'DeliveryType',
    'ChannelID',
    'MessageTS',
    'DeliveredAt',
    'DeliveryStatus',
    'RetryCount',
    'RequestFingerprint',
    'IsResend',
    'ParentDeliveryID'
  ],
  Queue: [
    'QueueID',
    'JobType',
    'EntityType',
    'EntityID',
    'PayloadJSON',
    'Status',
    'Priority',
    'AvailableAt',
    'AttemptCount',
    'MaxAttempts',
    'LastError',
    'LockedBy',
    'LockedAt',
    'CreatedAt',
    'UpdatedAt'
  ],
  Approvals: [
    'ApprovalID',
    'EnrollmentID',
    'ProgressID',
    'UserID',
    'LessonID',
    'ManagerSlackUserID',
    'Status',
    'RequestedAt',
    'RespondedAt',
    'Decision',
    'DecisionNote',
    'CreatedAt',
    'UpdatedAt'
  ],
  Audit_Log: [
    'AuditID',
    'EventType',
    'ActorType',
    'ActorID',
    'EntityType',
    'EntityID',
    'CorrelationID',
    'EventPayloadJSON',
    'CreatedAt'
  ],
  Error_Log: [
    'ErrorID',
    'SourceModule',
    'Severity',
    'ErrorMessage',
    'StackTrace',
    'ContextJSON',
    'CorrelationID',
    'QueueID',
    'OccurredAt',
    'ResolvedAt',
    'ResolutionNote'
  ],
  Settings: [
    'SettingKey',
    'SettingValue',
    'ValueType',
    'Description',
    'IsActive',
    'UpdatedBy',
    'UpdatedAt'
  ]
};

/**
 * Creates any missing tabs and writes canonical headers once.
 *
 * Safe to run repeatedly: existing non-empty headers are not overwritten.
 */
function setupSheetSchema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabNames = Object.keys(SHEET_SCHEMA);

  tabNames.forEach(function (tabName) {
    const headers = SHEET_SCHEMA[tabName];
    const sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);

    if (isHeaderRowEmpty_(sheet, headers.length)) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  });
}

/**
 * Returns a deterministic map of column name -> 1-based index for a tab.
 */
function getHeaderMap(tabName) {
  const headers = SHEET_SCHEMA[tabName];
  if (!headers) {
    throw new Error('Unknown tab name for header map: ' + tabName);
  }

  return headers.reduce(function (map, header, index) {
    map[header] = index + 1;
    return map;
  }, {});
}

function isHeaderRowEmpty_(sheet, width) {
  const values = sheet.getRange(1, 1, 1, width).getValues()[0];
  return values.every(function (value) {
    return String(value).trim() === '';
  });
}
