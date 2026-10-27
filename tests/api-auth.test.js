const test = require('node:test');
const assert = require('node:assert/strict');
const { isPublicPath, isAuthorized, safeEqual } = require('../api-auth');

const req = headers => ({ headers: headers || {} });

test('dashboard shell and health endpoints stay publicly reachable', () => {
  assert.equal(isPublicPath('/', 'GET'), true);
  assert.equal(isPublicPath('/health', 'GET'), true);
  assert.equal(isPublicPath('/ready', 'GET'), true);
  assert.equal(isPublicPath('/dashboard.js', 'GET'), true);
  assert.equal(isPublicPath('/styles.css', 'GET'), true);
});

test('mutating requests and agent API routes require authentication', () => {
  assert.equal(isPublicPath('/jobs', 'GET'), false);
  assert.equal(isPublicPath('/jobs', 'POST'), false);
  assert.equal(isPublicPath('/generation-history', 'GET'), false);
  assert.equal(isPublicPath('/evaluations', 'GET'), false);
  assert.equal(isPublicPath('/style-bible', 'PATCH'), false);
  assert.equal(isPublicPath('/master-assets', 'POST'), false);
});

test('API routes remain protected when resource IDs look like static file names', () => {
  assert.equal(isPublicPath('/jobs/job-123.json', 'GET'), false);
  assert.equal(isPublicPath('/master-assets/character.png', 'GET'), false);
  assert.equal(isPublicPath('/generation-history.json', 'GET'), false);
});

test('configured API key accepts only correct bearer or x-api-key values', () => {
  const secret = 'unit-test-secret';
  assert.equal(isAuthorized(req({ authorization: 'Bearer unit-test-secret' }), secret), true);
  assert.equal(isAuthorized(req({ 'x-api-key': 'unit-test-secret' }), secret), true);
  assert.equal(isAuthorized(req({ authorization: 'Bearer wrong-secret' }), secret), false);
  assert.equal(isAuthorized(req({}), secret), false);
});

test('key comparison is length-safe and timing-safe API rejects empty credentials', () => {
  assert.equal(safeEqual('same', 'same'), true);
  assert.equal(safeEqual('same', 'different'), false);
  assert.equal(safeEqual('', ''), false);
  assert.equal(safeEqual('short', 'much-longer'), false);
});

test('agent remains convenient for local development when no key is configured', () => {
  assert.equal(isAuthorized(req({}), ''), true);
});
