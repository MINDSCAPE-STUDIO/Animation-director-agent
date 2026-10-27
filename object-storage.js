const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { HISTORY_FILE, EVALUATIONS_FILE, STYLE_BIBLE_FILE, MASTER_ASSETS_FILE } = require('./storage-paths');

let state = { configured: false, writable: false, checked_at: null, error_code: null };
const pendingWrites = new Map();

function missingVariables(env = process.env) {
  return ['OBJECT_STORAGE_ENDPOINT', 'OBJECT_STORAGE_BUCKET', 'OBJECT_STORAGE_ACCESS_KEY_ID', 'OBJECT_STORAGE_SECRET_ACCESS_KEY']
    .filter(name => typeof env[name] !== 'string' || !env[name].trim());
}
function config(env = process.env) {
  if (missingVariables(env).length) return null;
  try {
    const endpoint = new URL(env.OBJECT_STORAGE_ENDPOINT);
    if (endpoint.protocol !== 'https:' || endpoint.search || endpoint.hash) return null;
    return {
      endpoint, bucket: env.OBJECT_STORAGE_BUCKET.trim(),
      accessKey: env.OBJECT_STORAGE_ACCESS_KEY_ID.trim(),
      secretKey: env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
      region: env.OBJECT_STORAGE_REGION || 'auto',
      prefix: (env.OBJECT_STORAGE_PREFIX || 'mindscape-studio').replace(/^\/+|\/+$/g, '')
    };
  } catch { return null; }
}
function isObjectStorageConfigured(env = process.env) { return Boolean(config(env)); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function hmac(key, value, encoding) { return crypto.createHmac('sha256', key).update(value).digest(encoding); }
function awsEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
function safeKey(value) {
  const key = String(value || '').replace(/^\/+/, '');
  if (!key || key.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid object-storage key.');
  return key;
}
function buildSignedRequest(method, logicalKey, body, contentType, env = process.env, date = new Date()) {
  const cfg = config(env);
  if (!cfg) throw new Error('Object storage is not fully configured.');
  const key = [cfg.prefix, safeKey(logicalKey)].filter(Boolean).join('/');
  const basePath = cfg.endpoint.pathname.replace(/\/$/, '');
  const uri = basePath + '/' + awsEncode(cfg.bucket) + '/' + key.split('/').map(awsEncode).join('/');
  const url = new URL(cfg.endpoint.origin + uri);
  const payload = body == null ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(body);
  const payloadHash = sha256(payload);
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const shortDate = amzDate.slice(0, 8);
  const canonicalHeaders = ['host:' + url.host, 'x-amz-content-sha256:' + payloadHash, 'x-amz-date:' + amzDate].join('\n') + '\n';
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [method.toUpperCase(), url.pathname, '', canonicalHeaders + signedHeaders, payloadHash].join('\\n');
  const scope = shortDate + '/' + cfg.region + '/s3/aws4_request';
  const stringToSign = 'AWS4-HMAC-SHA256\n' + amzDate + '\n' + scope + '\n' + sha256(canonicalRequest);
  const kDate = hmac('AWS4' + cfg.secretKey, shortDate);
  const kRegion = hmac(kDate, cfg.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmac(kSigning, stringToSign, 'hex');
  const authorization = 'AWS4-HMAC-SHA256 Credential=' + cfg.accessKey + '/' + scope +
    ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;
  const headers = { Authorization: authorization, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash };
  if (contentType) headers['Content-Type'] = contentType;
  return { url, options: { method: method.toUpperCase(), headers, ...(method.toUpperCase() === 'PUT' ? { body: payload } : {}) } };
}
function updateState(writable, error = null, env = process.env) {
  if (env !== process.env) return;
  state = { configured: isObjectStorageConfigured(env), writable: Boolean(writable), checked_at: new Date().toISOString(),
    error_code: error ? String(error.code || 'object_storage_error').slice(0, 80) : null };
}
async function requestObject(method, key, body, contentType, env = process.env) {
  const signed = buildSignedRequest(method, key, body, contentType, env);
  const response = await fetch(signed.url, signed.options);
  const verb = method.toUpperCase();
  if (verb === 'GET' && response.status === 404) return null;
  if (verb === 'DELETE' && response.status === 404) return true;
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 600);
    const error = new Error('Object storage ' + verb + ' failed (' + response.status + ')' + (detail ? ': ' + detail : ''));
    error.code = 'object_storage_http_' + response.status;
    updateState(false, error, env);
    throw error;
  }
  if (verb === 'GET') {
    const data = Buffer.from(await response.arrayBuffer());
    updateState(true, null, env);
    return data;
  }
  updateState(true, null, env);
  return true;
}
async function putObjectBuffer(key, bytes, contentType = 'application/octet-stream', env = process.env) {
  return requestObject('PUT', key, Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes), contentType, env);
}
async function getObjectBuffer(key, env = process.env) { return requestObject('GET', key, null, null, env); }
async function deleteObject(key, env = process.env) { return requestObject('DELETE', key, null, null, env); }
function contentTypeForFile(file) {
  const ext = path.extname(file).toLowerCase();
  return ({ '.json':'application/json', '.jsonl':'application/x-ndjson', '.png':'image/png', '.jpg':'image/jpeg',
    '.jpeg':'image/jpeg', '.webp':'image/webp', '.mp4':'video/mp4' })[ext] || 'application/octet-stream';
}
function persistLocalFile(file, key) {
  if (!isObjectStorageConfigured()) return Promise.resolve(false);
  const previous = pendingWrites.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(async () => {
    await putObjectBuffer(key, await fs.promises.readFile(file), contentTypeForFile(file));
    return true;
  }).catch(error => { updateState(false, error); throw error; }).finally(() => {
    if (pendingWrites.get(key) === current) pendingWrites.delete(key);
  });
  pendingWrites.set(key, current);
  return current;
}
function persistGeneratedFile(file) {
  return file ? persistLocalFile(file, 'generated/' + path.basename(file)) : Promise.resolve(false);
}
function getGeneratedObjectBuffer(filename) {
  const base = path.basename(String(filename || ''));
  if (!base || base !== filename) return Promise.resolve(null);
  return getObjectBuffer('generated/' + base);
}
function getObjectStorageStatus(env = process.env) {
  const configured = isObjectStorageConfigured(env);
  const current = env === process.env ? state : { writable: false, checked_at: null, error_code: null };
  return { configured, writable: configured && Boolean(current.writable), checked_at: current.checked_at || null,
    error_code: current.error_code || null, missing_variables: missingVariables(env),
    prefix: env.OBJECT_STORAGE_PREFIX || 'mindscape-studio', backend: 'Cloudflare R2 / S3-compatible object storage' };
}
async function restoreMetadataFiles() {
  const mappings = [
    [HISTORY_FILE, 'metadata/generation-history.jsonl'],
    [EVALUATIONS_FILE, 'metadata/evaluations.jsonl'],
    [STYLE_BIBLE_FILE, 'metadata/style-bible.json'],
    [MASTER_ASSETS_FILE, 'metadata/master-assets.json']
  ];
  for (const [file, key] of mappings) {
    const remote = await getObjectBuffer(key);
    if (remote) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, remote);
    } else if (fs.existsSync(file)) {
      await persistLocalFile(file, key);
    }
  }
}
async function initializeObjectStorage() {
  if (!isObjectStorageConfigured()) {
    state = { configured: false, writable: false, checked_at: new Date().toISOString(), error_code: null };
    return getObjectStorageStatus();
  }
  const probeKey = '.health/probe-' + process.pid + '-' + crypto.randomBytes(8).toString('hex') + '.txt';
  try {
    const payload = Buffer.from('mindscape-storage-probe:' + new Date().toISOString());
    await putObjectBuffer(probeKey, payload, 'text/plain');
    const stored = await getObjectBuffer(probeKey);
    if (!stored || !stored.equals(payload)) throw new Error('Object-storage probe readback failed.');
    await deleteObject(probeKey);
    await restoreMetadataFiles();
    updateState(true);
    console.log('Object storage is reachable; metadata recovery completed.');
  } catch (error) {
    updateState(false, error);
    console.error('Object storage is configured but not ready:', error.message);
  }
  return getObjectStorageStatus();
}
module.exports = {
  isObjectStorageConfigured, getObjectStorageStatus, initializeObjectStorage, persistLocalFile, persistGeneratedFile,
  putObjectBuffer, getObjectBuffer, getGeneratedObjectBuffer, buildSignedRequest
};
