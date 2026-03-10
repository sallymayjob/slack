/**
 * Webhook entrypoint for all Slack inbound traffic.
 */
function doPost(e) {
  var request = Auth_parseInboundRequest(e);

  if (!Auth_verifySlackRequest(request)) {
    return ContentService.createTextOutput('Unauthorized').setMimeType(ContentService.MimeType.TEXT);
  }

  return Router_handleRequest(request);
}

/**
 * Lightweight health endpoint.
 */
function doGet() {
  return ContentService.createTextOutput('Slack LMS Apps Script endpoint is running.')
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Time-based trigger entrypoint for scheduled jobs.
 */
function runScheduledJobs() {
  Scheduler_run();
}

/**
 * Time-based trigger entrypoint for queue processing.
 */
function processQueueTrigger() {
  Queue_processReadyJobs();
}
