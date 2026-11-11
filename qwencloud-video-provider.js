const fs = require('fs');
const path = require('path');
const { GENERATED_DIR } = require('./storage-paths');
const { persistGeneratedFile } = require('./object-storage');

const API_BASE = () => String(process.env.QWEN_VIDEO_API_BASE || 'https://maas.qwencloudapi.com/api/v1').replace(/\/$/, '');
const TASK_BASE = () => String(process.env.QWEN_TASK_API_BASE || 'https://dashscope-intl.aliyuncs.com/api/v1').replace(/\/$/, '');
const TASK_DEADLINE_MS = () => Number(process.env.QWEN_VIDEO_TIMEOUT_MS || 900000);
const POLL_INTERVAL_MS = () => Number(process.env.QWEN_VIDEO_POLL_INTERVAL_MS || 15000);

function apiKey() {
  const key = process.env.QWEN_CLOUD_API_KEY || process.env.DASHSCOPE_API_KEY;
  if (!key) throw new Error('QWEN_CLOUD_API_KEY is not configured. Add your QwenCloud/DashScope API key in Render Environment settings.');
  return key;
}

function imageAsDataUrl(image) {
  if (typeof image !== 'string' || !image) throw new Error('QwenCloud Image → Video requires a reference image.');
  if (/^data:image\/(png|jpeg|jpg|webp|bmp);base64,/i.test(image)) return image;
  if (/^https?:\/\//i.test(image)) return image;
  if (!fs.existsSync(image)) throw new Error('Reference image file is unavailable to the QwenCloud provider.');
  const ext = path.extname(image).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : ext === '.bmp' ? 'image/bmp' : 'image/png';
  return `data:${mime};base64,${fs.readFileSync(image).toString('base64')}`;
}

async function request(url, options, label) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }
  if (!response.ok) {
    const detail = data?.message || data?.code || raw || response.statusText;
    throw new Error(`QwenCloud ${label} failed (${response.status}): ${String(detail).slice(0, 1200)}`);
  }
  return data;
}

async function submitQwenCloud(job) {
  const key = apiKey();
  const isI2V = job.type === 'image_to_video';
  if (!isI2V && job.type !== 'text_to_video') {
    throw new Error('QwenCloud Wan 2.7 currently supports Text → Video and Image → Video jobs only.');
  }
  const duration = Math.max(2, Math.min(15, Math.round(Number(job.input?.duration) || 10)));
  const resolutionRaw = String(job.input?.resolution || process.env.VIDEO_RESOLUTION || '720P').toUpperCase();
  const resolution = resolutionRaw.includes('1080') ? '1080P' : '720P';
  const model = process.env.QWEN_VIDEO_MODEL || (isI2V ? (process.env.QWEN_I2V_MODEL || 'wan2.7-i2v') : (process.env.QWEN_T2V_MODEL || 'wan2.7-t2v'));
  const input = { prompt: job.prompt || '' };
  if (isI2V) input.media = [{ type: 'first_frame', url: imageAsDataUrl(job.input?.image) }];
  if (job.input?.negative_prompt) input.negative_prompt = String(job.input.negative_prompt).slice(0, 500);
  const payload = {
    model,
    input,
    parameters: {
      resolution,
      duration,
      ratio: String(job.input?.aspect_ratio || '16:9'),
      prompt_extend: true,
      watermark: false,
      seed: Math.floor(Math.random() * 2147483647)
    }
  };
  console.log(`QwenCloud generation ${job.id}: ${model}, ${duration}s, ${resolution}`);
  const submitted = await request(`${API_BASE()}/services/aigc/video-generation/video-synthesis`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable' },
    body: JSON.stringify(payload)
  }, 'submission');
  const taskId = submitted?.output?.task_id;
  if (!taskId) throw new Error(`QwenCloud returned no task_id: ${JSON.stringify(submitted).slice(0, 1200)}`);
  return {
    ...job,
    status: 'running',
    provider_state: 'provider_queue',
    providerResponse: { task_id: taskId, model, duration, resolution },
    submittedAt: new Date().toISOString()
  };
}

async function downloadQwenCloudVideo(videoUrl) {
  const videoResponse = await fetch(videoUrl);
  if (!videoResponse.ok) throw new Error(`QwenCloud video download failed (${videoResponse.status}).`);
  const bytes = Buffer.from(await videoResponse.arrayBuffer());
  if (bytes.length < 1024) throw new Error('QwenCloud returned an unexpectedly small video file.');
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  const filename = `mindscape-qwen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp4`;
  const outputFile = path.join(GENERATED_DIR, filename);
  fs.writeFileSync(outputFile, bytes);
  await persistGeneratedFile(outputFile);
  return { result: `/generated/${filename}`, bytes: bytes.length };
}

async function refreshQwenCloud(job) {
  const taskId = job.providerResponse?.task_id;
  if (!taskId) return job;

  const lastPolledAt = Number(job.providerResponse?.polledAt) || 0;
  if (Date.now() - lastPolledAt < POLL_INTERVAL_MS()) return job;

  const submittedAt = Date.parse(job.submittedAt || job.createdAt || '') || 0;
  if (submittedAt && Date.now() - submittedAt > TASK_DEADLINE_MS()) {
    throw new Error(`QwenCloud video generation timed out while task ${taskId} was in state ${job.provider_state || 'running'}. The task may still be processing; check QwenCloud task history before retrying to avoid duplicate charges.`);
  }

  const task = await request(`${TASK_BASE()}/tasks/${encodeURIComponent(taskId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey()}` }
  }, 'status check');
  const output = task?.output || {};
  const status = String(output.task_status || '').toUpperCase();
  const providerResponse = { ...job.providerResponse, task, polledAt: Date.now() };

  if (status === 'SUCCEEDED') {
    const videoUrl = output.video_url;
    if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) throw new Error('QwenCloud marked the task successful but returned no valid video_url.');
    const media = await downloadQwenCloudVideo(videoUrl);
    return {
      ...job,
      status: 'completed',
      provider_state: 'completed',
      providerResponse,
      result: media.result,
      duration: Number(output?.usage?.output_video_duration) || providerResponse.duration,
      resolution: providerResponse.resolution,
      bytes: media.bytes
    };
  }
  if (status === 'FAILED' || status === 'CANCELED' || status === 'CANCELLED' || status === 'UNKNOWN') {
    return {
      ...job,
      status: status === 'CANCELED' || status === 'CANCELLED' ? 'canceled' : 'failed',
      provider_state: status.toLowerCase(),
      error: `QwenCloud task ${status}: ${output.message || output.code || 'no provider error details'}`,
      providerResponse
    };
  }
  return { ...job, status: 'running', provider_state: status.toLowerCase() || 'provider_queue', providerResponse };
}

module.exports = { submitQwenCloud, refreshQwenCloud };
