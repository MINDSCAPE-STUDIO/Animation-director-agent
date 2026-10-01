const {createGenerationJob,submit,refresh:refreshProvider}=require('./model-router');
const {appendGenerationEvent}=require('./generation-history');
const {buildEvaluationFromGeneration}=require('./evaluation-hooks');
const {recordEvaluation}=require('./model-performance');
const {createEvaluation}=require('./evaluation');
const {evaluateWithGemini}=require('./gemini-visual-provider');

function visualScores(observations={}){const get=n=>typeof observations[n]?.score==='number'?observations[n].score:null;const avg=names=>{const v=names.map(get).filter(x=>x!==null);return v.length?Number((v.reduce((a,b)=>a+b,0)/v.length).toFixed(2)):null};return{character_identity:avg(['character_identity','proportions','clothing']),style_consistency:avg(['palette','line_style','shading','texture']),motion_quality:get('motion'),camera_accuracy:get('camera'),environment_consistency:avg(['environment','lighting']),prompt_adherence:avg(['character_identity','clothing','environment','camera','motion'])}}

class GenerationQueue{
  constructor(){this.jobs=new Map()}
  async enqueue(input){const job=createGenerationJob(input);this.jobs.set(job.id,job);appendGenerationEvent(job,'queued');void this.start(job);return job}
  recordPendingEvaluation(job){try{const evaluation=buildEvaluationFromGeneration(job,{status:'pending',evaluator:'pending'});recordEvaluation(evaluation);return evaluation}catch(error){console.error(`Evaluation initialization for ${job.id} failed:`,error);return null}}
  async recordTerminalEvaluation(job){
    try{
      if(job.status!=='completed'){const evaluation=createEvaluation({...buildEvaluationFromGeneration(job,{status:'not_evaluated',evaluator:'pending'}),status:'not_evaluated'});recordEvaluation(evaluation);return evaluation}
      const visual=await evaluateWithGemini({projectId:job.project_id||job.projectId||'default',assetId:job.master_asset_id||job.asset_id||job.input?.master_asset_id||null,generation:job});
      const errors=visual.findings||[];const status=errors.some(e=>e.severity==='high'||e.severity==='critical')?'rejected':errors.length?'needs_review':'approved';const scores=visualScores(visual.observations);
      const evaluation=createEvaluation({...buildEvaluationFromGeneration(job,{status,evaluator:`gemini:${visual.model}`,scores,errors,notes:visual.summary,evaluated_at:new Date().toISOString()}),status,evaluator:`gemini:${visual.model}`,scores,errors,notes:visual.summary});
      recordEvaluation(evaluation);return evaluation;
    }catch(error){
      console.error(`Visual evaluation for ${job.id} failed:`,error);const evaluation=createEvaluation({...buildEvaluationFromGeneration(job,{status:'evaluation_error',evaluator:'gemini',errors:[{category:'technical',code:'provider_error',severity:'medium',confidence:100,description:error.message,auto_detected:true,correction_attempted:false}]}),status:'evaluation_error',evaluator:'gemini',notes:`Visual evaluator unavailable: ${error.message}`});recordEvaluation(evaluation);return evaluation
    }
  }
  async start(job){try{const running={...job,status:'running',startedAt:new Date().toISOString()};this.jobs.set(job.id,running);appendGenerationEvent(running,'started');this.recordPendingEvaluation(running);const submitted=await submit(running);this.jobs.set(job.id,submitted);appendGenerationEvent(submitted,'completed');await this.recordTerminalEvaluation(submitted);return submitted}catch(error){console.error(`Generation job ${job.id} failed:`,error);const failed={...job,status:'failed',error:error.message,failedAt:new Date().toISOString()};this.jobs.set(job.id,failed);appendGenerationEvent(failed,'failed',{error_type:error.name||'Error'});await this.recordTerminalEvaluation(failed);return failed}}
  async refresh(id){const job=this.jobs.get(id);if(!job)return null;if(['completed','failed','canceled'].includes(job.status))return job;try{const next=await refreshProvider(job);this.jobs.set(id,next);if(next.status!==job.status){appendGenerationEvent(next,next.status==='completed'?'completed':'provider_status_changed');if(['completed','failed','canceled'].includes(next.status))await this.recordTerminalEvaluation(next)}return next}catch(error){const failed={...job,status:'failed',error:error.message,failedAt:new Date().toISOString()};this.jobs.set(id,failed);appendGenerationEvent(failed,'failed',{error_type:error.name||'Error'});await this.recordTerminalEvaluation(failed);return failed}}
  get(id){return this.jobs.get(id)||null}
  list(){return [...this.jobs.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,50)}
  async retry(id){const old=this.jobs.get(id);if(!old||old.attempt>=old.maxAttempts)return old;const retry={...old,attempt:old.attempt+1,status:'queued',error:null,result:null};this.jobs.set(id,retry);appendGenerationEvent(retry,'retry',{retry_of:id});void this.start(retry);return retry}
}
module.exports={GenerationQueue};
