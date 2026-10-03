const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { GENERATED_OUTPUT_DIR } = require('./storage-paths');

const MAX_MEDIA_BYTES = 512 * 1024 * 1024;
const MIME_EXTENSIONS = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['video/mp4', 'mp4'],
  ['video/webm', 'webm'],
]);
const ALLOWED_EXTENSIONS = new Set(MIME_EXTENSIONS.values());

function isAllowedHost(provider, hostname) {
  if (provider === 'replicate') return hostname === 'replicate.delivery' || hostname.endsWith('.replicate.delivery');
  if (provider === 'fal') return hostname === 'fal.media' || hostname.endsWith('.fal.media');
  return false;
}

function extensionFor(url, contentType) {
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (MIME_EXTENSIONS.has(mime)) return MIME_EXTENSIONS.get(mime);
  const extension = path.extname(url.pathname).slice(1).toLowerCase();
  return ALLOWED_EXTENSIONS.has(extension) ? extension : null;
}

async function downloadProviderMedia(rawUrl, { provider, jobId, outputDir = GENERATED_OUTPUT_DIR, fetchImpl = fetch, maxBytes = MAX_MEDIA_BYTES }) {
  let url = new URL(rawUrl);
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    if (url.protocol !== 'https:' || !isAllowedHost(provider, url.hostname.toLowerCase())) throw new Error('untrusted_media_host');
    const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(90_000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirectCount === 3) throw new Error('too_many_media_redirects');
      const location = response.headers?.get('location');
      if (!location) throw new Error('media_redirect_missing_location');
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new Error(`media_download_http_${response.status}`);
    const extension = extensionFor(url, response.headers?.get('content-type'));
    if (!extension) throw new Error('unsupported_media_type');
    const contentLength = Number(response.headers?.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error('media_too_large');
    const safeJobId = String(jobId || 'job').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
    const filename = `mindscape-${provider}-${safeJobId}-${crypto.randomBytes(6).toString('hex')}.${extension}`;
    fs.mkdirSync(outputDir, { recursive: true });
    const file = path.join(outputDir, filename);
    const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      const counter = new Transform({
        transform(chunk, encoding, callback) {
          this.bytes = (this.bytes || 0) + chunk.length;
          if (this.bytes > maxBytes) return callback(new Error('media_too_large'));
          callback(null, chunk);
        },
      });
      const source = response.body ? Readable.fromWeb(response.body) : Readable.from([Buffer.from(await response.arrayBuffer())]);
      await pipeline(source, counter, fs.createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
      fs.renameSync(temporary, file);
    } catch (error) {
      try { fs.unlinkSync(temporary); } catch {}
      throw error;
    }
    return `/generated/${filename}`;
  }
  throw new Error('media_download_failed');
}

async function persistProviderMedia(value, options = {}) {
  const warnings = [];
  async function visit(item) {
    if (typeof item === 'string' && /^https:\/\//i.test(item)) {
      try {
        return await downloadProviderMedia(item, options);
      } catch (error) {
        warnings.push(`Provider output was not copied to local storage (${error.message || 'download_failed'}).`);
        return item;
      }
    }
    if (Array.isArray(item)) return Promise.all(item.map(visit));
    if (item && typeof item === 'object') {
      const entries = await Promise.all(Object.entries(item).map(async ([key, child]) => [key, await visit(child)]));
      return Object.fromEntries(entries);
    }
    return item;
  }
  return { result: await visit(value), warning: warnings.length ? [...new Set(warnings)].join(' ') : null };
}

module.exports = { MAX_MEDIA_BYTES, downloadProviderMedia, persistProviderMedia };
