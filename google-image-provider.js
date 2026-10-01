const fs=require('fs');

const API='https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL='gemini-3.1-flash-image';

function dataUrlParts(dataUrl){
  const m=typeof dataUrl==='string'&&dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/);
  return m?{mimeType:m[1],data:m[2]}:null;
}

async function toInlineData(image){
  if(!image)return null;
  const data=dataUrlParts(image);
  if(data)return data;
  if(/^https?:\/\//i.test(image)){
    const r=await fetch(image);
    if(!r.ok)throw Error(`Could not download reference image (${r.status}).`);
    const mime=(r.headers.get('content-type')||'image/png').split(';')[0];
    if(!/^image\/(png|jpeg|jpg|webp)$/i.test(mime))throw Error('Reference URL must point to PNG, JPG or WebP.');
    return{mimeType:mime,data:Buffer.from(await r.arrayBuffer()).toString('base64')};
  }
  if(fs.existsSync(image)){
    const ext=image.toLowerCase().endsWith('.webp')?'webp':image.toLowerCase().endsWith('.jpg')||image.toLowerCase().endsWith('.jpeg')?'jpeg':'png';
    return{mimeType:`image/${ext}`,data:fs.readFileSync(image).toString('base64')};
  }
  throw Error('Reference image could not be found.');
}

async function generateImage({prompt,input={}}){
  const key=process.env.GEMINI_API_KEY;
  if(!key)throw Error('GEMINI_API_KEY is not configured for Nano Banana 2. Add it to the Render environment.');
  const model=process.env.IMAGE_MODEL||DEFAULT_MODEL;
  const parts=[];
  const refs=Array.isArray(input.images)?input.images:(input.image?[input.image]:[]);
  for(const image of refs){const inline=await toInlineData(image);if(inline)parts.push({inlineData:inline});}
  parts.push({text:prompt});
  const body={contents:[{role:'user',parts}],generationConfig:{responseModalities:['IMAGE']}};
  if(input.aspect_ratio||input.image_size){
    body.generationConfig.imageConfig={};
    if(input.aspect_ratio)body.generationConfig.imageConfig.aspectRatio=input.aspect_ratio;
    if(input.image_size)body.generationConfig.imageConfig.imageSize=input.image_size;
  }
  const r=await fetch(`${API}/${model}:generateContent?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const text=await r.text();
  if(!r.ok)throw Error(`Gemini ${r.status}: ${text.slice(0,1000)}`);
  const data=JSON.parse(text);
  const candidates=data.candidates||[];
  for(const candidate of candidates){
    for(const part of candidate.content?.parts||[]){
      if(part.inlineData?.data){
        const mime=part.inlineData.mimeType||'image/png';
        return{mimeType:mime,data:part.inlineData.data,model,usageMetadata:data.usageMetadata||null};
      }
    }
  }
  throw Error(`Nano Banana 2 returned no image. Response: ${text.slice(0,1500)}`);
}

module.exports={generateImage};
