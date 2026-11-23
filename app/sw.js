// Lets the app open without internet. Always tries the network first so
// updates show up straight away, and falls back to the saved copy offline.

const CACHE = 'cat-reminders-v5';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/art.js',
  './js/calendar.js',
  './js/calendar-plan.js',
  './js/cloud.js',
  './js/dates.js',
  './js/firebase-config.js',
  './js/schedule.js',
  './js/store.js',
  './vendor/firebase.js',
  './fonts/nunito.woff2',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Ask the server whether each file changed (cheap when it hasn't) instead of
  // trusting the browser's own cache, which GitHub Pages lets keep files for
  // 10 minutes. That way a new version shows up the next time the app opens.
  const fresh = fetch(request.url, {
    cache: 'no-cache',
    credentials: 'same-origin',
    redirect: request.mode === 'navigate' ? 'manual' : 'follow',
  });

  event.respondWith(
    fresh
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === 'navigate') return (await caches.match('./index.html')) ?? Response.error();
        return Response.error();
      }),
  );
});
