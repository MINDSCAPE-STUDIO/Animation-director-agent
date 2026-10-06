const fs = require('fs');
const base = require('./model-router');
const { assertI2VCapability } = require('./omniroute-capabilities');

const enabled = () =>
  String(process.env.OMNIROUTE_ENABLED || '').toLowerCase() === 'true' &&
  Boolean(process.env.OMNIROUTE_BASE_URL);

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

  if (!response.ok) {
    throw new Error(
      `OmniRoute ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`
    );
  }

  return body;
}

function omniModel(job) {
  if (job.type === 'image_to_video') {
    const model = process.env.OMNIROUTE_I2V_MODEL || process.env.OMNIROUTE_VIDEO_MODEL || '';
    if (!model) {
      throw new Error(
        'OMNIROUTE_I2V_MODEL is not configured. Refusing to send image-to-video jobs to an unverified auto model.'
      );
    }
    assertI2VCapability(model);
    return model;
  }

  if (job.type === 'text_to_video') {
    return process.env.OMNIROUTE_T2V_MODEL || process.env.OMNIROUTE_VIDEO_MODEL || 'auto';
  }

  if (job.type === 'video_understanding') {
    return process.env.OMNIROUTE_VISION_MODEL || process.env.VISION_MODEL || 'auto';
  }

  return process.env.OMNIROUTE_IMAGE_MODEL || process.env.IMAGE_MODEL || 'auto';
}

function selectModel(job) {
  if (!enabled()) return base.selectModel(job);
  return { provider: 'omniroute', model: omniModel(job) };
}

function normalizeMediaResponse(response, kind) {
  const item =
    response?.data?.[0] ||
    response?.output?.[0] ||
    response?.output ||
    response?.image ||
    response?.video ||
    response;

  const url = typeof item === 'string'
    ? item
    : item?.url || item?.video_url || item?.uri || item?.path || item?.b64_json;

  if (!url) {
    throw new Error(
      `OmniRoute ${kind} response contained no media reference: ${JSON.stringify(response).slice(0, 1600)}`
    );
  }

  return {
    output: url,
    provider: 'omniroute',
    model: response?.model || null,
    raw: response
  };
}

function imageReferenceToDataUrl(image) {
  if (!image) return null;
  if (typeof image !== 'string') return null;
  if (/^data:image\//i.test(image) || /^https?:\/\//i.test(image)) return image;

  if (fs.existsSync(image)) {
    const ext = image.toLowerCase().endsWith('.png')
      ? 'png'
      : image.toLowerCase().endsWith('.webp')
        ? 'webp'
        : 'jpeg';

    return `data:image/${ext};base64,${fs.readFileSync(image).toString('base64')}`;
  }

  return image;
}

function buildVideoPayload(job) {
  const input = { ...(job.input || {}) };

  if (job.type === 'image_to_video') {
    const image = imageReferenceToDataUrl(input.image || input.images?.[0]);

    if (!image) {
      throw new Error('Image-to-video generation requires a reference image.');
    }

    return {
      model: omniModel(job),
      prompt: job.prompt,
      size: input.aspect_ratio || '16:9',
      duration: Number(input.duration) || 10,
      fps: Number(input.fps) || 12,
      image
    };
  }

  return {
    model: omniModel(job),
    prompt: job.prompt,
    size: input.aspect_ratio || '16:9',
    duration: Number(input.duration) || 10,
    fps: Number(input.fps) || 12
  };
}

async function submitOmni(job) {
  const isVideo = job.type === 'text_to_video' || job.type === 'image_to_video';
  const isImage = job.type === 'text_to_image' || job.type === 'image_to_image';

  if (!isVideo && !isImage) return base.submit(job);

  const input = { ...(job.input || {}) };

  const payload = isImage
    ? {
        model: omniModel(job),
        prompt: job.prompt,
        n: 1,
        size: input.aspect_ratio === '16:9'
          ? '1792x1024'
          : input.aspect_ratio === '9:16'
            ? '1024x1792'
            : '1024x1024',
        response_format: 'url'
      }
    : buildVideoPayload(job);

  if (isImage) {
    const image = imageReferenceToDataUrl(input.image || input.images?.[0]);
    if (image) payload.image = image;
  }

  const response = await omniFetch(
    isImage ? '/v1/images/generations' : '/v1/videos/generations',
    { method: 'POST', body: JSON.stringify(payload) }
  );

  const normalized = normalizeMediaResponse(response, isImage ? 'image' : 'video');

  // OmniRoute's compatibility endpoint is synchronous from the caller's
  // perspective when it returns a media reference. Do not manufacture a
  // completed state unless a real media reference was returned.
  return {
    ...job,
    status: 'completed',
    providerResponse: normalized,
    result: normalized.output,
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
