const Module = require('module');
const path = require('path');
const originalLoad = Module._load;
const originalRouterPath = path.resolve(__dirname, 'model-router.js');
const omniRouterPath = path.resolve(__dirname, 'omniroute-router.js');
const freeLlmRouterPath = path.resolve(__dirname, 'freellmapi-router.js');

Module._load = function(request, parent, isMain) {
  if (request === './model-router' && parent && path.resolve(parent.filename) !== originalRouterPath) {
    if (String(process.env.FREELLMAPI_ENABLED || '').toLowerCase() === 'true' && process.env.FREELLMAPI_BASE_URL) {
      return originalLoad.call(this, freeLlmRouterPath, parent, isMain);
    }
    return originalLoad.call(this, omniRouterPath, parent, isMain);
  }
  return originalLoad.call(this, request, parent, isMain);
};

require('./server.js');
