'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { concatVideos } = require('../model-router');

test('copies a single video segment without starting a transcoder', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindscape-video-assembly-'));
  const segment = path.join(dir, 'segment.mp4');
  const output = path.join(dir, 'output.mp4');
  const bytes = Buffer.from('video-segment');
  try {
    fs.writeFileSync(segment, bytes);
    await concatVideos([segment], output);
    assert.deepEqual(fs.readFileSync(output), bytes);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
