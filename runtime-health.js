function providerStatus(provider, model, credential, environment) {
  const required = Boolean(credential);
  const configured = required ? Boolean(environment[credential]) : null;
  return {
    provider,
    model,
    credentials_required: required,
    credentials_configured: configured,
    setup_ready: !required || configured,
    availability: 'not_checked',
  };
}

function buildRuntimeHealth(environment = process.env, storageOk = true) {
  const imageRoute = environment.IMAGE_PROVIDER === 'google'
    ? 'google'
    : environment.IMAGE_PROVIDER === 'fal' ? 'fal' : 'hf_image';
  const videoRoute = environment.VIDEO_PROVIDER === 'hf_space'
    ? 'hf_space'
    : environment.VIDEO_PROVIDER === 'fal' ? 'fal' : 'replicate';

  const image = providerStatus(
    imageRoute,
    environment.IMAGE_MODEL || (imageRoute === 'google' ? 'gemini-3.1-flash-image' : imageRoute === 'fal' ? 'fal-ai/flux-pro/v1.1' : environment.HF_IMAGE_SPACE_NAME || 'Qwen/Qwen-Image-2.1'),
    imageRoute === 'google' ? 'GEMINI_API_KEY' : imageRoute === 'fal' ? 'FAL_KEY' : null,
    environment
  );
  const video = providerStatus(
    videoRoute,
    environment.VIDEO_MODEL || (videoRoute === 'hf_space' ? environment.HF_SPACE_NAME || 'zerogpu-aoti/wan2-2-fp8da-aoti-faster' : videoRoute === 'fal' ? 'fal (task-specific default)' : 'bytedance/seedance-1-pro-fast'),
    videoRoute === 'fal' ? 'FAL_KEY' : videoRoute === 'replicate' ? 'REPLICATE_API_TOKEN' : null,
    environment
  );
  const evaluator = providerStatus(
    'google',
    environment.VISION_MODEL || 'gemini-3.8-flash',
    'GEMINI_API_KEY',
    environment
  );
  const providers = { image, video, evaluator };

  return {
    ok: Boolean(storageOk),
    storage_ok: Boolean(storageOk),
    storage_path_configured: Boolean(environment.APP_DATA_DIR),
    auth_required: Boolean(environment.APP_ACCESS_TOKEN),
    provider: video.provider,
    vision_provider: evaluator.model,
    provider_setup_ready: Object.values(providers).every(item => item.setup_ready),
    providers,
  };
}

module.exports = { buildRuntimeHealth };
