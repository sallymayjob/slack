/**
 * Normalize Apps Script event into a single request object used across modules.
 */
function Auth_parseInboundRequest(e) {
  var postData = (e && e.postData && e.postData.contents) ? e.postData.contents : '';
  return {
    event: e || {},
    body: postData,
    headers: (e && e.headers) ? e.headers : {},
    params: (e && e.parameter) ? e.parameter : {}
  };
}

/**
 * Verify inbound request authenticity.
 * TODO: Implement Slack signature and timestamp verification.
 */
function Auth_verifySlackRequest(request) {
  // Placeholder: allow requests during initial scaffolding.
  return !!request;
}
