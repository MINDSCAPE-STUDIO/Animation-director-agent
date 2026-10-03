const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const originalDataDir = process.env.APP_DATA_DIR;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindscape-generation-workflow-'));
process.env.APP_DATA_DIR = dataDir;
const { GenerationQueue } = require('../generation-queue');

test.after(() => {
  if (originalDataDir === undefined) delete process.env.APP_DATA_DIR;
  else process.env.APP_DATA_DIR = originalDataDir;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('accepts image and video jobs with the selected project context', async () => {
  const storeFile = path.join(dataDir, 'generation-queue.json');
  const queue = new GenerationQueue({ storeFile });
  queue.start = async () => null;

  const image = await queue.enqueue({
    type: 'text_to_image',
    project_id: 'shadow-of-innocence',
    project_name: 'Shadow of Innocence',
    prompt: 'A clean character reference sheet',
  });
  const video = await queue.enqueue({
    type: 'image_to_video',
    project_id: 'new-project',
    project_name: 'New Project',
    prompt: 'Animate the approved character reference',
    input: { image: '/var/data/uploads/reference.png', duration: 10 },
  });

  assert.equal(image.status, 'queued');
  assert.equal(image.project_id, 'shadow-of-innocence');
  assert.equal(image.project_name, 'Shadow of Innocence');
  assert.equal(video.status, 'queued');
  assert.equal(video.project_id, 'new-project');
  assert.equal(video.project_name, 'New Project');

  const persisted = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  assert.deepEqual(persisted.map(job => [job.type, job.project_id]), [
    ['text_to_image', 'shadow-of-innocence'],
    ['image_to_video', 'new-project'],
  ]);
});

test('records terminal provider success and failure without losing either job', async () => {
  const storeFile = path.join(dataDir, 'generation-lifecycle.json');
  const queue = new GenerationQueue({
    storeFile,
    submitJob: async job => {
      if (job.prompt.includes('fail this')) throw new Error('Mock provider unavailable');
      return { ...job, status: 'completed', result: { output: '/generated/mock.png' }, providerResponse: { status: 'succeeded' } };
    },
    evaluateJob: async () => ({ model: 'mock-evaluator', findings: [], observations: {}, summary: 'Mock evaluation passed.' }),
  });

  const success = await queue.enqueue({ type: 'text_to_image', prompt: 'Create a production-ready character sheet' });
  const failure = await queue.enqueue({ type: 'text_to_image', prompt: 'fail this request' });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (queue.get(success.id)?.status === 'completed' && queue.get(failure.id)?.status === 'failed') break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }

  assert.equal(queue.get(success.id).status, 'completed');
  assert.equal(queue.get(success.id).result.output, '/generated/mock.png');
  assert.equal(queue.get(failure.id).status, 'failed');
  assert.match(queue.get(failure.id).error, /Mock provider unavailable/);

  const persisted = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  assert.deepEqual(persisted.map(job => job.status), ['completed', 'failed']);
});
