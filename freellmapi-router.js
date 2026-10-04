const base = require('./model-router');
const fs = require('fs');
const path = require('path');

const enabled = () => String(process.env.FREELLMAPI_ENABLED || '').toLowerCase() === 'true' && Boolean(process.env.FREELLMAPI_BASE_URL);
const baseUrl = () => String(process.env.FREELLMAPI_BASE_URL || '').replace(/\/$/, '');
const apiKey = () => process.env.FREELLMAPI_API_KEY || '';

async function freeFetch(endpoint, payload, timeoutMs = 300000) {
  if (!apiKey()) throw new Error('FREELLMAPI_API_KEY is not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl()}${endpoint}`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`FreeLLMAPI ${response.status}: ${text.slice(0, 1500)}`);
    }
    if (contentType.includes('application/json')) return { kind: 'json', body: await response.json(), provider: response.headers.get('x-provider') || null, model: response.headers.get('x-model') || null };
    return { kind: 'binary', body: Buffer.from(await response.arrayBuffer()), contentType, provider: response.headers.get('x-provider') || null, model: response.headers.get('x-model') || null, fallbackAttempts: response.headers.get('x-fallback-attempts') || null };
  } finally { clearTimeout(timer); }
}

function mediaUrl(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return mediaUrl(value[0]);
  if (typeof value === 'object') return value.url || value.video_url || value.path || value.b64_json || mediaUrl(value.data) || mediaUrl(value.output);
  return null;
}

async function persistMedia(result, job, kind) {
  const dir = path.join(__dirname, 'generated');
  fs.mkdirSync(dir, { recursive: true });
  const extension = kind === 'video' ? 'mp4' : (result.contentType || '').includes('webp') ? 'webp' : (result.contentType || '').includes('jpeg') ? 'jpg' : 'png';
  const filename = `mindscape-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const file = path.join(dir, filename);
  if (result.kind === 'binary') {
    fs.writeFileSync(file, result.body);
  } else {
    const value = mediaUrl(result.body);
    if (!value) throw new Error(`FreeLLMAPI ${kind} response contained no media output: ${JSON.stringify(result.body).slice(0, 1600)}`);
    if (value.startsWith('data:')) {
      const base64 = value.split(',', 2)[1];
      fs.writeFileSync(file, Buffer.from(base64, 'base64'));
    } else if (/^https?:\/\//i.test(value)) {
      const r = await fetch(value);
      if (!r.ok) throw new Error(`FreeLLMAPI media download failed: ${r.status}`);
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    } else if (fs.existsSync(value)) {
      fs.copyFileSync(value, file);
    } else {
      throw new Error(`FreeLLMAPI returned an inaccessible media reference: ${String(value).slice(0, 500)}`);
    }
  }
  return { output: `/generated/${filename}`, provider: result.provider || 'freellmapi', model: result.model || null, fallbackAttempts: result.fallbackAttempts || null, localFile: file };
}

function modelFor(job, kind) {
  return kind === 'video'
    ? (process.env.FREELLMAPI_VIDEO_MODEL || 'auto')
    : (process.env.FREELLMAPI_IMAGE_MODEL || 'auto');
}

function selectModel(job) {
  if (!enabled()) return base.selectModel(job);
  if (job.type === 'text_to_image' || job.type === 'image_to_image') return { provider: 'freellmapi', model: modelFor(job, 'image') };
  if (job.type === 'text_to_video' || job.type === 'image_to_video') return { provider: 'freellmapi', model: modelFor(job, 'video') };
  return base.selectModel(job);
}

async function submit(job) {
  if (!enabled()) return base.submit(job);
  const isImage = job.type === 'text_to_image' || job.type === 'image_to_image';
  const isVideo = job.type === 'text_to_video' || job.type === 'image_to_video';
  if (!isImage && !isVideo) return base.submit(job);

  const input = { ...(job.input || {}) };
  const payload = {
    model: modelFor(job, isVideo ? 'video' : 'image'),
    prompt: job.prompt,
    ...(isImage ? {
      n: 1,
      size: input.aspect_ratio === '16:9' ? '1792x1024' : input.aspect_ratio === '9:16' ? '1024x1792' : '1024x1024',
      response_format: 'url'
    } : {
      duration: Math.max(1, Math.min(300, Number(input.duration) || 10)),
      aspect_ratio: input.aspect_ratio || '16:9',
      fps: Number(input.fps) || 12
    })
  };
  if (input.image) payload.image = input.image;
  if (Array.isArray(input.images) && input.images.length) payload.images = input.images;

  const result = await freeFetch(isImage ? '/v1/images/generations' : '/v1/videos/generations', payload, isVideo ? 300000 : 120000);
  const media = await persistMedia(result, job, isVideo ? 'video' : 'image');
  return { ...job, status: 'completed', providerResponse: media, result: media.output, submittedAt: new Date().toISOString() };
}

async function refresh(job) { return job.provider === 'freellmapi' ? job : base.refresh(job); }

module.exports = { ...base, selectModel, submit, refresh };
