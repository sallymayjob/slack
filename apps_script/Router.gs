/**
 * Router idempotency checks for inbound requests.
 */

var ROUTER_REQUEST_KEY_PREFIX = 'router:request:';

function routeInboundRequest(request) {
  var requestKey = buildInboundRequestKey(request);
  if (!storeInboundRequestKeyIfNew_(requestKey)) {
    return {
      ok: true,
      duplicate: true,
      requestKey: requestKey
    };
  }

  return dispatchInboundRequest_(request, requestKey);
}

function dispatchInboundRequest_(request, requestKey) {
  // Delegate to existing router implementation if present.
  if (typeof handleInboundRequest === 'function') {
    return handleInboundRequest(request, requestKey);
  }

  return {
    ok: true,
    duplicate: false,
    requestKey: requestKey
  };
}

function storeInboundRequestKeyIfNew_(requestKey) {
  var props = PropertiesService.getScriptProperties();
  var propKey = ROUTER_REQUEST_KEY_PREFIX + requestKey;
  if (props.getProperty(propKey)) {
    return false;
  }

  props.setProperty(propKey, new Date().toISOString());
  return true;
}
