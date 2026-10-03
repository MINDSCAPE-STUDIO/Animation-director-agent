const test = require('node:test');
const assert = require('node:assert/strict');

const originalHfImageSpace = process.env.HF_IMAGE_SPACE_NAME;
const originalHfVideoSpace = process.env.HF_SPACE_NAME;
process.env.HF_IMAGE_SPACE_NAME = 'org/image-space';
process.env.HF_SPACE_NAME = 'org/video-space';
const { selectModel } = require('../model-router');
if (originalHfImageSpace === undefined) delete process.env.HF_IMAGE_SPACE_NAME;
else process.env.HF_IMAGE_SPACE_NAME = originalHfImageSpace;
if (originalHfVideoSpace === undefined) delete process.env.HF_SPACE_NAME;
else process.env.HF_SPACE_NAME = originalHfVideoSpace;

function withEnvironment(values, run) {
  const previous = Object.fromEntries(
    Object.keys(values).map(key => [key, process.env[key]])
  );

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('selects the configured Google image model', () => {
  withEnvironment({ IMAGE_PROVIDER: 'google', IMAGE_MODEL: 'gemini-image-test' }, () => {
    assert.deepEqual(selectModel({ type: 'text_to_image' }), {
      provider: 'google',
      model: 'gemini-image-test'
    });
  });
});

test('selects the configured Hugging Face image Space', () => {
  withEnvironment({ IMAGE_PROVIDER: 'hf_space' }, () => {
    assert.deepEqual(selectModel({ type: 'text_to_image' }), {
      provider: 'hf_image',
      model: 'org/image-space'
    });
  });
});

test('selects the configured Hugging Face video Space', () => {
  withEnvironment({ VIDEO_PROVIDER: 'hf_space' }, () => {
    assert.deepEqual(selectModel({ type: 'image_to_video' }), {
      provider: 'hf_space',
      model: 'org/video-space'
    });
  });
});

test('selects the configured Fal video model', () => {
  withEnvironment({ VIDEO_PROVIDER: 'fal', VIDEO_MODEL: 'fal/video-model' }, () => {
    assert.deepEqual(selectModel({ type: 'text_to_video' }), {
      provider: 'fal',
      model: 'fal/video-model'
    });
  });
});

test('defaults video jobs to Replicate when no video provider is selected', () => {
  withEnvironment({ VIDEO_PROVIDER: undefined, VIDEO_MODEL: undefined }, () => {
    assert.deepEqual(selectModel({ type: 'text_to_video' }), {
      provider: 'replicate',
      model: 'bytedance/seedance-1-pro-fast'
    });
  });
});

