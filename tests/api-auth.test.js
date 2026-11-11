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


test('object storage validates configuration, rejects unsafe keys, and hides credentials', async () => {
  const { isObjectStorageConfigured, resolveObjectKey, putObjectBuffer, getObjectBuffer, getObjectStorageStatus } = require('../object-storage');
  const env = {
    OBJECT_STORAGE_ENDPOINT: 'https://acct123.r2.cloudflarestorage.com',
    OBJECT_STORAGE_BUCKET: 'mindscape-test',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'test-access-id',
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 'test-secret-key',
    OBJECT_STORAGE_REGION: 'auto',
    OBJECT_STORAGE_PREFIX: 'test-prefix'
  };
  assert.equal(isObjectStorageConfigured(env), true);
  // Endpoints must be parseable HTTPS URLs without query strings or fragments.
  for (const bad of [
    'http://acct123.r2.cloudflarestorage.com',
    'https://acct123.r2.cloudflarestorage.com?token=1',
    'https://acct123.r2.cloudflarestorage.com#fragment',
    'not a url'
  ]) {
    assert.equal(isObjectStorageConfigured({ ...env, OBJECT_STORAGE_ENDPOINT: bad }), false, bad);
  }
  // Keys are prefixed and normalized before any request is attempted.
  assert.deepEqual(resolveObjectKey('generated/clip.mp4', env), { bucket: 'mindscape-test', key: 'test-prefix/generated/clip.mp4' });
  assert.deepEqual(resolveObjectKey('/generated/clip.mp4', env), { bucket: 'mindscape-test', key: 'test-prefix/generated/clip.mp4' });
  // Unsafe keys are rejected synchronously before any network request is attempted.
  assert.throws(() => resolveObjectKey('../escape', env), /Invalid object-storage key/);
  assert.throws(() => resolveObjectKey('generated/../../escape', env), /Invalid object-storage key/);
  assert.throws(() => resolveObjectKey('generated//clip.mp4', env), /Invalid object-storage key/);
  assert.throws(() => resolveObjectKey('', env), /Invalid object-storage key/);
  assert.throws(() => resolveObjectKey('generated/clip.mp4', {}), /not fully configured/);
  await assert.rejects(() => putObjectBuffer('../escape', Buffer.from('test'), 'video/mp4', env), /Invalid object-storage key/);
  await assert.rejects(() => putObjectBuffer('generated/../clip.mp4', Buffer.from('test'), 'video/mp4', env), /Invalid object-storage key/);
  await assert.rejects(() => getObjectBuffer('a//b', env), /Invalid object-storage key/);
  // Status reporting never exposes credentials.
  const status = getObjectStorageStatus(env);
  assert.equal(status.configured, true);
  assert.deepEqual(status.missing_variables, []);
  assert.equal(JSON.stringify(status).includes('test-secret-key'), false);
  assert.equal(JSON.stringify(status).includes('test-access-id'), false);
});


test('B2 endpoints sign with the endpoint region rather than "auto"', () => {
  const { getResolvedRegion } = require('../object-storage');
  const base = {
    OBJECT_STORAGE_BUCKET: 'mindscape-test',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'test-access-id',
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 'test-secret-key',
    OBJECT_STORAGE_PREFIX: 'test-prefix'
  };
  // B2 rejects "auto" in the credential scope; the region must come from the host.
  assert.equal(getResolvedRegion({ ...base, OBJECT_STORAGE_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com', OBJECT_STORAGE_REGION: 'auto' }), 'us-west-004');
  assert.equal(getResolvedRegion({ ...base, OBJECT_STORAGE_ENDPOINT: 'https://s3.eu-central-003.backblazeb2.com' }), 'eu-central-003');
  assert.equal(getResolvedRegion({ ...base, OBJECT_STORAGE_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com', OBJECT_STORAGE_REGION: 'us-east-1' }), 'us-west-004');
  // Non-B2 endpoints keep the configured region, or "auto" for Cloudflare R2.
  assert.equal(getResolvedRegion({ ...base, OBJECT_STORAGE_ENDPOINT: 'https://acct123.r2.cloudflarestorage.com', OBJECT_STORAGE_REGION: 'auto' }), 'auto');
  assert.equal(getResolvedRegion({ ...base, OBJECT_STORAGE_ENDPOINT: 'https://acct123.r2.cloudflarestorage.com' }), 'auto');
  assert.equal(getResolvedRegion({ ...base, OBJECT_STORAGE_ENDPOINT: 'https://s3.example.com', OBJECT_STORAGE_REGION: 'us-east-2' }), 'us-east-2');
  assert.equal(getResolvedRegion({}), null);
});


test('service worker does not cache API routes or authenticated responses', () => {
  const fs = require('node:fs');
  const sw = fs.readFileSync(require('node:path').join(__dirname, '..', 'sw.js'), 'utf8');
  assert.match(sw, /mindscape-agent-v7/);
  assert.match(sw, /request\.headers\.has\('Authorization'\)/);
  assert.match(sw, /requestUrl\.pathname\.startsWith\('\/generated\/'\)/);
  for (const route of ['/jobs', '/generation-history', '/evaluations', '/style-bible', '/master-assets', '/health', '/ready']) {
    assert.ok(sw.includes("'" + route + "'"), 'expected dynamic route exclusion for ' + route);
  }
});
