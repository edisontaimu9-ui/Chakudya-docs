/* Chakudya Nutrition Registry docs - service worker.
 *
 * What it does
 *   - Precaches the app shell (HTML, CSS, JS, icons, key images) so the docs open offline.
 *   - Keeps the OpenAPI spec and endpoint metadata fresh: network first, saved copy when offline.
 *   - Serves an offline page if neither the cache nor the network can answer a navigation.
 *
 * What it deliberately does NOT do
 *   - It never touches cross-origin requests other than Google Fonts: the Chakudya API
 *     (*.workers.dev), Supabase login and everything else go straight to the network, so
 *     live statistics, health checks, Try It and key management are never served from a cache.
 *   - It never handles non-GET requests or anything carrying credentials.
 *
 * Updates
 *   BUILD is a hash of the precached files, written by `node tools/stamp-sw.mjs`.
 *   Run it before every deploy. A new BUILD installs a new cache in the background; the page
 *   then offers a "Reload" button (see js/pwa.js) so HTML and JS are never mixed across versions.
 */
const BUILD = "49a98b4b78e0";

const SHELL_CACHE = "chakudya-shell-" + BUILD;
const DATA_CACHE = "chakudya-data-v1";
const FONT_CACHE = "chakudya-fonts-v1";

// Must all be fetched for the worker to install.
const CORE = [
  "./",
  "index.html",
  "offline.html",
  "manifest.json",
  "css/theme.css",
  "css/layout.css",
  "css/components.css",
  "css/landing.css",
  "css/nutrimind.css",
  "css/docs.css",
  "js/config.js",
  "js/state.js",
  "js/seo.js",
  "js/theme.js",
  "js/spec-loader.js",
  "js/schema-example.js",
  "js/copy.js",
  "js/api-client.js",
  "js/status-panel.js",
  "js/render-endpoint.js",
  "js/demo-terminal.js",
  "js/render-landing.js",
  "js/render-docs.js",
  "js/render-legal.js",
  "js/render-nutrimind.js",
  "js/auth.js",
  "js/render-account.js",
  "js/try-it.js",
  "js/sidebar.js",
  "js/search.js",
  "js/main.js",
  "js/pwa.js",
];

// Nice to have offline; a failure here must not block installation.
const OPTIONAL = [
  "assets/favicon.svg",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/icon-maskable-512.png",
  "assets/icons/apple-touch-icon.png",
  "assets/icons/favicon-32.png",
  "assets/images/hero-malawian-meal.webp",
  "assets/images/hero-malawian-meal-600.webp",
  "assets/images/food-fish.webp",
  "assets/images/food-fruit-veg.webp",
  "assets/images/food-legumes-protein.webp",
  "assets/images/food-staples.webp",
  "assets/images/chakudya-logo-192.webp",
  "assets/images/nutrimind-mark-96.png",
  "assets/images/nutrimind-mark-192.png",
  "assets/images/nutrimind-logo-420.webp",
];

// Content that changes between releases: network first, saved copy as fallback.
const DATA = ["openapi.json", "openapi.yaml", "data/endpoint-metadata.json"];

const scopeUrl = new URL("./", self.location).href;
const abs = (p) => new URL(p, scopeUrl).href;
const INDEX = abs("index.html");
const OFFLINE = abs("offline.html");
const DATA_URLS = new Set(DATA.map(abs));

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // cache: "reload" bypasses the HTTP cache so a new build never precaches stale files.
    await Promise.all(CORE.map(async (p) => {
      const res = await fetch(new Request(abs(p), { cache: "reload" }));
      if (!res.ok) throw new Error("Precache failed: " + p + " (" + res.status + ")");
      await cache.put(abs(p), res);
    }));
    await Promise.all(OPTIONAL.map(async (p) => {
      try {
        const res = await fetch(new Request(abs(p), { cache: "reload" }));
        if (res.ok) await cache.put(abs(p), res);
      } catch (_) { /* optional */ }
    }));
    // Seed the data cache so the docs work offline after the very first visit.
    const data = await caches.open(DATA_CACHE);
    await Promise.all(DATA.map(async (p) => {
      try {
        const res = await fetch(new Request(abs(p), { cache: "reload" }));
        if (res.ok) await data.put(abs(p), res);
      } catch (_) { /* optional */ }
    }));
    // No skipWaiting(): the page decides when to switch (js/pwa.js sends SKIP_WAITING).
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("chakudya-shell-") && key !== SHELL_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function handleNavigation() {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(INDEX);
  if (cached) return cached;
  try {
    return await fetch(INDEX);
  } catch (_) {
    const off = await cache.match(OFFLINE);
    return off || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

async function networkFirst(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const res = await withTimeout(fetch(request, { cache: "no-cache" }), 4000);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const saved = await cache.match(request, { ignoreSearch: true });
    if (saved) return saved;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(request);
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(request);
  const refresh = fetch(request).then((res) => {
    if (res.ok || res.type === "opaque") cache.put(request, res.clone());
    return res;
  });
  if (hit) { refresh.catch(() => {}); return hit; }
  return refresh;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.headers.has("Authorization")) return;

  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (!url.href.startsWith(scopeUrl)) return;
    if (url.pathname.endsWith("/sw.js")) return;
    if (req.mode === "navigate") {
      // Only the app itself gets the cached shell. Opening sitemap.xml, robots.txt, a
      // verification file or the spec directly in a tab must reach the real file.
      const appPaths = [new URL(scopeUrl).pathname, new URL(INDEX).pathname];
      if (appPaths.includes(url.pathname)) event.respondWith(handleNavigation());
      return;
    }
    if (DATA_URLS.has(url.origin + url.pathname)) { event.respondWith(networkFirst(req)); return; }
    event.respondWith(cacheFirst(req));
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(req));
  }
  // Everything else (the API, Supabase, ...) is not handled: it always goes to the network.
});
