const {createGenerationJob,submit}=require('./model-router');
class GenerationQueue{
  constructor(){this.jobs=new Map()}
  async enqueue(input){const job=createGenerationJob(input);this.jobs.set(job.id,job);return this.start(job)}
  async start(job){try{const submitted=await submit(job);this.jobs.set(job.id,submitted);return submitted}catch(error){const failed={...job,status:'failed',error:error.message,failedAt:new Date().toISOString()};this.jobs.set(job.id,failed);return failed}}
  get(id){return this.jobs.get(id)||null}
  list(){return [...this.jobs.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
  async retry(id){const old=this.jobs.get(id);if(!old||old.attempt>=old.maxAttempts)return old;const retry={...old,attempt:old.attempt+1,status:'queued'};this.jobs.set(id,retry);return this.start(retry)}
}
module.exports={GenerationQueue};
