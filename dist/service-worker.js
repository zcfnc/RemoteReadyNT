const CACHE = 'remoteready-core-v4';
const CORE = [
  './', './index.html', './styles.css', './app.js', './priority-scoring.js', './manifest.webmanifest',
  './vendor/leaflet/leaflet.css', './vendor/leaflet/leaflet.js',
  './data/connectivity.geojson', './data/facilities.geojson', './data/download_log.json', './data/outage-scenario.json'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('remoteready-core-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then(response => response || caches.match('./index.html')))
  );
});
