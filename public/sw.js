const CACHE_NAME = 'mia-cache-v3';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/assets/mia-logo.png',
  '/assets/mia-banner.png',
  'https://fonts.googleapis.com/css2?family=Anton&family=Kaushan+Script&family=Outfit:wght@300;400;500;600;700&display=swap'
];

self.addEventListener('install', event => {
  // No esperar a que se cierren las pestañas viejas: pasar a activar apenas se instala.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      ))
      // Tomar el control de las pestañas ya abiertas, no solo de las nuevas.
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.pathname.startsWith('/api/')) return; // llamadas a la API: siempre red

  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    // Network-first: si hay conexión, siempre la versión más nueva del sitio.
    // El caché queda solo como respaldo para cuando no hay señal.
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
  } else {
    // Recursos externos (fuentes): casi no cambian, cache-first está bien.
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return res;
      }))
    );
  }
});
