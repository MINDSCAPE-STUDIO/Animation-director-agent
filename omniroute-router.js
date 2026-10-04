const base = require('./model-router');

const enabled = () => String(process.env.OMNIROUTE_ENABLED || '').toLowerCase() === 'true' && Boolean(process.env.OMNIROUTE_BASE_URL);
const baseUrl = () => String(process.env.OMNIROUTE_BASE_URL || '').replace(/\/$/, '');

async function omniFetch(path, options = {}) {
  const key = process.env.OMNIROUTE_API_KEY;
  if (!key) throw new Error('OMNIROUTE_API_KEY is not configured');
  const response = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) throw new Error(`OmniRoute ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  return body;
}

function omniModel(job) {
  if (job.type === 'text_to_video' || job.type === 'image_to_video') {
    return process.env.OMNIROUTE_VIDEO_MODEL || process.env.VIDEO_MODEL || 'auto';
  }
  if (job.type === 'video_understanding') return process.env.OMNIROUTE_VISION_MODEL || process.env.VISION_MODEL || 'auto';
  return process.env.OMNIROUTE_IMAGE_MODEL || process.env.IMAGE_MODEL || 'auto';
}

function selectModel(job) {
  if (!enabled()) return base.selectModel(job);
  return { provider: 'omniroute', model: omniModel(job) };
}

function normalizeImageResponse(response) {
  const item = response?.data?.[0] || response?.output?.[0] || response?.output || response?.image || response;
  const url = typeof item === 'string' ? item : item?.url || item?.b64_json || item?.path;
  if (!url) throw new Error(`OmniRoute image response contained no media URL: ${JSON.stringify(response).slice(0, 1200)}`);
  return { output: url, provider: 'omniroute', model: response?.model || null, raw: response };
}

function normalizeVideoResponse(response) {
  const item = response?.data?.[0] || response?.output?.[0] || response?.output || response;
  const url = typeof item === 'string' ? item : item?.url || item?.video_url || item?.path;
  if (!url) throw new Error(`OmniRoute video response contained no media URL: ${JSON.stringify(response).slice(0, 1200)}`);
  return { output: url, provider: 'omniroute', model: response?.model || null, raw: response };
}

async function submitOmni(job) {
  const isVideo = job.type === 'text_to_video' || job.type === 'image_to_video';
  const isImage = job.type === 'text_to_image' || job.type === 'image_to_image';
  if (!isVideo && !isImage) return base.submit(job);

  const input = { ...(job.input || {}) };
  const payload = {
    model: omniModel(job),
    prompt: job.prompt,
    ...(isImage ? {
      n: 1,
      size: input.aspect_ratio === '16:9' ? '1792x1024' : input.aspect_ratio === '9:16' ? '1024x1792' : '1024x1024',
      response_format: 'url'
    } : {
      size: input.aspect_ratio || '16:9',
      duration: Number(input.duration) || 10,
      fps: Number(input.fps) || 12
    })
  };

  if (input.image) payload.image = input.image;
  if (Array.isArray(input.images) && input.images.length) payload.images = input.images;

  const response = await omniFetch(isImage ? '/v1/images/generations' : '/v1/videos/generations', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return {
    ...job,
    status: 'completed',
    providerResponse: isImage ? normalizeImageResponse(response) : normalizeVideoResponse(response),
    result: isImage ? normalizeImageResponse(response).output : normalizeVideoResponse(response).output,
    submittedAt: new Date().toISOString()
  };
}

async function submit(job) {
  if (!enabled()) return base.submit(job);
  return submitOmni(job);
}

async function refresh(job) {
  if (!enabled() || job.provider !== 'omniroute') return base.refresh(job);
  return job;
}

module.exports = {
  ...base,
  selectModel,
  submit,
  refresh
};
