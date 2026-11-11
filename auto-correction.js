const CORRECTION_RULES = {
  face_drift: 'Preserve the exact face identity from the master reference.',
  hair_drift: 'Preserve canonical hairstyle, length, color, strand placement, and silhouette.',
  body_proportion: 'Match canonical body proportions, silhouette, apparent age, and anatomy.',
  clothing_change: 'Preserve exact canonical clothing design, colors, marks, fit, and layering.',
  identity_loss: 'Treat the approved Master Asset as the identity source of truth.',
  anatomy_deformation: 'Correct anatomy while preserving approved proportions and pose intent.',
  line_style: 'Match the Style Bible line treatment.',
  shading: 'Match established cel-shading/highlight/shadow treatment.',
  palette: 'Use the canonical palette without shifting established colors.',
  texture: 'Preserve established surface and texture treatment.',
  rendering_style: 'Preserve the established rendering language.',
  style_drift: 'Return to the canonical Style Bible visual language.',
  foot_sliding: 'Preserve foot contacts and believable weight transfer; do not slide planted feet.',
  limb_deformation: 'Preserve limb continuity and natural joint movement.',
  unnatural_motion: 'Use natural body mechanics while preserving the requested action.',
  motion_discontinuity: 'Continue the previous motion state smoothly; do not restart or reset.',
  temporal_flicker: 'Keep character, clothing, geometry, lighting, and background stable between frames.',
  pose_drift: 'Preserve the requested pose/action trajectory.',
  unwanted_zoom: 'Keep requested camera scale; remove unrequested zoom.',
  unwanted_rotation: 'Keep camera orientation stable unless explicitly requested.',
  framing_change: 'Preserve requested framing and subject placement.',
  perspective_change: 'Preserve established perspective and camera geometry.',
  camera_jitter: 'Stabilize camera movement while retaining requested motion.',
  background_drift: 'Preserve canonical environment and established background elements.',
  object_change: 'Preserve established props and scene objects.',
  lighting_change: 'Preserve established lighting direction, intensity, color temperature, highlights, and shadows.',
  geometry_change: 'Preserve established environment geometry.',
  environment_style_drift: 'Match canonical environment style.',
  instruction_missed: 'Explicitly satisfy the missed instruction while preserving approved contracts.',
  constraint_ignored: 'Treat the failed constraint as non-negotiable.',
  composition_mismatch: 'Match requested composition and subject placement.',
  reference_mismatch: 'Use the supplied reference as the source of truth for the affected attribute.'
};

function buildCorrectionPlan({ job, evaluation, maxAttempts = 3 }) {
  const errors = (evaluation?.errors || evaluation?.findings || [])
    .filter(e => e && !['generation_failure', 'invalid_output', 'missing_output', 'timeout', 'provider_error'].includes(e.code));
  const attempt = Number(job?.attempt || 1);
  const corrections = errors.map(e => ({
    code: e.code,
    category: e.category,
    severity: e.severity,
    instruction: CORRECTION_RULES[e.code] || `Correct ${e.code} while preserving the canonical Style Bible and Master Asset.`
  }));
  return {
    enabled: corrections.length > 0 && attempt < maxAttempts,
    attempt,
    next_attempt: attempt + 1,
    max_attempts: maxAttempts,
    error_codes: [...new Set(corrections.map(e => e.code))],
    corrections,
    correction_prompt: corrections.map(c => `CORRECTION ${c.code}: ${c.instruction}`).join('\n')
  };
}

function applyCorrection(job, plan) {
  if (!plan.enabled) return null;
  const prompt = `${job.prompt || ''}\n\nMINDSCAPE AUTOMATIC CORRECTION\nCorrection attempt ${plan.next_attempt} of ${plan.max_attempts}. Preserve the same shot, references, Style Bible and Master Asset. Fix ONLY the detected defects.\n${plan.correction_prompt}\nPreserve all previously passing dimensions.`;
  return {
    ...job,
    prompt,
    attempt: plan.next_attempt,
    status: 'queued',
    error: null,
    result: null,
    correction_of: job.id,
    correction_codes: plan.error_codes,
    correction_plan: plan
  };
}

module.exports = { buildCorrectionPlan, applyCorrection, CORRECTION_RULES };
