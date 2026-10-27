const fs=require('fs');
const path=require('path');
const {isValidErrorCode,ERROR_SEVERITIES}=require('./error-taxonomy');

const {EVALUATIONS_FILE:STORE}=require('./storage-paths');

function now(){return new Date().toISOString()}
function append(record){fs.appendFileSync(STORE,JSON.stringify(record)+'\n','utf8')}
function normalizeScore(value){if(value===undefined||value===null||value==='')return null;const n=Number(value);if(!Number.isFinite(n))throw new Error('Scores must be numeric.');return Math.max(0,Math.min(100,n))}

function createEvaluation(input={}){
  const evaluation={
    evaluation_id:`eval_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    job_id:input.job_id||null,
    project_id:input.project_id||null,
    shot_id:input.shot_id||null,
    generation_type:input.generation_type||null,
    provider:input.provider||null,
    model:input.model||null,
    model_version:input.model_version||null,
    evaluator:input.evaluator||'manual',
    status:input.status||'reviewed',
    scores:{
      character_identity:normalizeScore(input.scores?.character_identity),
      style_consistency:normalizeScore(input.scores?.style_consistency),
      motion_quality:normalizeScore(input.scores?.motion_quality),
      camera_accuracy:normalizeScore(input.scores?.camera_accuracy),
      environment_consistency:normalizeScore(input.scores?.environment_consistency),
      prompt_adherence:normalizeScore(input.scores?.prompt_adherence)
    },
    errors:[],
    notes:input.notes||null,
    created_at:now()
  };

  for(const raw of (Array.isArray(input.errors)?input.errors:[])){
    const category=raw.category;
    const code=raw.code;
    if(!isValidErrorCode(category,code))throw new Error(`Invalid error code: ${category}/${code}`);
    const severity=raw.severity||'medium';
    if(!ERROR_SEVERITIES.includes(severity))throw new Error(`Invalid severity: ${severity}`);
    evaluation.errors.push({
      category,code,severity,
      confidence:normalizeScore(raw.confidence),
      expected:raw.expected??null,
      observed:raw.observed??null,
      description:raw.description||null,
      auto_detected:Boolean(raw.auto_detected),
      correction_attempted:Boolean(raw.correction_attempted)
    });
  }
  append(evaluation);
  return evaluation;
}

function listEvaluations(limit=100){
  if(!fs.existsSync(STORE))return [];
  const n=Math.max(1,Math.min(1000,Number(limit)||100));
  return fs.readFileSync(STORE,'utf8').split('\n').filter(Boolean).slice(-n).reverse().map(line=>JSON.parse(line));
}

module.exports={createEvaluation,listEvaluations};
