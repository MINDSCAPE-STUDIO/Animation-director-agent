const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Isolate all filesystem state before any project module resolves storage paths.
const STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qwencloud-provider-test-'));
process.env.PERSISTENT_STORAGE_DIR = STORAGE_DIR;
process.env.QWEN_CLOUD_API_KEY = 'test-only-placeholder';
process.env.QWEN_VIDEO_POLL_INTERVAL_MS = '0';
process.env.PROVIDER_POLL_INTERVAL_MS = '10';

const { submitQwenCloud, refreshQwenCloud } = require('../qwencloud-video-provider');
const { GenerationQueue } = require('../generation-queue');
const MODEL_PERFORMANCE_FILE = path.join(__dirname, '..', 'data', 'model-performance.jsonl');
const hadModelPerformanceFile = fs.existsSync(MODEL_PERFORMANCE_FILE);

async function withEnv(values, run) {
  const before = {};
  for (const [key, value] of Object.entries(values)) {
    before[key] = Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined;
    if (value === null || value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => Uint8Array.from(JSON.stringify(body)).buffer
  };
}

function videoResponse(bytes) {
  return {
    ok: true,
    status: 200,
    text: async () => '',
    arrayBuffer: async () => Uint8Array.from(bytes).buffer
  };
}

let handler = () => null;
const calls = [];
const realFetch = global.fetch;
global.fetch = async (url, options = {}) => {
  const target = String(url);
  calls.push({ url: target, method: options.method || 'GET' });
  const response = handler(target, options);
  if (!response) throw new Error(`Unexpected fetch in test: ${target}`);
  return response;
};

async function waitFor(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return null;
}

const baseJob = {
  id: 'job_unit',
  type: 'text_to_video',
  provider: 'qwencloud',
  status: 'running',
  prompt: 'A lantern drifting over dark water',
  input: { duration: 5, aspect_ratio: '16:9' },
  providerResponse: { task_id: 'task-123', model: 'wan2.7-t2v', duration: 5, resolution: '720P' },
  submittedAt: new Date().toISOString()
};

test('submitQwenCloud submits the task and returns a running job without waiting for the result', async () => {
  calls.length = 0;
  handler = url => url.includes('/video-synthesis')
    ? jsonResponse({ output: { task_id: 'task-123' } })
    : null;
  const submitted = await submitQwenCloud({
    ...baseJob,
    status: 'queued',
    input: { duration: 5, resolution: '1080p', aspect_ratio: '16:9' },
    providerResponse: undefined
  });
  assert.equal(submitted.status, 'running');
  assert.equal(submitted.provider_state, 'provider_queue');
  assert.equal(submitted.providerResponse.task_id, 'task-123');
  assert.equal(submitted.providerResponse.model, 'wan2.7-t2v');
  assert.equal(submitted.providerResponse.resolution, '1080P');
  assert.ok(submitted.submittedAt);
  assert.equal(calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(calls.filter(call => call.url.includes('/tasks/')).length, 0);
});

test('submitQwenCloud rejects a submission response without task_id', async () => {
  handler = () => jsonResponse({ output: {} });
  await assert.rejects(
    () => submitQwenCloud({ ...baseJob, status: 'queued', providerResponse: undefined }),
    /returned no task_id/
  );
});

test('submitQwenCloud requires a reference image for image-to-video jobs', async () => {
  handler = () => null;
  await assert.rejects(
    () => submitQwenCloud({ ...baseJob, type: 'image_to_video', input: {}, providerResponse: undefined }),
    /requires a reference image/
  );
});

test('refreshQwenCloud keeps the job running while the provider task is pending', async () => {
  calls.length = 0;
  handler = url => url.endsWith('/tasks/task-123')
    ? jsonResponse({ output: { task_status: 'PENDING' } })
    : null;
  const next = await refreshQwenCloud(baseJob);
  assert.equal(next.status, 'running');
  assert.equal(next.provider_state, 'pending');
  assert.equal(typeof next.providerResponse.polledAt, 'number');
  assert.equal(calls.length, 1);
});

test('refreshQwenCloud throttles provider status polling between intervals', async () => {
  calls.length = 0;
  handler = url => url.endsWith('/tasks/task-123')
    ? jsonResponse({ output: { task_status: 'RUNNING' } })
    : null;
  await withEnv({ QWEN_VIDEO_POLL_INTERVAL_MS: '60000' }, async () => {
    const job = { ...baseJob, providerResponse: { ...baseJob.providerResponse, polledAt: Date.now() } };
    const next = await refreshQwenCloud(job);
    assert.equal(next, job);
    assert.equal(calls.length, 0);
  });
});

test('refreshQwenCloud completes the job and caches the video locally', async () => {
  calls.length = 0;
  const videoBytes = Buffer.alloc(4096, 7);
  handler = url => {
    if (url.endsWith('/tasks/task-123')) {
      return jsonResponse({
        output: {
          task_status: 'SUCCEEDED',
          video_url: 'https://cdn.test/video.mp4',
          usage: { output_video_duration: 5 }
        }
      });
    }
    if (url === 'https://cdn.test/video.mp4') return videoResponse(videoBytes);
    return null;
  };
  const next = await refreshQwenCloud(baseJob);
  assert.equal(next.status, 'completed');
  assert.equal(next.provider_state, 'completed');
  assert.ok(next.result.startsWith('/generated/mindscape-qwen-'), next.result);
  assert.ok(next.result.endsWith('.mp4'));
  const file = path.join(STORAGE_DIR, 'generated', path.basename(next.result));
  assert.ok(fs.existsSync(file));
  assert.equal(fs.statSync(file).size, 4096);
  assert.equal(next.bytes, 4096);
  assert.equal(next.duration, 5);
  assert.equal(next.resolution, '720P');
});

test('refreshQwenCloud marks the job failed when the provider task fails', async () => {
  handler = url => url.endsWith('/tasks/task-123')
    ? jsonResponse({ output: { task_status: 'FAILED', message: 'content policy violation' } })
    : null;
  const next = await refreshQwenCloud(baseJob);
  assert.equal(next.status, 'failed');
  assert.equal(next.provider_state, 'failed');
  assert.equal(next.error, 'QwenCloud task FAILED: content policy violation');
});

test('refreshQwenCloud leaves jobs without a task_id untouched', async () => {
  handler = () => null;
  const job = { ...baseJob, providerResponse: {} };
  assert.equal(await refreshQwenCloud(job), job);
});

test('GenerationQueue runs a QwenCloud job asynchronously through submit and poll', async () => {
  calls.length = 0;
  let taskResponse = { output: { task_status: 'PENDING' } };
  const videoBytes = Buffer.alloc(2048, 3);
  handler = url => {
    if (url.includes('/video-synthesis')) return jsonResponse({ output: { task_id: 'task-queue' } });
    if (url.endsWith('/tasks/task-queue')) return jsonResponse(taskResponse);
    if (url === 'https://cdn.test/queue.mp4') return videoResponse(videoBytes);
    return null;
  };
  const queue = new GenerationQueue();
  const job = await queue.enqueue({ type: 'text_to_video', prompt: 'A paper boat crossing a dark lake', input: { duration: 5 } });
  assert.equal(job.provider, 'qwencloud');
  assert.equal(job.status, 'queued');

  // The queue must reach a running state while the provider task is still pending.
  const running = await waitFor(() => {
    const current = queue.get(job.id);
    return current && current.status === 'running' && current.providerResponse?.task_id === 'task-queue' ? current : null;
  });
  assert.ok(running, 'job should be running after submission without waiting for provider completion');
  assert.ok(!running.result);
  assert.ok(calls.some(call => call.method === 'POST' && call.url.includes('/video-synthesis')));

  taskResponse = {
    output: {
      task_status: 'SUCCEEDED',
      video_url: 'https://cdn.test/queue.mp4',
      usage: { output_video_duration: 5 }
    }
  };
  const completed = await waitFor(() => {
    const current = queue.get(job.id);
    return current && current.status === 'completed' ? current : null;
  });
  assert.ok(completed, 'job should complete after the provider task succeeds');
  assert.ok(completed.result.startsWith('/generated/mindscape-qwen-'));
  const file = path.join(STORAGE_DIR, 'generated', path.basename(completed.result));
  assert.ok(fs.existsSync(file));
  assert.equal(fs.statSync(file).size, 2048);
});

test('refreshQwenCloud is wired into the queue refresh dispatch', async () => {
  calls.length = 0;
  handler = url => url.endsWith('/tasks/task-123')
    ? jsonResponse({ output: { task_status: 'RUNNING' } })
    : null;
  const queue = new GenerationQueue();
  const next = await queue.refreshJob({ ...baseJob });
  assert.equal(next.provider_state, 'running');
  assert.equal(calls.length, 1);
});

after(() => {
  global.fetch = realFetch;
  fs.rmSync(STORAGE_DIR, { recursive: true, force: true });
  if (!hadModelPerformanceFile && fs.existsSync(MODEL_PERFORMANCE_FILE)) {
    fs.rmSync(MODEL_PERFORMANCE_FILE, { force: true });
  }
});
