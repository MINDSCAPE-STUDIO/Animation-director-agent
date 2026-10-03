const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { downloadProviderMedia, persistProviderMedia } = require('../media-persistence');

test('copies allowed Replicate and fal media URLs into generated storage', async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindscape-provider-media-'));
  const content = Buffer.from('mock-media-bytes');
  const fetchImpl = async () => new Response(content, { headers: { 'content-type': 'image/png', 'content-length': String(content.length) } });
  try {
    const saved = await persistProviderMedia({ images: ['https://pbxt.replicate.delivery/out/image.png'] }, {
      provider: 'replicate', jobId: 'job/1', outputDir, fetchImpl,
    });
    assert.match(saved.result.images[0], /^\/generated\/mindscape-replicate-job_1-[a-f0-9]+\.png$/);
    assert.equal(saved.warning, null);
    assert.deepEqual(fs.readFileSync(path.join(outputDir, path.basename(saved.result.images[0]))), content);

    const video = await downloadProviderMedia('https://v3b.fal.media/files/clip.mp4', {
      provider: 'fal', jobId: 'job-2', outputDir,
      fetchImpl: async () => new Response(content, { headers: { 'content-type': 'video/mp4' } }),
    });
    assert.match(video, /^\/generated\/mindscape-fal-job-2-[a-f0-9]+\.mp4$/);
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});

test('does not fetch untrusted or oversized provider output URLs', async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindscape-provider-media-reject-'));
  let calls = 0;
  try {
    const unknownHost = await persistProviderMedia('https://attacker.example/asset.png', {
      provider: 'replicate', jobId: 'job-3', outputDir, fetchImpl: async () => { calls += 1; throw Error('should not fetch'); },
    });
    assert.equal(unknownHost.result, 'https://attacker.example/asset.png');
    assert.match(unknownHost.warning, /untrusted_media_host/);
    assert.equal(calls, 0);

    await assert.rejects(downloadProviderMedia('https://replicate.delivery/too-large.png', {
      provider: 'replicate', jobId: 'job-4', outputDir, maxBytes: 4,
      fetchImpl: async () => new Response(Buffer.from('12345'), { headers: { 'content-type': 'image/png' } }),
    }), /media_too_large/);
    assert.equal(fs.readdirSync(outputDir).length, 0);
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});
