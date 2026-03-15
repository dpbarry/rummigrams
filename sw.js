const CACHE_NAME = 'rummigrams-v1';

function isCacheableRequest(request) {
  const url = request.url || '';
  return (url.startsWith('http://') || url.startsWith('https://')) && request.method === 'GET';
}

self.addEventListener('fetch', (event) => {
  if (!isCacheableRequest(event.request)) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        try {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        } catch (_) {}
        return response;
      });
    })
  );
});
