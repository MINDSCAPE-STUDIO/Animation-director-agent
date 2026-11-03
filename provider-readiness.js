const fs = require('fs');
const path = require('path');
const { getGeneratedDir, getDataDir, getHistoryFile, getEvaluationFile, getStyleBibleFile, getMasterAssetsFile } = require('./storage-paths');
const { isObjectStorageConfigured, getObjectStorageStatus } = require('./object-storage');

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
  const selected = String(env.IMAGE_FALLBACK_PROVIDER || '').trim().toLowerCase();
  if (selected) {
    if (selected === 'replicate' && excludeProvider !== 'replicate' &&
        has(env, 'REPLICATE_API_TOKEN') && has(env, 'IMAGE_FALLBACK_MODEL')) {
      return {
        ready: true, provider: 'replicate', model: env.IMAGE_FALLBACK_MODEL,
        mode: 'fallback', billing_status: 'not_checked',
        detail: 'Replicate credentials and model are configured; available credits and charges are not checked.'
      };
    }
    if (selected === 'fal' && excludeProvider !== 'fal' && has(env, 'FAL_KEY')) {
      return { ready: true, provider: 'fal', model: imageFallbackModel(env), mode: 'fallback', billing_status: 'not_checked' };
    }
    if (selected === 'google' && excludeProvider !== 'google' && has(env, 'GEMINI_API_KEY')) {
      return { ready: true, provider: 'google', model: env.GEMINI_IMAGE_FALLBACK_MODEL || env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image', mode: 'fallback', billing_status: 'not_checked' };
    }
    return {
      ready: false, provider: null, model: null, mode: 'unavailable',
      missing_variables: selected === 'replicate'
        ? ['REPLICATE_API_TOKEN', 'IMAGE_FALLBACK_MODEL']
        : selected === 'fal' ? ['FAL_KEY'] : selected === 'google'
          ? ['GEMINI_API_KEY'] : ['Valid IMAGE_FALLBACK_PROVIDER (replicate, fal, or google)']
    };
  }
  // FAL is only selected automatically when its key has been explicitly configured.
  if (excludeProvider !== 'fal' && has(env, 'FAL_KEY'))
    return { ready: true, provider: 'fal', model: imageFallbackModel(env), mode: 'fallback', billing_status: 'not_checked' };
  if (excludeProvider !== 'google' && has(env, 'GEMINI_API_KEY'))
    return { ready: true, provider: 'google', model: env.GEMINI_IMAGE_FALLBACK_MODEL || env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image', mode: 'fallback', billing_status: 'not_checked' };
  return {
    ready: false, provider: null, model: null, mode: 'unavailable',
    missing_variables: ['IMAGE_FALLBACK_PROVIDER and compatible credentials/model']
  };
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
  const image = resolveImageFallback(env, env.IMAGE_PROVIDER || 'google');
  return {
    image_generation: image.ready
      ? { ready: true, provider: image.provider, model: image.model, billing_status: image.billing_status || 'not_checked', detail: image.detail || null }
      : { ready: false, provider: null, model: null, detail: 'No compatible image fallback is configured. Replicate fallback requires explicit IMAGE_FALLBACK_PROVIDER=replicate and IMAGE_FALLBACK_MODEL; charges/credits are not verified.' },
    image_to_video: pixazoReady
      ? { ready: true, provider: 'pixazo_ltx', model: env.PIXAZO_MODEL || 'ltx-video' }
      : falReady && env.FAL_I2V_FALLBACK_MODEL
        ? { ready: true, provider: 'fal', model: env.FAL_I2V_FALLBACK_MODEL, billing_status: 'not_checked' }
        : replicateReady
          ? { ready: true, provider: 'replicate', model: env.REPLICATE_I2V_MODEL || 'bytedance/seedance-1-pro-fast', billing_status: 'not_checked' }
          : { ready: false, provider: null, model: null },
    text_to_video: falReady && env.FAL_T2V_FALLBACK_MODEL
      ? { ready: true, provider: 'fal', model: env.FAL_T2V_FALLBACK_MODEL, billing_status: 'not_checked' }
      : replicateReady
        ? { ready: true, provider: 'replicate', model: env.REPLICATE_T2V_MODEL || 'bytedance/seedance-1-pro-fast', billing_status: 'not_checked' }
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
  const generatedDir = getGeneratedDir(env);
  const dataDir = getDataDir(env);
  const historyFile = getHistoryFile(env);
  const evaluationFile = getEvaluationFile(env);
  const styleBibleFile = getStyleBibleFile(env);
  const masterAssetsFile = getMasterAssetsFile(env);
  const storageFiles = [historyFile, evaluationFile, styleBibleFile, masterAssetsFile];
  const directories = [...new Set([generatedDir, dataDir, ...storageFiles.map(file => path.dirname(file))])];
  const directoryChecks = directories.map(dir => ({dir, ...testDirectory(dir)}));
  const filesWritable = [];
  for (const file of storageFiles) {
    try {
      if (fs.existsSync(file)) {
        const fd = fs.openSync(file, 'a');
        fs.closeSync(fd);
      }
      filesWritable.push({file, ok: true, error: null});
    } catch (error) {
      filesWritable.push({file, ok: false, error: error.code || 'filesystem_error'});
    }
  }
  const mediaCheck = directoryChecks.find(check => check.dir === generatedDir);
  const historyDirCheck = directoryChecks.find(check => check.dir === path.dirname(historyFile));
  const dataDirCheck = directoryChecks.find(check => check.dir === dataDir);
  const localWritable = directoryChecks.every(check => check.ok) && filesWritable.every(check => check.ok);
  const remoteConfigured = isObjectStorageConfigured(env);
  const objectStorage = getObjectStorageStatus(env);
  const remoteReady = remoteConfigured && objectStorage.writable;
  const writable = localWritable && (!remoteConfigured || remoteReady);
  const mountPaths = [generatedDir, dataDir, historyFile, evaluationFile, styleBibleFile, masterAssetsFile];
  const persistenceEnabled = String(env.STORAGE_PERSISTENCE_ENABLED || '').toLowerCase() === 'true';
  const localPersistent = localWritable && persistenceEnabled && mountPaths.every(isPersistentPath);
  const persistent = writable && (remoteReady || localPersistent);
  const firstError = directoryChecks.find(check => !check.ok) || filesWritable.find(check => !check.ok) ||
    (remoteConfigured && !remoteReady ? {error: objectStorage.error_code || 'object_storage_unavailable'} : null);
  return {
    writable, persistent, mode: remoteReady ? 'object-storage' : localPersistent ? 'persistent' : 'ephemeral',
    backend: remoteReady ? 'cloudflare-r2-compatible-object-storage' : 'local-filesystem',
    object_storage: { configured: remoteConfigured, writable: remoteReady, backend: objectStorage.backend,
      region: objectStorage.region,
      missing_variables: objectStorage.missing_variables, error_code: objectStorage.error_code, checked_at: objectStorage.checked_at },
    generated_media_writable: Boolean(mediaCheck?.ok),
    history_writable: Boolean(historyDirCheck?.ok && filesWritable.find(check => check.file === historyFile)?.ok),
    metadata_writable: Boolean(dataDirCheck?.ok && filesWritable.filter(check => check.file !== historyFile).every(check => check.ok)),
    persistent_storage_path_configured: has(env, 'PERSISTENT_STORAGE_DIR'),
    persistence_enabled_flag: persistenceEnabled,
    history_file_configured: has(env, 'GENERATION_HISTORY_FILE'),
    error_code: firstError?.error || null,
    detail: !localWritable
      ? 'A filesystem write/read check failed for generated media, generation history, evaluations, style bible or master assets.'
      : remoteConfigured && !remoteReady
        ? 'Object storage is configured but its signed read/write check or metadata recovery failed. Check OBJECT_STORAGE_* settings and recent logs.'
        : remoteReady
          ? 'Filesystem checks passed and generated media plus metadata are backed up to the configured S3-compatible object store.'
          : localPersistent
            ? 'Read/write checks passed and all local data paths are under /var/data with persistence explicitly enabled.'
            : 'Read/write checks passed, but no durable storage is enabled. Render Free local files can be lost after restart, spin-down or redeploy.'
  };
}

module.exports = { getFallbackReadiness, getProviderReadiness, getStorageHealth, resolveImageRoute, resolveVideoRoute, resolveVideoFallback, resolveImageFallback };
