(function registerMediaOutput(global) {
  function outputUrl(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      for (const item of value) {
        const url = outputUrl(item);
        if (url) return url;
      }
      return null;
    }
    if (!value || typeof value !== 'object') return null;
    for (const key of ['output', 'url', 'video', 'data', 'images']) {
      const url = outputUrl(value[key]);
      if (url) return url;
    }
    return null;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = outputUrl;
  if (global) global.mindscapeOutputUrl = outputUrl;
})(typeof globalThis === 'undefined' ? this : globalThis);
