const { getStyleBible } = require('./style-bible');
const { getMasterAsset } = require('./master-assets');

function buildGenerationContext(job) {
  const styleBible = getStyleBible(job.project_id || job.projectId || 'default');
  const assetId = job.asset_id || job.assetId || job.input?.master_asset_id || job.input?.masterAssetId || job.shot?.master_asset_id;
  const masterAsset = assetId ? getMasterAsset(assetId) : null;
  const styleRules = styleBible ? [
    `Style Bible ${styleBible.version}: ${JSON.stringify(styleBible.visual_language || {})}`,
    `Palette: ${JSON.stringify(styleBible.color_palette || {})}`,
    `Character rules: ${JSON.stringify(styleBible.character_rules || {})}`,
    `Environment rules: ${JSON.stringify(styleBible.environment_rules || {})}`,
    `Motion rules: ${JSON.stringify(styleBible.motion_rules || {})}`,
    `Camera rules: ${JSON.stringify(styleBible.camera_rules || {})}`,
    `Preservation rules: ${JSON.stringify(styleBible.preservation_rules || {})}`,
    `Forbidden drift: ${JSON.stringify(styleBible.forbidden_drift || [])}`
  ].join('\n') : 'No project Style Bible found; use supplied references as the source of truth.';
  const assetRules = masterAsset ? [
    `Master Asset ${masterAsset.id} version ${masterAsset.version} status ${masterAsset.status}.`,
    `Canonical attributes: ${JSON.stringify(masterAsset.canonical_attributes || {})}`,
    `Preservation rules: ${JSON.stringify(masterAsset.preservation_rules || {})}`,
    `Source references: ${JSON.stringify(masterAsset.references || [])}`
  ].join('\n') : 'No Master Asset selected.';
  return { styleBible, masterAsset, styleRules, assetRules };
}

function injectGenerationContext(prompt, context) {
  return `${prompt}\n\nMINDSCAPE STYLE CONTRACT\n${context.styleRules}\n\nMINDSCAPE MASTER ASSET CONTRACT\n${context.assetRules}\n\nNON-NEGOTIABLE: Treat these contracts as higher priority than creative improvisation. Do not redesign, recolor, restyle, alter proportions, clothing, identity, camera rules, or established environment details unless explicitly requested. If a conflict exists, preserve the canonical contract and flag it for evaluation.`;
}

module.exports = { buildGenerationContext, injectGenerationContext };
