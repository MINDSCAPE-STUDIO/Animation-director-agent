'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { callHfImage } = require('../model-router');

test('continues from the HF preparation placeholder to the real image generation endpoint', async () => {
  const endpoints = [];
  const app = {
    async view_api() {
      return { named_endpoints: { '/prepare_request': {}, '/generate_request': {} } };
    },
    async predict(endpoint) {
      endpoints.push(endpoint);
      if (endpoint === '/prepare_request') {
        return { data: [{ url: 'https://cdn.example.test/generating-placeholder.png' }, 12, '', { image_paths: [], final_prompt: 'final prompt' }] };
      }
      return { data: [{ url: 'https://cdn.example.test/final-generated-image.png' }] };
    },
  };
  const generated = await callHfImage(app, { id: 'synthetic-job', model: 'Qwen/Qwen-Image-2.1', prompt: 'test prompt', input: {} });
  assert.deepEqual(endpoints, ['/prepare_request', '/generate_request']);
  assert.equal(generated.url, 'https://cdn.example.test/final-generated-image.png');
  assert.equal(generated.direct, undefined);
});

test('does not treat a preparation placeholder as a completed image when request state is missing', async () => {
  const app = {
    async view_api() { return { named_endpoints: { '/prepare_request': {}, '/generate_request': {} } }; },
    async predict() { return { data: [{ url: 'https://cdn.example.test/generating-placeholder.png' }, 12, ''] }; },
  };
  await assert.rejects(callHfImage(app, { id: 'broken-job', model: 'Qwen/Qwen-Image-2.1', prompt: 'test prompt', input: {} }), /no generation request state/);
});
