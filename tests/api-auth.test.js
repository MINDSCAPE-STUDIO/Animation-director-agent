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


test('Cloudflare R2 adapter signs requests and rejects unsafe object keys', () => {
  const { isObjectStorageConfigured, buildSignedRequest } = require('../object-storage');
  const env = {
    OBJECT_STORAGE_ENDPOINT: 'https://acct123.r2.cloudflarestorage.com',
    OBJECT_STORAGE_BUCKET: 'mindscape-test',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'test-access-id',
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 'test-secret-key',
    OBJECT_STORAGE_REGION: 'auto',
    OBJECT_STORAGE_PREFIX: 'test-prefix'
  };
  assert.equal(isObjectStorageConfigured(env), true);
  const signed = buildSignedRequest(
    'PUT', 'generated/clip.mp4', Buffer.from('test'), 'video/mp4',
    env, new Date('2026-10-27T00:00:00.000Z')
  );
  assert.equal(signed.url.pathname, '/mindscape-test/test-prefix/generated/clip.mp4');
  assert.match(signed.options.headers.Authorization, /^AWS4-HMAC-SHA256 Credential=test-access-id\//);
  assert.equal(
    signed.options.headers.Authorization.match(/Signature=([0-9a-f]{64})$/)?.[1],
    'edc27007768ebfa697cf920633d17a322676e3397689c387d243ad7a00cad906'
  );
  assert.equal(signed.options.headers.Authorization.includes('test-secret-key'), false);
  assert.throws(() => buildSignedRequest('GET', '../escape', null, null, env), /Invalid object-storage key/);
});


test('service worker does not cache API routes or authenticated responses', () => {
  const fs = require('node:fs');
  const sw = fs.readFileSync(require('node:path').join(__dirname, '..', 'sw.js'), 'utf8');
  assert.match(sw, /mindscape-agent-v6/);
  assert.match(sw, /request\.headers\.has\('Authorization'\)/);
  assert.match(sw, /requestUrl\.pathname\.startsWith\('\/generated\/'\)/);
  for (const route of ['/jobs', '/generation-history', '/evaluations', '/style-bible', '/master-assets', '/health', '/ready']) {
    assert.ok(sw.includes("'" + route + "'"), 'expected dynamic route exclusion for ' + route);
  }
});
