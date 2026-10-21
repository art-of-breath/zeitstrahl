// Offline shell. Network first, so a new version shows up on the next visit; the cache
// only answers when there is no connection. Bump VERSION when the file list changes.

const VERSION = 'zeitstrahl-v6';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/brand.css',
  'css/app.css',
  'js/app.js',
  'js/dates.js',
  'js/lanes.js',
  'js/scale.js',
  'js/sheet.js',
  'js/storage.js',
  'js/swipe.js',
  'js/typed-date.js',
  'js/timeline.js',
  'img/gold-small.png',
  'img/kintsugi-06.svg',
  'icons/favicon-32.png',
  'icons/icon-192.png',
  'fonts/playfair-display-v40-latin-regular.woff2',
  'fonts/playfair-display-v40-latin-italic.woff2',
  'fonts/raleway-v37-latin-regular.woff2',
  'fonts/raleway-v37-latin-500.woff2',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    // no-cache: always ask the server (a cheap 304 when unchanged), never a stale copy.
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
