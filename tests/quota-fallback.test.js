const test = require('node:test');
const assert = require('node:assert/strict');
const { quotaFallbackJob } = require('../model-router');
const { getFallbackReadiness, getProviderReadiness, getStorageHealth } = require('../provider-readiness');
const { submit } = require('../model-router');

function withEnv(values, run) {
  const before = {};
  for (const [key, value] of Object.entries(values)) {
    before[key] = Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined;
    if (value === null || value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('detects a plain HTTP 429 and selects configured image fallback', () => {
  withEnv({
    FAL_KEY: 'test-only-placeholder',
    IMAGE_FALLBACK_MODEL: null,
    IMAGE_MODEL_FALLBACK: null
  }, () => {
    const fallback = quotaFallbackJob(
      { id: 'unit-image', type: 'text_to_image', provider: 'google', model: 'test-image' },
      new Error('Provider returned HTTP 429')
    );
    assert.equal(fallback.provider, 'fal');
    assert.equal(fallback.model, 'fal-ai/flux/schnell');
    assert.equal(fallback.fallback_from, 'google');
    assert.equal(fallback.fallback_reason, 'provider_quota');
  });
});

test('does not fall back for a non-quota error', () => {
  withEnv({ FAL_KEY: 'test-only-placeholder' }, () => {
    assert.equal(
      quotaFallbackJob(
        { type: 'text_to_image', provider: 'google' },
        new Error('Reference image could not be found')
      ),
      null
    );
  });
});

test('uses Pixazo only for supported image-to-video fallback', () => {
  withEnv({ PIXAZO_API_KEY: 'test-only-placeholder', FAL_KEY: null, PUBLIC_BASE_URL: 'https://example.invalid' }, () => {
    const fallback = quotaFallbackJob(
      { id: 'unit-i2v', type: 'image_to_video', provider: 'qwencloud', input: { image: '/unused.png' } },
      new Error('QwenCloud 429: quota exceeded')
    );
    assert.equal(fallback.provider, 'pixazo_ltx');
    assert.equal(fallback.type, 'image_to_video');
  });
});

test('text-to-video never routes to the image-only Pixazo adapter', () => {
  withEnv({
    PIXAZO_API_KEY: 'test-only-placeholder',
    FAL_KEY: 'test-only-placeholder',
    FAL_T2V_FALLBACK_MODEL: 'fal-ai/wan/v2.6/text-to-video'
  }, () => {
    const fallback = quotaFallbackJob(
      { id: 'unit-t2v', type: 'text_to_video', provider: 'qwencloud' },
      new Error('QwenCloud 429: quota exceeded')
    );
    assert.equal(fallback.provider, 'fal');
    assert.equal(fallback.model, 'fal-ai/wan/v2.6/text-to-video');
  });
});

test('does not claim a fallback exists when no compatible provider is configured', () => {
  withEnv({
    FAL_KEY: null,
    PIXAZO_API_KEY: null,
    FAL_I2V_FALLBACK_MODEL: null,
    FAL_T2V_FALLBACK_MODEL: null
  }, () => {
    assert.equal(
      quotaFallbackJob(
        { type: 'text_to_video', provider: 'qwencloud' },
        new Error('QwenCloud 429: quota exceeded')
      ),
      null
    );
  });
});

test('reports image fallback readiness without exposing credentials', () => {
  const ready = getFallbackReadiness({ FAL_KEY: 'image-secret' });
  assert.equal(ready.image_generation.ready, true);
  assert.equal(ready.image_generation.provider, 'fal');
  assert.equal(ready.image_generation.model, 'fal-ai/flux/schnell');
  assert.equal(JSON.stringify(ready).includes('image-secret'), false);
});

test('requires Pixazo key and public URL setup for image-to-video readiness', () => {
  const ready = getFallbackReadiness({ PIXAZO_API_KEY: 'video-secret', PUBLIC_BASE_URL: 'https://example.invalid' });
  assert.equal(ready.image_to_video.ready, true);
  assert.equal(ready.image_to_video.provider, 'pixazo_ltx');
  const notReady = getFallbackReadiness({ PIXAZO_API_KEY: 'video-secret' });
  assert.equal(notReady.image_to_video.ready, false);
});

test('requires FAL key and an explicit text-to-video fallback model', () => {
  const noModel = getFallbackReadiness({ FAL_KEY: 'video-secret' });
  assert.equal(noModel.text_to_video.ready, false);
  const configured = getFallbackReadiness({ FAL_KEY: 'video-secret', FAL_T2V_FALLBACK_MODEL: 'fal-ai/example-t2v' });
  assert.equal(configured.text_to_video.ready, true);
  assert.equal(configured.text_to_video.model, 'fal-ai/example-t2v');
});

test('reports task-compatible provider readiness with configured fallbacks', () => {
  const status = getProviderReadiness({
    IMAGE_PROVIDER: 'google',
    VIDEO_PROVIDER: 'qwencloud',
    FAL_KEY: 'test-fal-secret',
    PIXAZO_API_KEY: 'test-pixazo-secret',
    PUBLIC_BASE_URL: 'https://example.invalid',
    FAL_T2V_FALLBACK_MODEL: 'fal-ai/wan/v2.6/text-to-video'
  });
  assert.equal(status.ready, true);
  assert.equal(status.tasks.image_generation.provider, 'fal');
  assert.equal(status.tasks.image_to_video.provider, 'pixazo_ltx');
  assert.equal(status.tasks.text_to_video.provider, 'fal');
  assert.equal(JSON.stringify(status).includes('test-fal-secret'), false);
  assert.equal(JSON.stringify(status).includes('test-pixazo-secret'), false);
});

test('reports missing compatible routes instead of claiming model readiness', () => {
  const status = getProviderReadiness({ IMAGE_PROVIDER: 'google', VIDEO_PROVIDER: 'qwencloud' });
  assert.equal(status.ready, false);
  assert.equal(status.tasks.text_to_video.ready, false);
  assert.ok(status.missing_variables.includes('QWEN_CLOUD_API_KEY or DASHSCOPE_API_KEY'));
});

test('storage health tests actual write access and separates writability from durability', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = path.join(os.tmpdir(), 'mindscape-storage-health-test-' + process.pid);
  const historyFile = path.join(dir, 'generation-history.jsonl');
  try {
    const status = getStorageHealth({ GENERATION_HISTORY_FILE: historyFile });
    assert.equal(status.writable, true);
    assert.equal(status.persistent, false);
    assert.equal(status.mode, 'ephemeral');
    assert.equal(status.generated_media_writable, true);
    assert.equal(status.history_writable, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('image fallback stays off unless explicitly configured', () => {
  withEnv({
    IMAGE_PROVIDER: 'google',
    GEMINI_API_KEY: 'test-primary-key',
    REPLICATE_API_TOKEN: 'test-replicate-token',
    IMAGE_FALLBACK_PROVIDER: null,
    IMAGE_FALLBACK_MODEL: null,
    FAL_KEY: null
  }, () => {
    const status = getFallbackReadiness();
    assert.equal(status.image_generation.ready, false);
    const fallback = quotaFallbackJob(
      { type: 'text_to_image', provider: 'google' },
      new Error('Gemini 429: quota exceeded')
    );
    assert.equal(fallback, null);
  });
});

test('explicitly configured Replicate image fallback is selected without checking billing', () => {
  withEnv({
    IMAGE_PROVIDER: 'google',
    GEMINI_API_KEY: 'test-primary-key',
    REPLICATE_API_TOKEN: 'test-replicate-token',
    IMAGE_FALLBACK_PROVIDER: 'replicate',
    IMAGE_FALLBACK_MODEL: 'black-forest-labs/flux-schnell',
    FAL_KEY: null
  }, () => {
    const status = getFallbackReadiness();
    assert.equal(status.image_generation.ready, true);
    assert.equal(status.image_generation.provider, 'replicate');
    assert.equal(status.image_generation.model, 'black-forest-labs/flux-schnell');
    assert.equal(status.image_generation.billing_status, 'not_checked');
    const fallback = quotaFallbackJob(
      { type: 'text_to_image', provider: 'google' },
      new Error('Gemini 429: quota exceeded')
    );
    assert.equal(fallback.provider, 'replicate');
    assert.equal(fallback.model, 'black-forest-labs/flux-schnell');
    assert.equal(JSON.stringify(status).includes('test-replicate-token'), false);
  });
});

test('Replicate submission remains running until the provider reports completion', async () => {
  const oldFetch = global.fetch;
  const oldToken = process.env.REPLICATE_API_TOKEN;
  process.env.REPLICATE_API_TOKEN = 'test-only-token';
  global.fetch = async () => ({
    ok: true,
    status: 201,
    json: async () => ({ id: 'prediction-test-123', status: 'starting' })
  });
  try {
    const job = await submit({
      id: 'replicate-test', provider: 'replicate', model: 'owner/model',
      type: 'text_to_video', prompt: 'offline test', input: { duration: 10 }
    });
    assert.equal(job.status, 'running');
    assert.equal(job.provider_state, 'starting');
    assert.equal(job.providerResponse.id, 'prediction-test-123');
  } finally {
    global.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.REPLICATE_API_TOKEN;
    else process.env.REPLICATE_API_TOKEN = oldToken;
  }
});

test('Pixazo submission preserves provider queue state rather than reporting false completion', async () => {
  const oldFetch = global.fetch;
  const oldKey = process.env.PIXAZO_API_KEY;
  const oldBase = process.env.PUBLIC_BASE_URL;
  process.env.PIXAZO_API_KEY = 'test-only-key';
  process.env.PUBLIC_BASE_URL = 'https://example.invalid';
  global.fetch = async () => ({
    ok: true,
    status: 202,
    text: async () => JSON.stringify({ request_id: 'pixazo-test-request' })
  });
  try {
    const job = await submit({
      id: 'pixazo-test', provider: 'pixazo_ltx', model: 'ltx-video',
      type: 'image_to_video', prompt: 'offline test',
      input: { image: 'https://example.invalid/reference.png', duration: 10, fps: 12 }
    });
    assert.equal(job.status, 'running');
    assert.equal(job.providerResponse.request_id, 'pixazo-test-request');
  } finally {
    global.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.PIXAZO_API_KEY;
    else process.env.PIXAZO_API_KEY = oldKey;
    if (oldBase === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = oldBase;
  }
});
