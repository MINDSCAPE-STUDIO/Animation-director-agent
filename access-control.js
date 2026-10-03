const { timingSafeEqual } = require('crypto');

function isAuthorized(authorization, expectedToken) {
  if (!expectedToken) return true;
  if (typeof authorization !== 'string') return false;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const supplied = Buffer.from(match[1]);
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function validateProductionConfig(environment = process.env) {
  if (environment.NODE_ENV === 'production' && !environment.APP_ACCESS_TOKEN) {
    throw new Error('APP_ACCESS_TOKEN must be configured before running in production.');
  }
}

module.exports = { isAuthorized, validateProductionConfig };
