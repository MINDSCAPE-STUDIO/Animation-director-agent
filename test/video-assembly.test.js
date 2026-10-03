'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { concatVideos, probeMp4Duration } = require('../model-router');

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

test('reads ISO BMFF movie duration metadata without FFmpeg', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindscape-mp4-duration-'));
  const file = path.join(dir, 'metadata.mp4');
  try {
    const fullBox = Buffer.alloc(20);
    fullBox.writeUInt32BE(1000, 12);
    fullBox.writeUInt32BE(7250, 16);
    const mvhd = Buffer.concat([Buffer.alloc(4), Buffer.from('mvhd'), fullBox]);
    const moov = Buffer.concat([Buffer.alloc(8), mvhd]);
    moov.writeUInt32BE(moov.length, 0);
    moov.write('moov', 4);
    fs.writeFileSync(file, moov);
    assert.equal(probeMp4Duration(file), 7.25);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
