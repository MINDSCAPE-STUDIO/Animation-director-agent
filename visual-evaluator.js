const { validateGeneration } = require('./style-validator');
const DIMENSIONS=['character_identity','proportions','clothing','palette','line_style','shading','texture','environment','lighting','camera','motion'];
function createVisualEvaluation({projectId='default',assetId=null,generation,observations={}}){
  const contract=validateGeneration({projectId,assetId,generation});
  const checks={...contract.checks}; const findings=[...contract.findings];
  for(const dimension of DIMENSIONS){const o=observations[dimension];if(!o)continue;checks[dimension]={status:o.status||'reviewed',confidence:Number(o.confidence||0),expected:o.expected??null,observed:o.observed??null,score:typeof o.score==='number'?o.score:null};if(o.error)findings.push({code:o.error.code||`${dimension}_drift`,category:o.error.category||dimension,severity:o.error.severity||'medium',confidence:Number(o.confidence||0),message:o.error.message||`${dimension} requires correction`,expected:o.expected??null,observed:o.observed??null});}
  const reviewed=DIMENSIONS.filter(d=>checks[d]?.status==='reviewed').length;
  const average=reviewed?Number((DIMENSIONS.reduce((sum,d)=>sum+(checks[d]?.score??0),0)/reviewed).toFixed(2)):null;
  const status=findings.some(f=>f.severity==='high')?'rejected':reviewed===DIMENSIONS.length?(findings.length?'needs_review':'approved'):contract.status;
  return {...contract,evaluator_version:'1.0',evaluation_mode:reviewed?'multimodal_observation':'contract_only',status,overall_score:average,checks,findings,visual_inspection_required:reviewed<DIMENSIONS.length,evaluated_at:reviewed?new Date().toISOString():null};
}
module.exports={createVisualEvaluation,DIMENSIONS};
