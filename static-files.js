const path = require('path');

const PUBLIC_FILES = new Set([
  '/index.html',
  '/agents.js',
  '/media-output.js',
  '/job-status.js',
  '/access-client.js',
  '/app.js',
  '/dashboard.js',
  '/styles.css',
  '/manifest.json',
  '/sw.js',
]);

function resolveStaticFile(pathname, root, generatedOutputDir) {
  if (pathname.includes('..')) return { error: 'bad_path' };

  let base;
  let relativePath;
  if (pathname.startsWith('/generated/')) {
    base = generatedOutputDir;
    relativePath = pathname.slice('/generated/'.length);
  } else {
    if (!PUBLIC_FILES.has(pathname)) return null;
    base = root;
    relativePath = pathname.slice(1);
  }

  const file = path.resolve(base, relativePath);
  if (file !== base && !file.startsWith(base + path.sep)) return { error: 'bad_path' };
  return { file };
}

module.exports = { resolveStaticFile };
