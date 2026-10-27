const fs=require('fs');
const path=require('path');

// v1: append-only local history. The schema is intentionally provider/model agnostic.
// Replace the storage adapter with Postgres/SQLite later without changing the record shape.
const {HISTORY_FILE}=require('./storage-paths');
const {persistLocalFile}=require('./object-storage');

function ensureStore(){fs.mkdirSync(path.dirname(HISTORY_FILE),{recursive:true})}
function now(){return new Date().toISOString()}

function sanitizeJob(job){
  const input={...(job.input||{})};
  // Never persist large base64 reference images or secrets.
  delete input.imageData;
  if(typeof input.image==='string'&&input.image.startsWith('data:image/'))input.image='[uploaded-reference-image]';
  return input;
}

function recordFromJob(job,event,extra={}){
  return {
    record_id:`gen_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    event,
    recorded_at:now(),
    job_id:job.id,
    project_id:job.projectId||job.project_id||'default',
    shot_id:job.shotId||job.shot_id||job.shot?.shot_id||null,
    generation_type:job.type||null,
    provider:job.provider||null,
    model:job.model||null,
    attempt:job.attempt||1,
    prompt:job.prompt||null,
    input:sanitizeJob(job),
    status:job.status||null,
    result:job.result||null,
    error:job.error||null,
    ...extra
  };
}

function appendGenerationEvent(job,event,extra={}){
  try{
    ensureStore();
    fs.appendFileSync(HISTORY_FILE,JSON.stringify(recordFromJob(job,event,extra))+'\n');
    void persistLocalFile(HISTORY_FILE,'metadata/generation-history.jsonl').catch(error=>console.error('Generation history backup failed: '+error.message));
  }catch(error){
    console.error(`Generation history write failed: ${error.message}`);
  }
}

function listGenerationHistory(limit=100){
  try{
    if(!fs.existsSync(HISTORY_FILE))return[];
    const lines=fs.readFileSync(HISTORY_FILE,'utf8').split('\n').filter(Boolean);
    return lines.slice(-Math.max(1,Math.min(Number(limit)||100,500))).reverse().map(line=>{try{return JSON.parse(line)}catch{return null}}).filter(Boolean);
  }catch(error){
    console.error(`Generation history read failed: ${error.message}`);
    return[];
  }
}

module.exports={appendGenerationEvent,listGenerationHistory,HISTORY_FILE};
