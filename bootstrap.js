const path = require('path');

// V1 intentionally uses the base model router directly.
// OmniRoute remains available as an optional V2 integration, but it is not
// allowed to sit on the critical generation path by default.
const {initializeObjectStorage}=require('./object-storage');

(async()=>{
  await initializeObjectStorage();
  require('./server.js');
})().catch(error=>{
  console.error('Service bootstrap failed:',error);
  process.exitCode=1;
});
