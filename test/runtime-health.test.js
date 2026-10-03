const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRuntimeHealth } = require('../runtime-health');

test('reports the same default video route used by model routing', () => {
  const health = buildRuntimeHealth({});
  assert.equal(health.provider, 'replicate');
  assert.equal(health.providers.video.provider, 'replicate');
  assert.equal(health.providers.video.credentials_required, true);
  assert.equal(health.providers.video.credentials_configured, false);
  assert.equal(health.providers.video.availability, 'not_checked');
  assert.equal(health.providers.image.provider, 'hf_image');
});

test('reports only credential presence and never includes secret values', () => {
  const environment = {
    IMAGE_PROVIDER: 'google',
    VIDEO_PROVIDER: 'fal',
    GEMINI_API_KEY: 'private-gemini-value',
    FAL_KEY: 'private-fal-value',
    APP_ACCESS_TOKEN: 'private-access-value',
    APP_DATA_DIR: '/var/data',
  };
  const health = buildRuntimeHealth(environment, false);
  const response = JSON.stringify(health);

  assert.equal(health.ok, false);
  assert.equal(health.storage_path_configured, true);
  assert.equal(health.providers.image.credentials_configured, true);
  assert.equal(health.providers.video.credentials_configured, true);
  assert.equal(health.providers.evaluator.credentials_configured, true);
  assert.equal(health.provider_setup_ready, true);
  assert.equal(health.auth_required, true);
  assert.equal(response.includes('private-'), false);
});

test('marks unavailable credentials as setup work rather than claiming providers are online', () => {
  const health = buildRuntimeHealth({ IMAGE_PROVIDER: 'google', VIDEO_PROVIDER: 'replicate' });
  assert.equal(health.provider_setup_ready, false);
  assert.equal(health.providers.image.setup_ready, false);
  assert.equal(health.providers.video.setup_ready, false);
  assert.equal(health.providers.evaluator.setup_ready, false);
  assert.ok(Object.values(health.providers).every(provider => provider.availability === 'not_checked'));
});
