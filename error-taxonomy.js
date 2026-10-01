const ERROR_TAXONOMY={
  character:['face_drift','hair_drift','body_proportion','clothing_change','identity_loss','anatomy_deformation'],
  style:['line_style','shading','palette','texture','rendering_style','style_drift'],
  motion:['foot_sliding','limb_deformation','unnatural_motion','motion_discontinuity','temporal_flicker','pose_drift'],
  camera:['unwanted_zoom','unwanted_rotation','framing_change','perspective_change','camera_jitter'],
  environment:['background_drift','object_change','lighting_change','geometry_change','environment_style_drift'],
  prompt:['instruction_missed','constraint_ignored','composition_mismatch','reference_mismatch'],
  technical:['generation_failure','invalid_output','missing_output','timeout','provider_error']
};

const ERROR_SEVERITIES=['low','medium','high','critical'];

function isValidErrorCode(category,code){return Array.isArray(ERROR_TAXONOMY[category])&&ERROR_TAXONOMY[category].includes(code)}
function listErrorCodes(){return Object.entries(ERROR_TAXONOMY).flatMap(([category,codes])=>codes.map(code=>({category,code})))}

module.exports={ERROR_TAXONOMY,ERROR_SEVERITIES,isValidErrorCode,listErrorCodes};
