const {createGenerationJob,submit,refresh:refreshProvider}=require('./model-router');
const {appendGenerationEvent}=require('./generation-history');
const {buildEvaluationFromGeneration}=require('./evaluation-hooks');
const {recordEvaluation}=require('./model-performance');
const {createEvaluation}=require('./evaluation');

class GenerationQueue{
  constructor(){this.jobs=new Map()}
  async enqueue(input){
    const job=createGenerationJob(input);
    this.jobs.set(job.id,job);
    appendGenerationEvent(job,'queued');
    void this.start(job);
    return job;
  }
  recordPendingEvaluation(job){
    try{
      const evaluation=buildEvaluationFromGeneration(job,{status:'pending',evaluator:'pending'});
      recordEvaluation(evaluation);
      return evaluation;
    }catch(error){
      console.error(`Evaluation initialization for ${job.id} failed:`,error);
      return null;
    }
  }
  recordTerminalEvaluation(job){
    try{
      const evaluation=createEvaluation({
        ...buildEvaluationFromGeneration(job,{status:job.status==='completed'?'pending':'not_evaluated',evaluator:'pending'}),
        status:job.status==='completed'?'pending':'not_evaluated'
      });
      recordEvaluation(evaluation);
      return evaluation;
    }catch(error){
      console.error(`Evaluation recording for ${job.id} failed:`,error);
      return null;
    }
  }
  async start(job){
    try{
      const running={...job,status:'running',startedAt:new Date().toISOString()};
      this.jobs.set(job.id,running);
      appendGenerationEvent(running,'started');
      this.recordPendingEvaluation(running);
      const submitted=await submit(running);
      this.jobs.set(job.id,submitted);
      appendGenerationEvent(submitted,'completed');
      this.recordTerminalEvaluation(submitted);
      return submitted;
    }catch(error){
      console.error(`Generation job ${job.id} failed:`,error);
      const failed={...job,status:'failed',error:error.message,failedAt:new Date().toISOString()};
      this.jobs.set(job.id,failed);
      appendGenerationEvent(failed,'failed',{error_type:error.name||'Error'});
      this.recordTerminalEvaluation(failed);
      return failed;
    }
  }
  async refresh(id){
    const job=this.jobs.get(id);
    if(!job)return null;
    if(['completed','failed','canceled'].includes(job.status))return job;
    try{
      const next=await refreshProvider(job);
      this.jobs.set(id,next);
      if(next.status!==job.status){
        appendGenerationEvent(next,next.status==='completed'?'completed':'provider_status_changed');
        if(['completed','failed','canceled'].includes(next.status))this.recordTerminalEvaluation(next);
      }
      return next;
    }catch(error){
      const failed={...job,status:'failed',error:error.message,failedAt:new Date().toISOString()};
      this.jobs.set(id,failed);
      appendGenerationEvent(failed,'failed',{error_type:error.name||'Error'});
      this.recordTerminalEvaluation(failed);
      return failed;
    }
  }
  get(id){return this.jobs.get(id)||null}
  list(){return [...this.jobs.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,50)}
  async retry(id){
    const old=this.jobs.get(id);
    if(!old||old.attempt>=old.maxAttempts)return old;
    const retry={...old,attempt:old.attempt+1,status:'queued',error:null,result:null};
    this.jobs.set(id,retry);
    appendGenerationEvent(retry,'retry',{retry_of:id});
    void this.start(retry);
    return retry;
  }
}
module.exports={GenerationQueue};
