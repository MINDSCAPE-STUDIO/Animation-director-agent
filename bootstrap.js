const Module = require('module');
const path = require('path');
const originalLoad = Module._load;
const originalRouterPath = path.resolve(__dirname, 'model-router.js');
const omniRouterPath = path.resolve(__dirname, 'omniroute-router.js');

Module._load = function(request, parent, isMain) {
  if (request === './model-router' && parent && path.resolve(parent.filename) !== originalRouterPath) {
    return originalLoad.call(this, omniRouterPath, parent, isMain);
  }
  return originalLoad.call(this, request, parent, isMain);
};

require('./server.js');
