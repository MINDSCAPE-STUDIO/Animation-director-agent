const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const outputUrl = require('../media-output');
const { isAuthorized, validateProductionConfig } = require('../access-control');

const originalHfImageSpace = process.env.HF_IMAGE_SPACE_NAME;
const originalHfVideoSpace = process.env.HF_SPACE_NAME;
process.env.HF_IMAGE_SPACE_NAME = 'org/image-space';
process.env.HF_SPACE_NAME = 'org/video-space';
const { selectModel, validateGenerationInput, submit, refresh } = require('../model-router');
const { GenerationQueue } = require('../generation-queue');
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

test('rejects unsupported generation types and empty directions before routing', () => {
  assert.throws(() => validateGenerationInput({ type: 'unknown', prompt: 'A scene' }), error => error.statusCode === 400 && error.code === 'invalid_generation_request');
  assert.throws(() => validateGenerationInput({ type: 'text_to_image', prompt: '  ' }), /non-empty prompt or structured shot direction/);
});

test('requires reference images for image-driven generation', () => {
  assert.throws(() => validateGenerationInput({ type: 'image_to_video', prompt: 'Animate a scene' }), /requires a reference image/);
  assert.throws(() => validateGenerationInput({ type: 'image_to_image', prompt: 'Restyle this image' }), /requires a reference image/);
});

test('accepts the dashboard structured shot when an image-to-video reference is present', () => {
  const job = validateGenerationInput({ type: 'image_to_video', shot: { character: 'Kai', action: 'walks toward camera' }, input: { image: '/uploads/reference.png' } });
  assert.equal(job.type, 'image_to_video');
});
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

test('reports missing credentials instead of leaving accepted provider jobs running forever', async () => {
  const oldReplicateToken = process.env.REPLICATE_API_TOKEN;
  const oldFalKey = process.env.FAL_KEY;
  delete process.env.REPLICATE_API_TOKEN;
  delete process.env.FAL_KEY;
  try {
    await assert.rejects(refresh({ provider: 'replicate', providerResponse: { id: 'prediction-1' } }), /REPLICATE_API_TOKEN is not configured/);
    await assert.rejects(refresh({ provider: 'fal', model: 'fal-ai/video-model', providerResponse: { request_id: 'request-1' } }), /FAL_KEY is not configured/);
  } finally {
    if (oldReplicateToken === undefined) delete process.env.REPLICATE_API_TOKEN;
    else process.env.REPLICATE_API_TOKEN = oldReplicateToken;
    if (oldFalKey === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = oldFalKey;
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

test('persists completed jobs atomically without storing inline image bytes', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mindscape-queue-test-'));
  const storeFile = path.join(directory, 'generation-queue.json');
  try {
    const queue = new GenerationQueue({ storeFile });
    queue.setJob({
      id: 'completed-job',
      status: 'completed',
      createdAt: '2026-10-03T00:00:00.000Z',
      input: { imageData: 'data:image/png;base64,PRIVATE_TEST_BYTES', image: 'data:image/png;base64,PRIVATE_TEST_BYTES' },
      result: { output: '/generated/asset.png' }
    });
    const storedText = fs.readFileSync(storeFile, 'utf8');
    const stored = JSON.parse(storedText)[0];
    assert.equal(stored.input.imageData, undefined);
    assert.equal(stored.input.image, '[omitted-image-data]');
    assert.equal(storedText.includes('PRIVATE_TEST_BYTES'), false);
    const restarted = new GenerationQueue({ storeFile });
    assert.equal(restarted.get('completed-job').status, 'completed');
    assert.equal(restarted.get('completed-job').result.output, '/generated/asset.png');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('resumes provider-backed jobs after restart and fails ambiguous in-flight jobs safely', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mindscape-queue-recovery-test-'));
  const storeFile = path.join(directory, 'generation-queue.json');
  try {
    const queue = new GenerationQueue({ storeFile });
    queue.setJob({ id: 'remote-job', status: 'running', provider: 'replicate', providerResponse: { id: 'prediction-1' }, createdAt: '2026-10-03T00:00:00.000Z' });
    queue.setJob({ id: 'ambiguous-job', status: 'running', provider: 'hf_space', createdAt: '2026-10-03T00:00:01.000Z' });
    const restarted = new GenerationQueue({ storeFile });
    assert.equal(restarted.get('remote-job').status, 'running');
    assert.equal(restarted.get('ambiguous-job').status, 'failed');
    assert.equal(restarted.get('ambiguous-job').provider_state, 'server_restart');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('coalesces concurrent refresh requests for the same job', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mindscape-queue-poll-test-'));
  try {
    const queue = new GenerationQueue({ storeFile: path.join(directory, 'generation-queue.json') });
    queue.setJob({ id: 'remote-job', status: 'running', provider: 'replicate', providerResponse: { id: 'prediction-1' }, createdAt: '2026-10-03T00:00:00.000Z' });
    let polls = 0;
    queue.refreshJob = async id => {
      polls += 1;
      await new Promise(resolve => setTimeout(resolve, 10));
      return queue.get(id);
    };
    await Promise.all([queue.refresh('remote-job'), queue.refresh('remote-job')]);
    assert.equal(polls, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
