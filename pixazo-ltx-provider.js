const fs = require('fs');
const path = require('path');
const { GENERATED_DIR } = require('./storage-paths');
const { persistGeneratedFile } = require('./object-storage');

const PIXAZO_BASE_URL = String(process.env.PIXAZO_BASE_URL || 'https://gateway.pixazo.ai').replace(/\/$/, '');
const PIXAZO_I2V_ENDPOINT = process.env.PIXAZO_I2V_ENDPOINT || '/ltx-video/v1/image-to-video';
const PIXAZO_STATUS_BASE = process.env.PIXAZO_STATUS_BASE || '/v2/requests/status';
const PIXAZO_MODEL = process.env.PIXAZO_MODEL || 'ltx-video';

function key() {
  if (!process.env.PIXAZO_API_KEY) throw Error('PIXAZO_API_KEY is not configured');
  return process.env.PIXAZO_API_KEY;
}

function publicBaseUrl() {
  const value = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (!value) throw Error('PUBLIC_BASE_URL is required for Pixazo Image → Video when the input image is a local file');
  return value;
}

async function imageUrl(image) {
  if (!image) throw Error('Pixazo Image → Video requires a reference image.');
  if (/^https:\/\//i.test(image)) return image;
  if (/^data:image\//i.test(image)) {
    const match = image.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
    if (!match) throw Error('Pixazo requires a publicly accessible HTTPS reference image; unsupported data URL format.');
    const ext = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase();
    const filename = `pixazo-input-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const dir = GENERATED_DIR;
    fs.mkdirSync(dir, { recursive: true });
    const localFile = path.join(dir, filename);
    fs.writeFileSync(localFile, Buffer.from(match[2], 'base64'));
    await persistGeneratedFile(localFile);
    return `${publicBaseUrl()}/generated/${filename}`;
  }
  if (fs.existsSync(image)) {
    const ext = path.extname(image).toLowerCase() || '.png';
    const filename = `pixazo-input-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const dir = GENERATED_DIR;
    fs.mkdirSync(dir, { recursive: true });
    const localFile = path.join(dir, filename);
    fs.copyFileSync(image, localFile);
    await persistGeneratedFile(localFile);
    return `${publicBaseUrl()}/generated/${filename}`;
  }
  throw Error('Pixazo reference image must be an HTTPS URL, data image, or an existing local file.');
}

function frameCount(duration, fps) {
  const raw = Math.max(9, Math.round(Number(duration) * Number(fps)));
  return Math.min(241, Math.max(9, 8 * Math.round((raw - 1) / 8) + 1));
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Ocp-Apim-Subscription-Key': key(),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text) } catch { body = text }
  if (!response.ok) throw Error(`Pixazo ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  return body;
}

async function submitPixazo(job) {
  if (job.type !== 'image_to_video') throw Error('Pixazo LTX free route currently supports Image → Video only.');
  const duration = Math.max(10, Math.min(12, Number(job.input?.duration) || 10));
  const fps = Math.max(1, Math.min(60, Number(job.input?.fps) || 12));
  const image = await imageUrl(job.input?.image || job.input?.images?.[0]);
  const body = {
    prompt: job.prompt,
    image_url: image,
    strength: Number(process.env.PIXAZO_IMAGE_STRENGTH) || 0.8,
    seed: Math.floor(Math.random() * 2147483647),
    aspect: job.input?.aspect_ratio || '16:9',
    num_frames: frameCount(duration, fps),
    frame_rate: fps,
    enhance_prompt: String(process.env.PIXAZO_ENHANCE_PROMPT || 'false').toLowerCase() === 'true'
  };
  const response = await requestJson(`${PIXAZO_BASE_URL}${PIXAZO_I2V_ENDPOINT}`, { method: 'POST', body: JSON.stringify(body) });
  if (!response?.request_id) throw Error(`Pixazo returned no request_id: ${JSON.stringify(response).slice(0, 1200)}`);
  return {
    ...job,
    status: 'running',
    provider_state: 'provider_queue',
    providerResponse: {
      request_id: response.request_id,
      polling_url: response.polling_url || `${PIXAZO_BASE_URL}${PIXAZO_STATUS_BASE}/${encodeURIComponent(response.request_id)}`,
      model: PIXAZO_MODEL
    },
    submittedAt: new Date().toISOString()
  };
}

async function refreshPixazo(job) {
  const id = job.providerResponse?.request_id;
  if (!id) return job;
  const response = await requestJson(`${PIXAZO_BASE_URL}${PIXAZO_STATUS_BASE}/${encodeURIComponent(id)}`, { method: 'GET' });
  const state = String(response?.status || '').toUpperCase();
  if (state === 'COMPLETED') {
    const url = response?.output?.media_url?.[0] || response?.output?.preview_video?.url;
    if (!url) throw Error(`Pixazo completed without a video URL: ${JSON.stringify(response).slice(0, 1600)}`);
    try {
      const media = await fetch(url);
      if (!media.ok) throw Error('result download HTTP ' + media.status);
      const bytes = Buffer.from(await media.arrayBuffer());
      if (bytes.length >= 1024) {
        fs.mkdirSync(GENERATED_DIR, { recursive: true });
        const filename = 'mindscape-pixazo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '.mp4';
        const outputFile = path.join(GENERATED_DIR, filename);
        fs.writeFileSync(outputFile, bytes);
        await persistGeneratedFile(outputFile);
        return { ...job, status: 'completed', provider_state: 'completed', providerResponse: { ...job.providerResponse, status: response }, result: '/generated/' + filename };
      }
      throw Error('result was unexpectedly small');
    } catch (error) {
      console.warn('Could not cache Pixazo output; keeping provider URL:', error.message);
      return { ...job, status: 'completed', provider_state: 'completed', providerResponse: { ...job.providerResponse, status: response }, result: url };
    }
  }
  if (state === 'FAILED' || state === 'ERROR') {
    return { ...job, status: 'failed', provider_state: state.toLowerCase(), error: response.error || 'Pixazo generation failed', providerResponse: { ...job.providerResponse, status: response } };
  }
  return { ...job, status: 'running', provider_state: state.toLowerCase() || 'provider_queue', providerResponse: { ...job.providerResponse, status: response } };
}

module.exports = { PIXAZO_MODEL, submitPixazo, refreshPixazo };
