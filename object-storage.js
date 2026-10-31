const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { HISTORY_FILE, EVALUATIONS_FILE, STYLE_BIBLE_FILE, MASTER_ASSETS_FILE } = require('./storage-paths');

let state = { configured: false, writable: false, checked_at: null, error_code: null };
const pendingWrites = new Map();
const clients = new WeakMap();

function missingVariables(env = process.env) {
  return ['OBJECT_STORAGE_ENDPOINT', 'OBJECT_STORAGE_BUCKET', 'OBJECT_STORAGE_ACCESS_KEY_ID', 'OBJECT_STORAGE_SECRET_ACCESS_KEY']
    .filter(name => typeof env[name] !== 'string' || !env[name].trim());
}
function config(env = process.env) {
  if (missingVariables(env).length) return null;
  try {
    const endpoint = new URL(env.OBJECT_STORAGE_ENDPOINT.trim());
    if (endpoint.protocol !== 'https:' || endpoint.search || endpoint.hash) return null;
    return {
      endpoint,
      bucket: env.OBJECT_STORAGE_BUCKET.trim(),
      accessKey: env.OBJECT_STORAGE_ACCESS_KEY_ID.trim(),
      secretKey: env.OBJECT_STORAGE_SECRET_ACCESS_KEY.trim(),
      region: (env.OBJECT_STORAGE_REGION || 'auto').trim(),
      prefix: (env.OBJECT_STORAGE_PREFIX || 'mindscape-studio').replace(/^\/+|\/+$/g, '')
    };
  } catch {
    return null;
  }
}
function isObjectStorageConfigured(env = process.env) {
  return Boolean(config(env));
}
function safeKey(value) {
  const key = String(value || '').replace(/^\/+/, '');
  if (!key || key.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Invalid object-storage key.');
  }
  return key;
}
function getS3Client(env, cfg) {
  // Backblaze B2's S3-compatible API can reject AWS SDK's optional
  // aws-chunked checksum trailers with "The request body was too small".
  // Use ordinary payload signing/checksums unless an operation requires them.
  let client = clients.get(env);
  if (!client) {
    client = new S3Client({
      endpoint: cfg.endpoint.origin,
      region: cfg.region,
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: cfg.accessKey,
        secretAccessKey: cfg.secretKey
      }
    });
    clients.set(env, client);
  }
  return client;
}
function updateState(writable, error = null, env = process.env) {
  if (env !== process.env) return;
  state = {
    configured: isObjectStorageConfigured(env),
    writable: Boolean(writable),
    checked_at: new Date().toISOString(),
    error_code: error ? String(error.code || 'object_storage_error').slice(0, 80) : null
  };
}
async function bodyToBuffer(body) {
  if (!body) return Buffer.alloc(0);
  if (typeof body.transformToByteArray === 'function') {
    return Buffer.from(await body.transformToByteArray());
  }
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
async function requestObject(method, logicalKey, body, contentType, env = process.env) {
  const cfg = config(env);
  if (!cfg) throw new Error('Object storage is not fully configured.');
  const key = [cfg.prefix, safeKey(logicalKey)].filter(Boolean).join('/');
  const client = getS3Client(env, cfg);
  const verb = method.toUpperCase();
  try {
    if (verb === 'PUT') {
      const payload = body == null ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(body);
      await client.send(new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: payload,
        ...(contentType ? { ContentType: contentType } : {})
      }));
      updateState(true, null, env);
      return true;
    }
    if (verb === 'GET') {
      const response = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
      const data = await bodyToBuffer(response.Body);
      updateState(true, null, env);
      return data;
    }
    if (verb === 'DELETE') {
      await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
      updateState(true, null, env);
      return true;
    }
    throw new Error('Unsupported object-storage method: ' + verb);
  } catch (error) {
    const status = error && error.$metadata && error.$metadata.httpStatusCode
      ? error.$metadata.httpStatusCode
      : error && (error.statusCode || error.status);
    const errorName = String(error && (error.name || error.Code || error.code) || '');
    if (verb === 'GET' && (status === 404 || errorName === 'NoSuchKey' || errorName === 'NotFound')) return null;
    if (verb === 'DELETE' && (status === 404 || errorName === 'NoSuchKey' || errorName === 'NotFound')) return true;
    const detail = String(error && error.message || 'Unknown storage error').slice(0, 600);
    if (verb === 'PUT' && status === 400 && /credential is malformed/i.test(detail)) {
      const accessKeyId = env.OBJECT_STORAGE_ACCESS_KEY_ID || '';
      const secretKey = env.OBJECT_STORAGE_SECRET_ACCESS_KEY || '';
      console.error('Object storage credential diagnostic (redacted):', JSON.stringify({
        endpointHost: cfg.endpoint.host,
        region: cfg.region,
        bucketConfigured: Boolean(cfg.bucket),
        accessKeyIdLength: accessKeyId.trim().length,
        accessKeyIdAlphanumeric: /^[A-Za-z0-9]+$/.test(accessKeyId.trim()),
        accessKeyIdLooksLikeBucketId: /^[a-f0-9]{24}$/i.test(accessKeyId.trim()),
        accessKeyIdHasOuterWhitespace: accessKeyId !== accessKeyId.trim(),
        secretKeyPresent: Boolean(secretKey.trim()),
        secretKeyHasOuterWhitespace: secretKey !== secretKey.trim()
      }));
    }
    if (status === 403 && /signature|authorization|credential/i.test(detail)) {
      const accessKeyId = env.OBJECT_STORAGE_ACCESS_KEY_ID || '';
      const secretKey = env.OBJECT_STORAGE_SECRET_ACCESS_KEY || '';
      const endpointRegionMatch = cfg.endpoint.hostname.match(/^s3[.-]([a-z0-9-]+)\\.backblazeb2\\.com$/i);
      console.error('Object storage signature diagnostic (redacted):', JSON.stringify({
        endpointHost: cfg.endpoint.host,
        configuredRegion: cfg.region,
        endpointRegion: endpointRegionMatch ? endpointRegionMatch[1] : null,
        bucketConfigured: Boolean(cfg.bucket),
        accessKeyIdPresent: Boolean(accessKeyId.trim()),
        accessKeyIdLength: accessKeyId.trim().length,
        accessKeyIdHasOuterWhitespace: accessKeyId !== accessKeyId.trim(),
        secretKeyPresent: Boolean(secretKey.trim()),
        secretKeyHasOuterWhitespace: secretKey !== secretKey.trim(),
        errorName: String(error && (error.name || error.Code || error.code) || '').slice(0, 100),
        requestId: error && error.$metadata ? error.$metadata.requestId || null : null,
        extendedRequestId: error && error.$metadata ? error.$metadata.extendedRequestId || null : null,
        attempts: error && error.$metadata ? error.$metadata.attempts || null : null
      }));
    }
    const wrapped = new Error('Object storage ' + verb + ' failed (' + (status || 'unknown') + '): ' + detail);
    wrapped.code = 'object_storage_http_' + (status || 'error');
    updateState(false, wrapped, env);
    throw wrapped;
  }
}
async function putObjectBuffer(key, bytes, contentType = 'application/octet-stream', env = process.env) {
  return requestObject('PUT', key, Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes), contentType, env);
}
async function getObjectBuffer(key, env = process.env) {
  return requestObject('GET', key, null, null, env);
}
async function deleteObject(key, env = process.env) {
  return requestObject('DELETE', key, null, null, env);
}
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
  return {
    configured,
    writable: configured && Boolean(current.writable),
    checked_at: current.checked_at || null,
    error_code: current.error_code || null,
    missing_variables: missingVariables(env),
    prefix: env.OBJECT_STORAGE_PREFIX || 'mindscape-studio',
    backend: 'Backblaze B2 (S3-compatible object storage)'
  };
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
    const missing = missingVariables();
    let endpointDiagnostic = { parseable: false, https: false, hasQuery: false, hasHash: false };
    if (!missing.includes('OBJECT_STORAGE_ENDPOINT')) {
      try {
        const endpoint = new URL(process.env.OBJECT_STORAGE_ENDPOINT.trim());
        endpointDiagnostic = {
          parseable: true,
          https: endpoint.protocol === 'https:',
          hasQuery: Boolean(endpoint.search),
          hasHash: Boolean(endpoint.hash)
        };
      } catch {}
    }
    console.error('Object storage initialization skipped: configuration validation failed (redacted):', JSON.stringify({
      missingOrEmptyVariables: missing,
      endpoint: endpointDiagnostic
    }));
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
  initializeObjectStorage,
  isObjectStorageConfigured,
  getObjectStorageStatus,
  putObjectBuffer,
  getObjectBuffer,
  deleteObject,
  persistLocalFile,
  persistGeneratedFile,
  getGeneratedObjectBuffer
};
