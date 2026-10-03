const test = require('node:test');
const assert = require('node:assert/strict');
const { classifySubmissionError, pollingFailure, pollingTimeoutMessage, terminalSuccessRate } = require('../job-status');

test('distinguishes access, input, setup, and provider submission failures', () => {
  assert.equal(classifySubmissionError({ status: 401, message: 'unauthorized' }).label, 'Access required');
  assert.equal(classifySubmissionError({ status: 400, message: 'invalid_generation_request' }).label, 'Request needs correction');
  assert.equal(classifySubmissionError(new Error('Enter a shot direction before submitting generation.')).label, 'Request needs correction');
  assert.equal(classifySubmissionError(new Error('GEMINI_API_KEY is not configured')).label, 'Setup needed');
  assert.equal(classifySubmissionError(new Error('Provider returned 503')).label, 'Submission failed');
});

test('reports polling failures instead of claiming an unknown job is running', () => {
  assert.equal(pollingFailure({ status: 404, message: 'not_found' }, 1).label, 'Job not found');
  assert.equal(pollingFailure({ status: 401, message: 'unauthorized' }, 1).label, 'Access required');
  assert.equal(pollingFailure(new Error('network unavailable'), 2), null);
  assert.match(pollingFailure(new Error('network unavailable'), 3).message, /may still be running/);
  assert.match(pollingTimeoutMessage(), /No final status arrived/);
});

test('calculates success rate from terminal outcomes only', () => {
  assert.equal(terminalSuccessRate([{ status: 'queued' }, { status: 'running' }]), null);
  assert.equal(terminalSuccessRate([{ status: 'completed' }, { status: 'failed' }, { status: 'running' }]), 50);
});
