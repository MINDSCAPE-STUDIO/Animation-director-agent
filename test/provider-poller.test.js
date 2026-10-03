'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startProviderPolling } = require('../provider-poller');

test('background poller refreshes active provider jobs without dashboard requests', async () => {
  let callback;
  let interval;
  let unreferenced = false;
  let cleared = false;
  let refreshes = 0;
  const stop = startProviderPolling({ refreshActive: async () => { refreshes += 1; } }, {
    intervalMs: 1234,
    setIntervalImpl: (fn, ms) => {
      callback = fn;
      interval = ms;
      return { unref() { unreferenced = true; } };
    },
    clearIntervalImpl: timer => { assert.ok(timer); cleared = true; },
  });
  assert.equal(interval, 1234);
  assert.equal(unreferenced, true);
  await callback();
  assert.equal(refreshes, 1);
  stop();
  assert.equal(cleared, true);
});

test('background poller reports errors and stop cancels its timer', async () => {
  let callback;
  const expected = new Error('poll failed');
  let reported;
  const stop = startProviderPolling({ refreshActive: async () => { throw expected; } }, {
    setIntervalImpl: fn => { callback = fn; return 42; },
    clearIntervalImpl: timer => assert.equal(timer, 42),
    onError: error => { reported = error; },
  });
  // The timer is cleared using the module's global clearInterval.
  await callback();
  assert.equal(reported, expected);
  stop();
});
