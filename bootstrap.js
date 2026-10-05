const Module = require('module');
const path = require('path');

const originalLoad = Module._load;
const originalRouterPath = path.resolve(__dirname, 'model-router.js');
const omniRouterPath = path.resolve(__dirname, 'omniroute-router.js');

Module._load = function(request, parent, isMain) {
  const parentPath = parent?.filename ? path.resolve(parent.filename) : '';
  // Only redirect application imports of model-router. The OmniRoute adapter
  // itself must be allowed to load the real base router or it recurses into
  // itself through Module._load.
  if (
    request === './model-router' &&
    parentPath &&
    parentPath !== originalRouterPath &&
    parentPath !== omniRouterPath
  ) {
    return originalLoad.call(this, omniRouterPath, parent, isMain);
  }
  return originalLoad.call(this, request, parent, isMain);
};

require('./server.js');
