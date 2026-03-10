/**
 * Parse and route inbound Slack requests to module handlers.
 */
function Router_handleRequest(request) {
  var payload = Router_parseBody_(request.body);

  if (payload && payload.type === 'url_verification' && payload.challenge) {
    return ContentService.createTextOutput(payload.challenge)
      .setMimeType(ContentService.MimeType.TEXT);
  }

  // TODO: route to Commands, Events, Modals, and Admin handlers.
  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    message: 'Request received',
    payloadType: payload && payload.type ? payload.type : 'unknown'
  })).setMimeType(ContentService.MimeType.JSON);
}

function Router_parseBody_(body) {
  if (!body) return {};

  try {
    return JSON.parse(body);
  } catch (err) {
    return { raw: body };
  }
}
