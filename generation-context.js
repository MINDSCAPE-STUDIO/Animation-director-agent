const { readBible, getStyleContract } = require('./style-bible');
const { getMasterAsset, buildAssetContract } = require('./master-assets');

function buildGenerationContext(job) {
  const projectId = job.project_id || job.projectId || job.input?.project_id || 'default';
  const styleBible = readBible(projectId);
  const assetId = job.asset_id || job.assetId || job.input?.master_asset_id || job.input?.masterAssetId || job.shot?.master_asset_id;
  const masterAsset = assetId ? getMasterAsset(assetId) : null;
  const styleContract = getStyleContract(projectId);
  const assetContract = assetId ? buildAssetContract(assetId) : null;
  const styleRules = JSON.stringify(styleContract);
  const assetRules = assetContract ? JSON.stringify(assetContract) : 'No Master Asset selected.';
  return { styleBible, masterAsset, styleContract, assetContract, styleRules, assetRules };
}

function injectGenerationContext(prompt, context) {
  return `${prompt}\n\nMINDSCAPE STYLE CONTRACT\n${context.styleRules}\n\nMINDSCAPE MASTER ASSET CONTRACT\n${context.assetRules}\n\nNON-NEGOTIABLE PRESERVATION RULE: Treat approved Style Bible and Master Asset contracts as canonical. Do not redesign, recolor, restyle, alter proportions, clothing, identity, camera rules, or established environment details unless explicitly requested. Preserve reference identity and visual language. If the request conflicts with a canonical contract, follow the explicit user change but record the conflict for evaluation.`;
}

module.exports = { buildGenerationContext, injectGenerationContext };
