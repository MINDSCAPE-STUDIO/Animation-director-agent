function getFallbackReadiness(env=process.env){
  const falReady=Boolean(env.FAL_KEY);
  const pixazoReady=Boolean(env.PIXAZO_API_KEY&&env.PUBLIC_BASE_URL);
  const imageModel=env.IMAGE_FALLBACK_MODEL||env.IMAGE_MODEL_FALLBACK||'fal-ai/flux/schnell';
  const noFallback={ready:false,provider:null,model:null};
  const imageGeneration=falReady
    ? {ready:true,provider:'fal',model:imageModel}
    : {...noFallback};
  let imageToVideo={...noFallback};
  if(pixazoReady){
    imageToVideo={ready:true,provider:'pixazo_ltx',model:env.PIXAZO_MODEL||'ltx-video'};
  }else if(falReady&&env.FAL_I2V_FALLBACK_MODEL){
    imageToVideo={ready:true,provider:'fal',model:env.FAL_I2V_FALLBACK_MODEL};
  }
  const textToVideo=falReady&&env.FAL_T2V_FALLBACK_MODEL
    ? {ready:true,provider:'fal',model:env.FAL_T2V_FALLBACK_MODEL}
    : {...noFallback};
  return {
    image_generation:imageGeneration,
    image_to_video:imageToVideo,
    text_to_video:textToVideo
  };
}

module.exports={getFallbackReadiness};
