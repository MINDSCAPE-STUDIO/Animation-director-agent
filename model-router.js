// Cloud-only model router. API keys stay on the server.
const PROVIDERS={replicate:'https://api.replicate.com/v1',fal:'https://queue.fal.run'};
const FREE_HF_SPACE=process.env.HF_SPACE_NAME||'zerogpu-aoti/wan2-2-fp8da-aoti-faster';

function selectModel(job){
  if(job.type==='text_to_video'||job.type==='image_to_video'){
    if(process.env.VIDEO_PROVIDER==='hf_space') return {provider:'hf_space',model:FREE_HF_SPACE};
    if(process.env.VIDEO_PROVIDER==='fal') return {provider:'fal',model:process.env.VIDEO_MODEL||(job.type==='image_to_video'?'wan/v2.6/image-to-video':'wan/v2.6/text-to-video')};
    return {provider:'replicate',model:process.env.VIDEO_MODEL||'bytedance/seedance-1-pro-fast'};
  }
  if(job.type==='video_understanding') return {provider:'fal',model:process.env.VISION_MODEL||'fal-ai/video-understanding'};
  return process.env.IMAGE_PROVIDER==='fal'?{provider:'fal',model:process.env.IMAGE_MODEL||'fal-ai/flux-pro/v1.1'}:{provider:'replicate',model:process.env.IMAGE_MODEL||'black-forest-labs/flux-1.1-pro'};
}

function buildPrompt(shot){return [
  `Character: ${shot.character}. Preserve exact identity, costume and silhouette.`,
  `Action: ${shot.action}. Path: ${shot.path}.`,
  `Camera: ${shot.camera}.`,
  `Gaze: ${shot.performance?.gaze||'as directed'}. Expression: ${shot.performance?.expression||'as directed'}.`,
  `Body language: ${shot.performance?.body_language||'natural'}.`,
  `Environment: ${shot.background}.`,
  `Director priorities: ${(shot.priorities||[]).join(', ')}.`,
  'Maintain temporal consistency, anatomy, identity, lighting, perspective and screen direction. Do not introduce unrequested characters, props or camera changes.'
].join(' ')}

function createGenerationJob(job){
  const route=selectModel(job);
  const input={...(job.input||{})};
  if(job.type.includes('video')){
    input.duration=Math.max(2,Math.min(12,Number(input.duration)||5));
    input.fps=Number(input.fps)||24;
    input.resolution=input.resolution||process.env.VIDEO_RESOLUTION||'480p';
    input.aspect_ratio=input.aspect_ratio||'16:9';
    input.camera_fixed=input.camera_fixed??false;
  }
  return {
    id:`job_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    status:'queued',provider:route.provider,model:route.model,type:job.type,
    prompt:job.prompt||buildPrompt(job.shot),attempt:1,maxAttempts:3,
    createdAt:new Date().toISOString(),input
  };
}

async function submitReplicate(job){
  const token=process.env.REPLICATE_API_TOKEN;
  if(!token)throw Error('REPLICATE_API_TOKEN is not configured');
  const r=await fetch(`${PROVIDERS.replicate}/models/${job.model}/predictions`,{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({input:{...job.input,prompt:job.prompt}})
  });
  if(!r.ok)throw Error(`Replicate ${r.status}: ${await r.text()}`);
  return r.json();
}

async function refreshReplicate(job){
  const token=process.env.REPLICATE_API_TOKEN;
  if(!token||!job.providerResponse?.id)return job;
  const r=await fetch(`${PROVIDERS.replicate}/predictions/${job.providerResponse.id}`,{headers:{Authorization:`Bearer ${token}`}});
  if(!r.ok)return job;
  const p=await r.json();
  return {...job,status:p.status==='succeeded'?'completed':p.status==='failed'?'failed':p.status==='canceled'?'canceled':'running',providerResponse:p,result:p.output||null,error:p.error||null};
}

async function submitFal(job){
  const key=process.env.FAL_KEY;
  if(!key)throw Error('FAL_KEY is not configured');
  const r=await fetch(`${PROVIDERS.fal}/${job.model}`,{
    method:'POST',headers:{Authorization:`Key ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({...job.input,prompt:job.prompt})
  });
  if(!r.ok)throw Error(`fal ${r.status}: ${await r.text()}`);
  return r.json();
}

async function submitHfSpace(job){
  if(job.type!=='image_to_video') throw Error('The free Hugging Face ZeroGPU route currently supports Image → Video. Select Image → Video and provide a reference image URL.');
  if(!job.input?.image) throw Error('Free Image → Video requires a reference image URL.');
  const {Client,handle_file}=require('@gradio/client');
  const options={events:['status','data']};
  if(process.env.HF_TOKEN) options.hf_token=process.env.HF_TOKEN;
  const app=await Client.connect(job.model,options);
  const duration=Math.max(0.5,Math.min(5,Number(job.input.duration)||3.5));
  const result=await app.predict('/generate_video',[
    handle_file(job.input.image),
    job.prompt,
    4,
    '',
    duration,
    1,
    1,
    Math.floor(Math.random()*2147483647),
    true
  ]);
  const data=result?.data||result;
  const video=data?.[0];
  const url=typeof video==='string'?video:video?.url||video?.path;
  if(!url) throw Error('Hugging Face Space returned no video URL.');
  return {output:url,raw:data};
}

async function submit(job){
  let result;
  if(job.provider==='hf_space') result=await submitHfSpace(job);
  else if(job.provider==='fal') result=await submitFal(job);
  else result=await submitReplicate(job);
  return {...job,status:job.provider==='hf_space'?'completed':'submitted',providerResponse:result,result:job.provider==='hf_space'?result.output:undefined,submittedAt:new Date().toISOString()};
}

async function refresh(job){
  return job.provider==='replicate'?refreshReplicate(job):job;
}
module.exports={selectModel,buildPrompt,createGenerationJob,submit,refresh};
