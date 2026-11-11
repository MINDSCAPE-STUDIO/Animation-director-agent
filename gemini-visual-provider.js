const fs = require('fs');
const path = require('path');
const { buildAssetContract } = require('./master-assets');
const { getStyleContract } = require('./style-bible');
const { ERROR_SEVERITIES, isValidErrorCode } = require('./error-taxonomy');

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.8-flash';
const DIMENSIONS = ['character_identity', 'proportions', 'clothing', 'palette', 'line_style', 'shading', 'texture', 'environment', 'lighting', 'camera', 'motion'];
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    dimensions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dimension: { type: 'string', enum: DIMENSIONS },
          score: { type: 'number', minimum: 0, maximum: 100 },
          confidence: { type: 'number', minimum: 0, maximum: 100 },
          status: { type: 'string', enum: ['pass', 'warning', 'fail'] },
          expected: { type: 'string' },
          observed: { type: 'string' },
          error_code: { type: 'string' },
          category: { type: 'string' },
          severity: { type: 'string', enum: ERROR_SEVERITIES },
          message: { type: 'string' }
        },
        required: ['dimension', 'score', 'confidence', 'status', 'expected', 'observed', 'error_code', 'category', 'severity', 'message']
      }
    }
  },
  required: ['summary', 'dimensions']
};

function dataUrlParts(value) {
  const m = typeof value === 'string' && value.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  return m ? { mimeType: m[1], data: m[2] } : null;
}

async function mediaToInline(value) {
  if (!value) return null;
  const data = dataUrlParts(value);
  if (data) return data;
  if (fs.existsSync(value)) {
    const ext = path.extname(value).toLowerCase();
    const mime = ext === '.mp4' ? 'video/mp4' : ext === '.webm' ? 'video/webm' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
    const stat = fs.statSync(value);
    if (stat.size > 95 * 1024 * 1024) throw Error('Visual evaluator input exceeds the inline 95 MB safety limit.');
    return { mimeType: mime, data: fs.readFileSync(value).toString('base64') };
  }
  if (/^https?:\/\//i.test(value)) {
    const r = await fetch(value);
    if (!r.ok) throw Error(`Could not download visual reference (${r.status}).`);
    const mime = (r.headers.get('content-type') || 'application/octet-stream').split(';')[0];
    const buffer = Buffer.from(await r.arrayBuffer());
    if (buffer.length > 95 * 1024 * 1024) throw Error('Visual evaluator input exceeds the inline 95 MB safety limit.');
    return { mimeType: mime, data: buffer.toString('base64') };
  }
  throw Error(`Visual reference could not be resolved: ${String(value).slice(0, 160)}`);
}

function outputReference(generation) {
  const result = generation?.result || {};
  const output = result.output || result.url || result.video_url || result.image_url || null;
  if (!output) return null;
  if (typeof output === 'string' && output.startsWith('/')) return path.join(__dirname, output.replace(/^\//, ''));
  return output;
}

function buildInstruction({ generation, styleContract, assetContract }) {
  return `You are Mindscape Studio's visual quality-control evaluator. Inspect the generated image/video against the canonical Style Bible, Master Asset and supplied reference media. Do not judge artistic taste. Judge objective adherence to the production contract and requested shot.\n\nGENERATION: ${generation?.type || 'unknown'}\nMODEL: ${generation?.provider || 'unknown'} / ${generation?.model || 'unknown'}\nPROMPT: ${generation?.prompt || ''}\n\nSTYLE BIBLE CONTRACT:\n${JSON.stringify(styleContract || {})}\n\nMASTER ASSET CONTRACT:\n${JSON.stringify(assetContract || {})}\n\nEvaluate all dimensions: character identity, proportions, clothing, palette, line style, shading, texture, environment, lighting, camera, motion. For video, inspect temporal consistency and motion across the supplied clip rather than only one frame. Use high severity only for material violations that should block production. If a dimension cannot be reliably judged, lower confidence and explain why. Return ONLY the requested JSON. Error codes must come from the Mindscape taxonomy; use an empty error_code when no error exists.`;
}

function sanitize(raw) {
  const dimensions = Array.isArray(raw?.dimensions) ? raw.dimensions : [];
  const findings = [];
  const observations = {};
  for (const d of dimensions) {
    if (!DIMENSIONS.includes(d.dimension)) continue;
    const score = Math.max(0, Math.min(100, Number(d.score) || 0));
    const confidence = Math.max(0, Math.min(100, Number(d.confidence) || 0));
    observations[d.dimension] = { status: 'reviewed', score, confidence, expected: d.expected || null, observed: d.observed || null };
    if (d.error_code && isValidErrorCode(d.category, d.error_code)) findings.push({
      code: d.error_code,
      category: d.category,
      severity: ERROR_SEVERITIES.includes(d.severity) ? d.severity : 'medium',
      confidence,
      expected: d.expected || null,
      observed: d.observed || null,
      message: d.message || d.error_code,
      auto_detected: true,
      correction_attempted: false
    });
  }
  return { summary: raw?.summary || '', observations, findings };
}

async function evaluateWithGemini({ projectId = 'default', assetId = null, generation }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Error('GEMINI_API_KEY is not configured for visual evaluation.');
  const model = process.env.VISION_MODEL || DEFAULT_MODEL;
  const styleContract = getStyleContract(projectId);
  const assetContract = assetId ? buildAssetContract(assetId) : null;
  const parts = [];
  const output = outputReference(generation);
  const outputInline = await mediaToInline(output);
  if (outputInline) parts.push({ inlineData: outputInline });
  const refs = [];
  if (generation?.input?.image) refs.push(generation.input.image);
  if (Array.isArray(generation?.input?.images)) refs.push(...generation.input.images);
  if (assetContract?.source_uri) refs.push(assetContract.source_uri);
  if (Array.isArray(assetContract?.reference_uris)) refs.push(...assetContract.reference_uris);
  for (const ref of [...new Set(refs)].slice(0, 10)) {
    try {
      const inline = await mediaToInline(ref);
      if (inline) parts.push({ inlineData: inline });
    } catch (error) {
      console.warn(`Visual reference skipped: ${error.message}`);
    }
  }
  parts.push({ text: buildInstruction({ generation, styleContract, assetContract }) });
  const body = { contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0 } };
  const r = await fetch(`${API}/${model}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw Error(`Gemini visual evaluator ${r.status}: ${text.slice(0, 1200)}`);
  const data = JSON.parse(text);
  const rawText = data.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
  if (!rawText) throw Error(`Gemini visual evaluator returned no structured result: ${text.slice(0, 1200)}`);
  let raw;
  try {
    raw = JSON.parse(rawText);
  } catch {
    throw Error(`Gemini visual evaluator returned invalid JSON: ${rawText.slice(0, 800)}`);
  }
  return { model, usageMetadata: data.usageMetadata || null, ...sanitize(raw) };
}

module.exports = { evaluateWithGemini, DIMENSIONS, DEFAULT_MODEL };
