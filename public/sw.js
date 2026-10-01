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
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // API y todo lo que no sea GET va directo a la red.
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) return;

  // Páginas, scripts y estilos: red primero, así los cambios se ven al primer
  // reload. Si no hay conexión, se usa la copia guardada.
  const isCode = req.mode === 'navigate' || /\.(html|js|css|json)$/.test(url.pathname) || url.pathname === '/';
  if (isCode && url.origin === self.location.origin) {
    event.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Imágenes y fuentes: copia guardada primero (cambian poco) y se actualizan en segundo plano.
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});
