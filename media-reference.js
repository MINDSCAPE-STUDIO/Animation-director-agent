const fs = require('fs');
const os = require('os');
const path = require('path');
const { GENERATED_DIR } = require('./storage-paths');

const TEMP_PREFIX = 'mindscape-ref-';

function within(root, target) {
  const resolved = path.resolve(root);
  return target === resolved || target.startsWith(resolved + path.sep);
}

// Callers can supply media references from the browser. Only two local
// locations are legitimate: generated media and the short-lived reference
// images written by POST /jobs. Never read an arbitrary server path.
function safeLocalFile(value) {
  if (typeof value !== 'string' || !value || value.includes('\0')) return null;
  const candidate = value.startsWith('/generated/')
    ? path.resolve(GENERATED_DIR, value.slice('/generated/'.length))
    : path.resolve(value);

  const inGenerated = within(GENERATED_DIR, candidate);
  const tempRoot = path.resolve(os.tmpdir());
  const relative = path.relative(tempRoot, candidate);
  const inTemp = within(tempRoot, candidate)
    && path.basename(candidate).startsWith(TEMP_PREFIX)
    && relative !== ''
    && !relative.split(path.sep).includes('..');

  if (!inGenerated && !inTemp) return null;
  try {
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

module.exports = { safeLocalFile, TEMP_PREFIX, GENERATED_DIR };
