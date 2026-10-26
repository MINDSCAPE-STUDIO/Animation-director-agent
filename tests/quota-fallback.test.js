const test = require('node:test');
const assert = require('node:assert/strict');
const { quotaFallbackJob } = require('../model-router');

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
  withEnv({ PIXAZO_API_KEY: 'test-only-placeholder', FAL_KEY: null }, () => {
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
