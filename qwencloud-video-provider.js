const fs = require('fs');
const path = require('path');

const API_BASE = () => String(process.env.QWEN_VIDEO_API_BASE || 'https://maas.qwencloudapi.com/api/v1').replace(/\/$/, '');
const TASK_BASE = () => String(process.env.QWEN_TASK_API_BASE || 'https://dashscope-intl.aliyuncs.com/api/v1').replace(/\/$/, '');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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

  const deadline = Date.now() + Number(process.env.QWEN_VIDEO_TIMEOUT_MS || 900000);
  let status = 'PENDING';
  let task = null;
  while (Date.now() < deadline) {
    await sleep(Number(process.env.QWEN_VIDEO_POLL_INTERVAL_MS || 15000));
    task = await request(`${TASK_BASE()}/tasks/${encodeURIComponent(taskId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}` }
    }, 'status check');
    const output = task?.output || {};
    status = String(output.task_status || '').toUpperCase();
    if (status === 'SUCCEEDED') {
      const videoUrl = output.video_url;
      if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) throw new Error('QwenCloud marked the task successful but returned no valid video_url.');
      const videoResponse = await fetch(videoUrl);
      if (!videoResponse.ok) throw new Error(`QwenCloud video download failed (${videoResponse.status}).`);
      const bytes = Buffer.from(await videoResponse.arrayBuffer());
      if (bytes.length < 1024) throw new Error('QwenCloud returned an unexpectedly small video file.');
      const publicDir = path.join(__dirname, 'generated');
      fs.mkdirSync(publicDir, { recursive: true });
      const filename = `mindscape-qwen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp4`;
      fs.writeFileSync(path.join(publicDir, filename), bytes);
      return {
        output: `/generated/${filename}`,
        provider: 'qwencloud',
        model,
        task_id: taskId,
        duration: Number(output?.usage?.output_video_duration) || duration,
        resolution,
        bytes: bytes.length
      };
    }
    if (status === 'FAILED' || status === 'CANCELED' || status === 'CANCELLED' || status === 'UNKNOWN') {
      throw new Error(`QwenCloud task ${status}: ${output.message || output.code || 'no provider error details'}`);
    }
  }
  throw new Error(`QwenCloud video generation timed out while task ${taskId} was in state ${status}. The task may still be processing; check QwenCloud task history before retrying to avoid duplicate charges.`);
}

module.exports = { submitQwenCloud };
