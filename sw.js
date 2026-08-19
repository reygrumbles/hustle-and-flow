const CACHE = 'hf-shell-v1';
const ASSETS = ['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icons/icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).catch(() => caches.match('./index.html'))));
});
