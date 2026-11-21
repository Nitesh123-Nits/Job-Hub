const CACHE = "jobhub-v10";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./premium.css", "./theme-modern.css", "./premium.js", "./icons/icon-192.png", "./icons/icon-512.png"];

// Install: fetch every file fresh (bypass the HTTP cache) so a new version never caches stale copies.
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((a) =>
        fetch(a, { cache: "reload" }).then((r) => { if (!r.ok) throw new Error(a); return c.put(a, r); }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for same-origin GETs so updates show up right away; the cache is the offline fallback.
// External job sites are never intercepted.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: "no-cache" })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
  );
});
