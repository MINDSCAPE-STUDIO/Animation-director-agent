'use strict';

function startProviderPolling(queue, { intervalMs = 15_000, onError = () => {}, setIntervalImpl = setInterval, clearIntervalImpl = clearInterval } = {}) {
  if (!queue || typeof queue.refreshActive !== 'function') throw new TypeError('A generation queue with refreshActive() is required.');
  let running = false;
  const timer = setIntervalImpl(async () => {
    if (running) return;
    running = true;
    try {
      await queue.refreshActive();
    } catch (error) {
      onError(error);
    } finally {
      running = false;
    }
  }, intervalMs);
  timer?.unref?.();
  return () => clearIntervalImpl(timer);
}

module.exports = { startProviderPolling };
