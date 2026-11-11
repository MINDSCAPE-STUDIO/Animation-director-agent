const { readBible, getStyleContract } = require('./style-bible');
const { getMasterAsset, buildAssetContract } = require('./master-assets');

const CHECKS = ['character_identity', 'proportions', 'clothing', 'palette', 'line_style', 'shading', 'texture', 'environment', 'lighting', 'camera', 'motion'];

function validateGeneration({ projectId = 'default', assetId = null, generation }) {
  const styleBible = readBible(projectId);
  const styleContract = getStyleContract(projectId);
  const assetContract = assetId ? buildAssetContract(assetId) : null;
  const findings = [];
  if (!styleBible) findings.push({ code: 'style_bible_missing', category: 'style', severity: 'medium', confidence: 1, message: 'No Style Bible found.' });
  if (assetId && !assetContract) findings.push({ code: 'master_asset_missing', category: 'character', severity: 'high', confidence: 1, message: `Master Asset ${assetId} was requested but not found.` });
  if (assetContract && assetContract.status !== 'approved') findings.push({ code: 'master_asset_not_approved', category: 'character', severity: 'medium', confidence: 1, message: `Master Asset ${assetId} is ${assetContract.status}.` });
  const result = generation?.result || {};
  const output = result.output || result.url || result.video_url || result.image_url || null;
  if (!output && generation?.status === 'completed') findings.push({ code: 'missing_output_reference', category: 'technical', severity: 'high', confidence: 1, message: 'Generation completed without an output reference.' });
  const checks = Object.fromEntries(CHECKS.map(name => [name, { status: 'pending', confidence: 0, expected: null, observed: null }]));
  checks.style_contract = { status: styleContract ? 'present' : 'missing', confidence: 1, expected: styleContract?.version || null, observed: generation?.style_bible_version || null };
  checks.master_asset_contract = { status: assetContract ? 'present' : 'not_selected', confidence: 1, expected: assetContract?.version || null, observed: generation?.master_asset_version || null };
  return {
    validator_version: '1.0',
    status: findings.some(f => f.severity === 'high') ? 'blocked' : findings.length ? 'needs_review' : 'pending_visual_evaluation',
    project_id: projectId,
    asset_id: assetId,
    generation_id: generation?.job_id || generation?.id || null,
    provider: generation?.provider || null,
    model: generation?.model || null,
    model_version: generation?.model_version || null,
    style_bible_version: styleBible?.version || null,
    master_asset_version: assetContract?.version || null,
    checks,
    findings,
    output_reference: output,
    visual_inspection_required: true,
    created_at: new Date().toISOString()
  };
}

module.exports = { validateGeneration };
