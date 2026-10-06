// Phase-1 I2V capability policy.
// Only candidates explicitly audited for our image-to-video contract belong here.
// Unverified adapters must not be activated in production.

const CANDIDATES = [
  {
    id: 'veoaifree-web',
    provider: 'veoaifree-web',
    capability: 'image_to_video',
    access: 'no_auth_web_adapter',
    free: true,
    status: 'candidate',
    notes: 'Runtime/API contract still requires verification.'
  },
  {
    id: 'pollinations-video',
    provider: 'pollinations',
    capability: 'image_to_video',
    access: 'api',
    free: true,
    status: 'candidate',
    notes: 'Runtime I2V contract and current free availability require verification.'
  },
  {
    id: 'novita/wan-2.2-i2v',
    provider: 'novita',
    capability: 'image_to_video',
    access: 'api_key',
    free: false,
    status: 'fallback',
    notes: 'Trial/credit-based reliability fallback, not permanent free capacity.'
  },
  {
    id: 'segmind/i2v',
    provider: 'segmind',
    capability: 'image_to_video',
    access: 'api_key',
    free: false,
    status: 'fallback',
    notes: 'Credit-based fallback; activate only when explicitly configured.'
  }
];

function parseConfiguredModels(value) {
  return String(value || '').split(',').map(v => v.trim()).filter(Boolean);
}

function getI2VCandidates() {
  const configured = parseConfiguredModels(process.env.OMNIROUTE_I2V_MODELS);
  if (!configured.length) return CANDIDATES.slice();
  const allowed = new Set(configured);
  return CANDIDATES.filter(c => allowed.has(c.id) || allowed.has(c.provider));
}

function isCandidate(model) {
  if (!model || model === 'auto') return true;
  return getI2VCandidates().some(c => c.id === model || c.provider === model);
}

function assertI2VCapability(model) {
  if (!isCandidate(model)) {
    throw new Error('Configured OmniRoute video model is not in the verified I2V candidate policy: ' + String(model));
  }
}

module.exports = { CANDIDATES, getI2VCandidates, isCandidate, assertI2VCapability };
