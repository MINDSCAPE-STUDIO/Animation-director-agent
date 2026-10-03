const test = require('node:test');
const assert = require('node:assert/strict');
const outputUrl = require('../media-output');
const { isAuthorized, validateProductionConfig } = require('../access-control');

const originalHfImageSpace = process.env.HF_IMAGE_SPACE_NAME;
const originalHfVideoSpace = process.env.HF_SPACE_NAME;
process.env.HF_IMAGE_SPACE_NAME = 'org/image-space';
process.env.HF_SPACE_NAME = 'org/video-space';
const { selectModel, submit, refresh } = require('../model-router');
if (originalHfImageSpace === undefined) delete process.env.HF_IMAGE_SPACE_NAME;
else process.env.HF_IMAGE_SPACE_NAME = originalHfImageSpace;
if (originalHfVideoSpace === undefined) delete process.env.HF_SPACE_NAME;
else process.env.HF_SPACE_NAME = originalHfVideoSpace;

function withEnvironment(values, run) {
  const previous = Object.fromEntries(
    Object.keys(values).map(key => [key, process.env[key]])
  );

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('selects the configured Google image model', () => {
  withEnvironment({ IMAGE_PROVIDER: 'google', IMAGE_MODEL: 'gemini-image-test' }, () => {
    assert.deepEqual(selectModel({ type: 'text_to_image' }), {
      provider: 'google',
      model: 'gemini-image-test'
    });
  });
});

test('selects the configured Hugging Face image Space', () => {
  withEnvironment({ IMAGE_PROVIDER: 'hf_space' }, () => {
    assert.deepEqual(selectModel({ type: 'text_to_image' }), {
      provider: 'hf_image',
      model: 'org/image-space'
    });
  });
});

test('selects the configured Hugging Face video Space', () => {
  withEnvironment({ VIDEO_PROVIDER: 'hf_space' }, () => {
    assert.deepEqual(selectModel({ type: 'image_to_video' }), {
      provider: 'hf_space',
      model: 'org/video-space'
    });
  });
});

test('selects the configured Fal video model', () => {
  withEnvironment({ VIDEO_PROVIDER: 'fal', VIDEO_MODEL: 'fal/video-model' }, () => {
    assert.deepEqual(selectModel({ type: 'text_to_video' }), {
      provider: 'fal',
      model: 'fal/video-model'
    });
  });
});

test('defaults video jobs to Replicate when no video provider is selected', () => {
  withEnvironment({ VIDEO_PROVIDER: undefined, VIDEO_MODEL: undefined }, () => {
    assert.deepEqual(selectModel({ type: 'text_to_video' }), {
      provider: 'replicate',
      model: 'bytedance/seedance-1-pro-fast'
    });
  });
});

test('finds a media URL inside common nested provider result shapes', () => {
  assert.equal(outputUrl([{ video: { url: 'https://example.test/clip.mp4' } }]), 'https://example.test/clip.mp4');
  assert.equal(outputUrl({ data: { images: [{ url: 'https://example.test/image.png' }] } }), 'https://example.test/image.png');
  assert.equal(outputUrl({ output: '/generated/asset.png' }), '/generated/asset.png');
  assert.equal(outputUrl({ status: 'completed' }), null);
});

test('requires a matching bearer token when access control is configured', () => {
  assert.equal(isAuthorized(undefined, 'studio-token'), false);
  assert.equal(isAuthorized('Bearer wrong-token', 'studio-token'), false);
  assert.equal(isAuthorized('Bearer studio-token', 'studio-token'), true);
  assert.equal(isAuthorized(undefined, undefined), true);
  assert.throws(() => validateProductionConfig({ NODE_ENV: 'production' }), /APP_ACCESS_TOKEN/);
  assert.doesNotThrow(() => validateProductionConfig({ NODE_ENV: 'production', APP_ACCESS_TOKEN: 'configured' }));
});

function withMockFetch(responses, run) {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    const response = responses.shift();
    if (!response) throw new Error('Unexpected fetch request');
    return {
      ok: response.ok !== false,
      status: response.status || 200,
      json: async () => response.body,
      text: async () => JSON.stringify(response.body)
    };
  };
  return Promise.resolve().then(() => run(calls)).finally(() => {
    global.fetch = originalFetch;
  });
}

test('keeps Replicate submissions running until polling returns a result', async () => {
  const oldToken = process.env.REPLICATE_API_TOKEN;
  process.env.REPLICATE_API_TOKEN = 'test-token';
  try {
    await withMockFetch([
      { body: { id: 'prediction-1', status: 'starting' } },
      { body: { id: 'prediction-1', status: 'succeeded', output: ['https://example.test/video.mp4'] } }
    ], async calls => {
      const submitted = await submit({ id: 'job-1', provider: 'replicate', model: 'owner/model', input: {}, prompt: 'test' });
      assert.equal(submitted.status, 'running');
      assert.equal(submitted.result, null);
      const completed = await refresh(submitted);
      assert.equal(completed.status, 'completed');
      assert.deepEqual(completed.result, ['https://example.test/video.mp4']);
      assert.match(calls[1].url, /\/predictions\/prediction-1$/);
    });
  } finally {
    if (oldToken === undefined) delete process.env.REPLICATE_API_TOKEN;
    else process.env.REPLICATE_API_TOKEN = oldToken;
  }
});

test('polls fal status and fetches the result only after completion', async () => {
  const oldKey = process.env.FAL_KEY;
  process.env.FAL_KEY = 'test-key';
  try {
    await withMockFetch([
      { body: { request_id: 'request-1' } },
      { body: { status: 'IN_PROGRESS' } },
      { body: { status: 'COMPLETED' } },
      { body: { video: { url: 'https://example.test/video.mp4' } } }
    ], async calls => {
      const submitted = await submit({ id: 'job-2', provider: 'fal', model: 'fal-ai/video-model', input: {}, prompt: 'test' });
      assert.equal(submitted.status, 'running');
      const running = await refresh(submitted);
      assert.equal(running.status, 'running');
      const completed = await refresh(running);
      assert.equal(completed.status, 'completed');
      assert.deepEqual(completed.result, { video: { url: 'https://example.test/video.mp4' } });
      assert.equal(calls.length, 4);
      assert.match(calls[1].url, /requests\/request-1\/status$/);
      assert.match(calls[3].url, /requests\/request-1$/);
    });
  } finally {
    if (oldKey === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = oldKey;
  }
});
