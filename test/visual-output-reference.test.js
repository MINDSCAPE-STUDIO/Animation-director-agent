'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { outputReference } = require('../gemini-visual-provider');
const { GENERATED_OUTPUT_DIR } = require('../storage-paths');

test('visual evaluator resolves generated URLs from configured generated storage', () => {
  assert.equal(outputReference({ result: { output: '/generated/frame.png' } }), path.join(GENERATED_OUTPUT_DIR, 'frame.png'));
  assert.throws(() => outputReference({ result: { output: '/generated/../secret' } }), /invalid local path/);
});

test('visual evaluator preserves remote media references', () => {
  assert.equal(outputReference({ result: { url: 'https://example.test/clip.mp4' } }), 'https://example.test/clip.mp4');
});
