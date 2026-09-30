const {createGenerationJob,submit,refresh:refreshProvider}=require('./model-router');
class GenerationQueue{
  constructor(){this.jobs=new Map()}
  async enqueue(input){
    const job=createGenerationJob(input);
    this.jobs.set(job.id,job);
    // Do not hold the HTTP request open while Hugging Face generates/assembles video.
    // The browser receives the job id immediately and polls /jobs/:id.
    void this.start(job);
    return job;
  }
  async start(job){
    try{
      const running={...job,status:'running',startedAt:new Date().toISOString()};
      this.jobs.set(job.id,running);
      const submitted=await submit(running);
      this.jobs.set(job.id,submitted);
      return submitted;
    }catch(error){
      console.error(`Generation job ${job.id} failed:`,error);
      const failed={...job,status:'failed',error:error.message,failedAt:new Date().toISOString()};
      this.jobs.set(job.id,failed);
      return failed;
    }
  }
  async refresh(id){
    const job=this.jobs.get(id);
    if(!job)return null;
    if(['completed','failed','canceled'].includes(job.status))return job;
    const next=await refreshProvider(job);
    this.jobs.set(id,next);
    return next;
  }
  get(id){return this.jobs.get(id)||null}
  list(){return [...this.jobs.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,50)}
  async retry(id){
    const old=this.jobs.get(id);
    if(!old||old.attempt>=old.maxAttempts)return old;
    const retry={...old,attempt:old.attempt+1,status:'queued',error:null,result:null};
    this.jobs.set(id,retry);
    void this.start(retry);
    return retry;
  }
}
module.exports={GenerationQueue};
