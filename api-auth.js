const path = require('path');
const crypto = require('crypto');

const PROTECTED_PREFIXES = [
  '/jobs',
  '/generation-history',
  '/error-taxonomy',
  '/evaluations',
  '/visual-evaluate',
  '/style-bible',
  '/master-assets',
];

function isPublicPath(pathname, method = 'GET') {
  if (method !== 'GET') return false;
  if (pathname === '/' || pathname === '/health' || pathname === '/ready') return true;
  if (pathname.startsWith('/generated/')) return true;

  // API routes stay protected even when an ID happens to end in ".png" or ".json".
  if (PROTECTED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/') || pathname.startsWith(prefix + '.'))) {
    return false;
  }

  // Allow the dashboard's static assets to load without an API key.
  return Boolean(path.extname(pathname));
}

function safeEqual(candidate, expected) {
  if (typeof candidate !== 'string' || !candidate || typeof expected !== 'string' || !expected) return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function isAuthorized(req, apiKey = process.env.MINDSCAPE_API_KEY || '') {
  // Local development remains convenient when the environment variable is absent.
  // Production is locked down when MINDSCAPE_API_KEY is configured in Render.
  if (!apiKey) return true;

  const authorization = String(req.headers?.authorization || '');
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  const alternate = typeof req.headers?.['x-api-key'] === 'string' ? req.headers['x-api-key'] : '';
  return safeEqual(bearer, apiKey) || safeEqual(alternate, apiKey);
}

module.exports = { isPublicPath, isAuthorized, safeEqual };
