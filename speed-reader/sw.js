// Offline support for Nook. Keeps the app's own files on the device so it
// opens without internet. The page itself is fetched fresh whenever there's a
// connection (so updates arrive), and its files are read from the cache and
// refreshed in the background. Books and reading data already live on the
// device, in IndexedDB and localStorage.
const CACHE = 'nook-app-v1';
const EXTRAS = [
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/favicon.svg',
  'icons/favicon-32.png',
  'icons/apple-touch-icon.png',
];

const scope = () => self.registration.scope;

// Cache the page and every local file it links to (styles, scripts, icons),
// then drop files from older versions that the page no longer uses.
async function cacheApp(html) {
  const cache = await caches.open(CACHE);
  let page = html;
  if (page == null) {
    const res = await fetch(scope(), { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Couldn't fetch the app (${res.status})`);
    page = await res.text();
  }
  await cache.put(scope(), new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));

  const files = new Set(EXTRAS);
  for (const m of page.matchAll(/(?:href|src)="([^"#:]+)"/g)) files.add(m[1]);
  const wanted = new Set([scope(), ...[...files].map((f) => new URL(f, scope()).href)]);
  await Promise.all([...wanted].map(async (url) => {
    if (url === scope() || await cache.match(url)) return;
    const res = await fetch(url);
    if (res.ok) await cache.put(url, res);
  }));
  for (const req of await cache.keys()) if (!wanted.has(req.url)) await cache.delete(req);
}

self.addEventListener('install', (e) => {
  e.waitUntil(cacheApp().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(scope())) return;

  // The page: fresh when online, the saved copy when not.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) {
          const copy = res.clone();
          e.waitUntil(copy.text().then((html) => cacheApp(html)).catch(() => {}));
        }
        return res;
      } catch {
        return (await caches.match(scope())) || Response.error();
      }
    })());
    return;
  }

  // App files: straight from the cache, refreshed in the background.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    const refresh = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    });
    if (hit) {
      e.waitUntil(refresh.catch(() => {}));
      return hit;
    }
    return refresh;
  })());
});
