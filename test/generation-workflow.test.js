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
