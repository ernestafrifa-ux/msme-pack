// Service worker: lets the app open and record without a connection.
// - On install, keeps the app shell and every screen's files (listed in asset-manifest.json),
//   so all screens open offline, not only the ones already visited.
// - Page loads: try the network, fall back to the cached app shell.
// - Built JS/CSS/icons: cache first (file names change on every build); old files are removed.
// - /api calls and /media (audio, which is fetched in ranges): never cached here. Records made
//   offline wait in the app's outbox and are sent when the connection is back.
const CACHE = 'msme-pack-v3';
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg'];

async function builtFiles() {
  try {
    const res = await fetch('/asset-manifest.json', { cache: 'no-store' });
    if (!res.ok) return [];
    const m = await res.json();
    const files = new Set();
    for (const entry of Object.values(m)) {
      if (entry.file) files.add('/' + entry.file);
      for (const c of entry.css || []) files.add('/' + c);
      for (const a of entry.assets || []) files.add('/' + a);
    }
    return [...files];
  } catch {
    return [];
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL);
    // Best effort: a file that fails to download is fetched later when first used.
    await Promise.all((await builtFiles()).map((f) => c.add(f).catch(() => {})));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    // Drop files from older builds.
    const keep = new Set([...SHELL, ...(await builtFiles())]);
    const c = await caches.open(CACHE);
    if (keep.size > SHELL.length) {
      for (const req of await c.keys()) {
        const path = new URL(req.url).pathname;
        if (path.startsWith('/assets/') && !keep.has(path)) await c.delete(req);
      }
    }
  })());
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) {
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(
      (hit) =>
        hit ||
        fetch(event.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy));
          }
          return res;
        })
    )
  );
});
