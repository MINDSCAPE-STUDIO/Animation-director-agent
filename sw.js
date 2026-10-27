const CACHE = 'mindscape-agent-v7';
const ASSETS = ['/', '/index.html', '/styles.css', '/app.js', '/agents.js', '/dashboard.js', '/manifest.json'];
const DYNAMIC_PREFIXES = [
  '/health',
  '/ready',
  '/jobs',
  '/generation-history',
  '/error-taxonomy',
  '/evaluations',
  '/visual-evaluate',
  '/style-bible',
  '/master-assets'
];

function shouldHandleWithCache(requestUrl, request) {
  if (requestUrl.origin !== self.location.origin) return false;
  if (request.headers.has('Authorization') || request.headers.has('x-api-key')) return false;
  if (requestUrl.pathname.startsWith('/generated/')) return false;
  if (DYNAMIC_PREFIXES.some(prefix =>
    requestUrl.pathname === prefix ||
    requestUrl.pathname.startsWith(prefix + '/') ||
    requestUrl.pathname.startsWith(prefix + '.')
  )) return false;
  return true;
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (!shouldHandleWithCache(requestUrl, event.request)) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          void caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(error => {
        if (cached) return cached;
        throw error;
      });
    })
  );
});
