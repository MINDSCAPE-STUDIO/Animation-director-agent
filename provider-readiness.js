const fs = require('fs');
const path = require('path');

const has = (env, name) => typeof env[name] === 'string' && env[name].trim().length > 0;
const qwenConfigured = env => has(env, 'QWEN_CLOUD_API_KEY') || has(env, 'DASHSCOPE_API_KEY');
const imageFallbackModel = env => env.IMAGE_FALLBACK_MODEL || env.IMAGE_MODEL_FALLBACK || 'fal-ai/flux/schnell';
const falVideoModel = (type, env, primary) => type === 'image_to_video'
  ? (primary ? (env.VIDEO_MODEL || 'wan/v2.6/image-to-video') : env.FAL_I2V_FALLBACK_MODEL)
  : (primary ? (env.VIDEO_MODEL || 'wan/v2.6/text-to-video') : env.FAL_T2V_FALLBACK_MODEL);
const qwenVideoModel = (type, env) => env.QWEN_VIDEO_MODEL ||
  (type === 'image_to_video' ? (env.QWEN_I2V_MODEL || 'wan2.7-i2v') : (env.QWEN_T2V_MODEL || 'wan2.7-t2v'));

function resolveImageRoute(env = process.env) {
  const preferred = env.IMAGE_PROVIDER || 'google';
  const googleReady = has(env, 'GEMINI_API_KEY');
  const falReady = has(env, 'FAL_KEY');
  if (preferred === 'google' && googleReady)
    return { ready: true, provider: 'google', model: env.IMAGE_MODEL || 'gemini-3.1-flash-image', mode: 'primary', missing_variables: [] };
  if (preferred === 'fal' && falReady)
    return { ready: true, provider: 'fal', model: env.IMAGE_MODEL || 'fal-ai/flux-pro/v1.1', mode: 'primary', missing_variables: [] };
  if (preferred !== 'google' && googleReady)
    return { ready: true, provider: 'google', model: env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image', mode: 'fallback', missing_variables: [] };
  if (preferred !== 'fal' && falReady)
    return { ready: true, provider: 'fal', model: imageFallbackModel(env), mode: 'fallback', missing_variables: [] };
  return {
    ready: false, provider: preferred === 'fal' ? 'fal' : 'google',
    model: preferred === 'fal' ? (env.IMAGE_MODEL || 'fal-ai/flux-pro/v1.1') : (env.IMAGE_MODEL || 'gemini-3.1-flash-image'),
    mode: 'unavailable', missing_variables: ['GEMINI_API_KEY', 'FAL_KEY']
  };
}
function resolveImageFallback(env = process.env, excludeProvider = null) {
  if (excludeProvider !== 'fal' && has(env, 'FAL_KEY'))
    return { ready: true, provider: 'fal', model: imageFallbackModel(env), mode: 'fallback', missing_variables: [] };
  if (excludeProvider !== 'google' && has(env, 'GEMINI_API_KEY'))
    return { ready: true, provider: 'google', model: env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image', mode: 'fallback', missing_variables: [] };
  return { ready: false, provider: null, model: null, mode: 'unavailable', missing_variables: ['GEMINI_API_KEY', 'FAL_KEY'] };
}

function configuredVideoRoute(provider, type, env, preferred) {
  const i2v = type === 'image_to_video';
  if (provider === 'qwencloud' && qwenConfigured(env))
    return { ready: true, provider, model: qwenVideoModel(type, env), mode: provider === preferred ? 'primary' : 'fallback', missing_variables: [] };
  if (provider === 'pixazo_ltx' && i2v && has(env, 'PIXAZO_API_KEY') && has(env, 'PUBLIC_BASE_URL'))
    return { ready: true, provider, model: env.PIXAZO_MODEL || 'ltx-video', mode: provider === preferred ? 'primary' : 'fallback', missing_variables: [] };
  if (provider === 'fal' && has(env, 'FAL_KEY')) {
    const model = preferred === 'fal'
      ? (env.VIDEO_MODEL || (i2v ? 'wan/v2.6/image-to-video' : 'wan/v2.6/text-to-video'))
      : falVideoModel(type, env, false);
    if (model)
      return { ready: true, provider, model, mode: provider === preferred ? 'primary' : 'fallback', missing_variables: [] };
  }
  if (provider === 'replicate' && has(env, 'REPLICATE_API_TOKEN')) {
    const model = i2v
      ? (env.REPLICATE_I2V_MODEL || (preferred === 'replicate' && env.VIDEO_MODEL) || 'bytedance/seedance-1-pro-fast')
      : (env.REPLICATE_T2V_MODEL || (preferred === 'replicate' && env.VIDEO_MODEL) || 'bytedance/seedance-1-pro-fast');
    return { ready: true, provider, model, mode: provider === preferred ? 'primary' : 'fallback', missing_variables: [] };
  }
  return null;
}
function videoOrder(type, preferred) {
  if (preferred === 'pixazo_ltx') return type === 'image_to_video'
    ? ['pixazo_ltx', 'fal', 'qwencloud', 'replicate'] : ['fal', 'qwencloud', 'replicate'];
  if (preferred === 'fal') return type === 'image_to_video'
    ? ['fal', 'qwencloud', 'pixazo_ltx', 'replicate'] : ['fal', 'qwencloud', 'replicate'];
  if (preferred === 'replicate') return type === 'image_to_video'
    ? ['replicate', 'qwencloud', 'pixazo_ltx', 'fal'] : ['replicate', 'qwencloud', 'fal'];
  return type === 'image_to_video'
    ? ['qwencloud', 'pixazo_ltx', 'fal', 'replicate'] : ['qwencloud', 'fal', 'replicate'];
}
function missingVideoRoute(type, env, preferred) {
  const fallbackCandidates = type === 'image_to_video'
    ? ['QWEN_CLOUD_API_KEY or DASHSCOPE_API_KEY', 'PIXAZO_API_KEY and PUBLIC_BASE_URL', 'FAL_KEY with FAL_I2V_FALLBACK_MODEL', 'REPLICATE_API_TOKEN']
    : ['QWEN_CLOUD_API_KEY or DASHSCOPE_API_KEY', 'FAL_KEY with FAL_T2V_FALLBACK_MODEL', 'REPLICATE_API_TOKEN'];
  return {
    ready: false, provider: preferred,
    model: preferred === 'pixazo_ltx' ? (env.PIXAZO_MODEL || 'ltx-video') : preferred === 'fal'
      ? (env.VIDEO_MODEL || (type === 'image_to_video' ? 'wan/v2.6/image-to-video' : 'wan/v2.6/text-to-video'))
      : preferred === 'replicate' ? (env.VIDEO_MODEL || 'bytedance/seedance-1-pro-fast') : qwenVideoModel(type, env),
    mode: 'unavailable', missing_variables: fallbackCandidates
  };
}
function resolveVideoRoute(type, env = process.env) {
  const preferred = env.VIDEO_PROVIDER || 'qwencloud';
  for (const provider of videoOrder(type, preferred)) {
    const route = configuredVideoRoute(provider, type, env, preferred);
    if (route) return route;
  }
  return missingVideoRoute(type, env, preferred);
}
function resolveVideoFallback(type, env = process.env, excludeProvider = null) {
  const preferred = env.VIDEO_PROVIDER || 'qwencloud';
  for (const provider of videoOrder(type, preferred)) {
    if (provider === excludeProvider) continue;
    const route = configuredVideoRoute(provider, type, env, preferred);
    if (route) return { ...route, mode: 'fallback' };
  }
  return missingVideoRoute(type, env, preferred);
}

function getProviderReadiness(env = process.env) {
  const tasks = {
    image_generation: resolveImageRoute(env),
    image_to_video: resolveVideoRoute('image_to_video', env),
    text_to_video: resolveVideoRoute('text_to_video', env)
  };
  const missing = [...new Set(Object.values(tasks).filter(task => !task.ready).flatMap(task => task.missing_variables || []))];
  return {
    ready: Object.values(tasks).every(task => task.ready),
    tasks,
    missing_variables: missing,
    configured_tasks: Object.values(tasks).filter(task => task.ready).length,
    required_tasks: Object.keys(tasks).length
  };
}

function getFallbackReadiness(env = process.env) {
  const falReady = has(env, 'FAL_KEY');
  const pixazoReady = has(env, 'PIXAZO_API_KEY') && has(env, 'PUBLIC_BASE_URL');
  const replicateReady = has(env, 'REPLICATE_API_TOKEN');
  const imageModel = imageFallbackModel(env);
  return {
    image_generation: falReady ? { ready: true, provider: 'fal', model: imageModel } : { ready: false, provider: null, model: null },
    image_to_video: pixazoReady
      ? { ready: true, provider: 'pixazo_ltx', model: env.PIXAZO_MODEL || 'ltx-video' }
      : falReady && env.FAL_I2V_FALLBACK_MODEL
        ? { ready: true, provider: 'fal', model: env.FAL_I2V_FALLBACK_MODEL }
        : replicateReady
          ? { ready: true, provider: 'replicate', model: env.REPLICATE_I2V_MODEL || 'bytedance/seedance-1-pro-fast' }
          : { ready: false, provider: null, model: null },
    text_to_video: falReady && env.FAL_T2V_FALLBACK_MODEL
      ? { ready: true, provider: 'fal', model: env.FAL_T2V_FALLBACK_MODEL }
      : replicateReady
        ? { ready: true, provider: 'replicate', model: env.REPLICATE_T2V_MODEL || 'bytedance/seedance-1-pro-fast' }
        : { ready: false, provider: null, model: null }
  };
}

function isPersistentPath(target) {
  const root = path.resolve('/var/data');
  const resolved = path.resolve(target);
  return resolved === root || resolved.startsWith(root + path.sep);
}
function testDirectory(dir) {
  let file = null;
  try {
    fs.mkdirSync(dir, { recursive: true });
    file = path.join(dir, '.mindscape-storage-probe-' + process.pid + '-' + Math.random().toString(36).slice(2, 8));
    fs.writeFileSync(file, 'storage-check');
    if (fs.readFileSync(file, 'utf8') !== 'storage-check') return { ok: false, error: 'readback_failed' };
    fs.unlinkSync(file);
    return { ok: true, error: null };
  } catch (error) {
    if (file) { try { fs.unlinkSync(file); } catch {} }
    return { ok: false, error: error.code || 'filesystem_error' };
  }
}
function getStorageHealth(env = process.env) {
  const generatedDir = path.join(__dirname, 'generated');
  const historyFile = env.GENERATION_HISTORY_FILE || path.join(__dirname, 'generated', 'generation-history.jsonl');
  const mediaCheck = testDirectory(generatedDir);
  const historyDirCheck = testDirectory(path.dirname(historyFile));
  let historyFileWritable = false;
  let historyError = null;
  try {
    fs.mkdirSync(path.dirname(historyFile), { recursive: true });
    const fd = fs.openSync(historyFile, 'a');
    fs.closeSync(fd);
    historyFileWritable = true;
  } catch (error) {
    historyError = error.code || 'filesystem_error';
  }
  const writable = mediaCheck.ok && historyDirCheck.ok && historyFileWritable;
  const persistent = writable && isPersistentPath(generatedDir) && isPersistentPath(historyFile);
  return {
    writable, persistent, mode: persistent ? 'persistent' : 'ephemeral', backend: 'local-filesystem',
    generated_media_writable: mediaCheck.ok, history_writable: historyFileWritable && historyDirCheck.ok,
    history_file_configured: has(env, 'GENERATION_HISTORY_FILE'),
    error_code: !mediaCheck.ok ? mediaCheck.error : !historyDirCheck.ok ? historyDirCheck.error : historyError,
    detail: !writable
      ? 'A write/read test failed for generated media or the generation-history file.'
      : persistent
        ? 'Read/write checks passed and both history and generated media are under the persistent-disk mount /var/data.'
        : 'Read/write checks passed, but history and/or generated media use the ephemeral filesystem. Files can be lost on restart or redeploy.'
  };
}

module.exports = { getFallbackReadiness, getProviderReadiness, getStorageHealth, resolveImageRoute, resolveVideoRoute, resolveVideoFallback, resolveImageFallback };
