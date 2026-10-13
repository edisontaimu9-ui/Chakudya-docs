# PWA readiness review (not implemented)

Status: **review only.** No manifest, service worker or install UI exists yet, by design.
This file lists what the current architecture already gives you, what must change first,
and exactly what to add when you build the PWA.

## 1. What the architecture already gives you

| Area | Today | PWA impact |
|---|---|---|
| Hosting | 100% static files, no build step | Ideal. A service worker is just another static file. |
| Routing | Hash router (`#/docs/...`, `#/<slug>`) | One HTML document serves every route, so the SW only has to cache `index.html`. No server rewrite rules are needed. |
| Paths | All asset and `fetch()` paths are relative (`css/…`, `js/…`, `openapi.json`) | Works from a sub-path (e.g. GitHub Pages `/Chakudya-docs/`). Keep it that way; never introduce a leading `/`. |
| Data | `openapi.json` and `data/endpoint-metadata.json` fetched at start | Core content. Must be available offline. |
| State | `localStorage` only for theme, snippet language, collapsed groups. Auth token is memory-only. | Nothing to migrate. |
| Auth | Supabase login; redirect URL is `location.origin + location.pathname`, session arrives in the URL hash | **The SW must not intercept or rewrite navigations that carry `#access_token=…`** (the hash never reaches the SW, but do not call `clients.navigate()` or cache-bust the URL). `start_url` must not differ from the Supabase redirect allow-list. |

## 2. Fix before building (blockers and near-blockers)

1. **Google Fonts are third-party.** Offline, the site falls back to system fonts. Self-host
   Fraunces (600/700 + 600 italic), Inter (400/500/600/700) and JetBrains Mono (400/500/600)
   as `.woff2` in `assets/fonts/`, add `@font-face` with `font-display: swap`, and remove the
   Google `<link>`s. This also removes two cross-origin connections from every first visit.
2. **No icon set.** Only `assets/favicon.svg` exists. See section 5.
3. **No cache-busting.** CSS/JS URLs are unversioned (`js/main.js`). With a cache-first SW,
   users would keep old code. Either add a build/CI step that stamps `?v=<hash>` or, simpler,
   version the SW cache name and let the SW own freshness (section 4).
4. **18 separate script files and 5 stylesheets.** Works, but the precache list is long and
   must be kept in sync by hand. Preferred: a tiny script (`node tools/precache.mjs`) that
   writes `precache-manifest.json` by listing the folder at deploy time. Bundling is optional.
5. **Live-data features must degrade gracefully offline.** Landing stats, the food lookup,
   "Run live", Try It and the status panel all call the API. They already handle failures
   (tiles are omitted, an error message is shown) but should say "You're offline" explicitly
   when `navigator.onLine === false`.

## 3. Files to add

| File | Purpose |
|---|---|
| `manifest.webmanifest` | App metadata (below) |
| `sw.js` (site root, same folder as `index.html`) | Service worker; must be at the root to control the whole scope |
| `offline.html` | Fallback for navigations when neither cache nor network can answer (rarely hit, since the shell is precached) |
| `assets/icons/…` | Icons (section 5) |
| `assets/fonts/*.woff2` | Self-hosted fonts |
| `tools/precache.mjs` (optional) | Generates the file list the SW precaches |
| Edits to `index.html` | `<link rel="manifest">`, `apple-touch-icon`, Apple meta tags, `theme-color` (already present) |
| Edit to `js/main.js` | SW registration, update prompt toast, optional install button |

### Manifest (recommended contents)

```json
{
  "name": "Chakudya Nutrition Registry",
  "short_name": "Chakudya",
  "description": "Malawi's open nutrition registry: food data, growth assessment and developer docs.",
  "id": "./",
  "start_url": "./#/",
  "scope": "./",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#0e1210",
  "theme_color": "#0e1210",
  "categories": ["health", "food", "developer"],
  "icons": [
    { "src": "assets/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "assets/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "assets/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "shortcuts": [
    { "name": "Docs", "url": "./#/docs/getting-started" },
    { "name": "API reference", "url": "./#/docs/api-reference" },
    { "name": "API keys", "url": "./#/account" }
  ]
}
```

`theme_color` is dark because the site defaults to dark; `js/theme.js` already updates the
`<meta name="theme-color">` tag when the user switches theme.

## 4. Offline strategy

| Resource | Strategy | Notes |
|---|---|---|
| App shell: `index.html`, `css/*`, `js/*`, `assets/**` (incl. icons, fonts, images) | **Precache on install**, cache-first, versioned cache name `chakudya-shell-vN` | Bump `N` (or hash the manifest) each deploy. Delete old caches in `activate`. |
| `openapi.json`, `openapi.yaml`, `data/endpoint-metadata.json` | **Stale-while-revalidate** | Docs open offline instantly and refresh in the background. |
| Navigations (`mode: "navigate"`) | Serve cached `index.html` (hash routing means one document) | Fall back to `offline.html` only if the shell is missing. |
| Chakudya API (`*.workers.dev`) | **Network-only. Never cache.** | Stats, health, lookups, Try It and key management must be live and honest. Optionally add network-first with a 60 s fallback for `GET /foods/lookup` later. |
| Supabase (`*.supabase.co`) and any request with `Authorization` | **Network-only. Never cache.** | Auth tokens and key lists are sensitive. |
| Anything cross-origin not listed | Pass through | |

Update flow: new SW installs, waits; the page shows a toast "Update available, reload" and
posts `SKIP_WAITING`. Avoid silent `skipWaiting()` mid-session, which can mix old HTML with new JS.

Quota: the whole site is about 2 MB (mostly `openapi.*` and images), well inside any browser limit.

## 5. Icons and install requirements

Browser installability (Chrome/Edge/Android) needs: **HTTPS**, a linked manifest with `name` or
`short_name`, `start_url`, `display` standalone, **192 and 512 PNG icons**, and a registered
service worker with a fetch handler. Safari/iOS does not read manifest icons for the home
screen; it needs `apple-touch-icon`.

Assets to supply (all from the logo mark, not the wordmark):

| File | Format | Size | Notes |
|---|---|---|---|
| `assets/icons/icon-192.png` | PNG | 192×192 | Mark centred, transparent or solid |
| `assets/icons/icon-512.png` | PNG | 512×512 | Same |
| `assets/icons/icon-maskable-512.png` | PNG | 512×512 | **Opaque** background, mark inside the central 80% (Android crops to a circle or squircle) |
| `assets/icons/apple-touch-icon.png` | PNG | 180×180 | **Opaque**, no transparency (iOS fills it black) |
| `assets/icons/favicon-32.png` and `favicon.ico` | PNG / ICO | 32×32 | Legacy browsers |
| `assets/icons/mask-icon.svg` (optional) | SVG | any | Single colour |
| `assets/screenshots/desktop-1280x720.png`, `mobile-390x844.png` (optional) | PNG | as named | Enables the richer install dialog |

`index.html` additions when you build it:

```html
<link rel="manifest" href="manifest.webmanifest" />
<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="Chakudya" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
```

## 6. Hosting and deployment requirements

- Serve over **HTTPS** (all the hosts in the README do).
- Serve `sw.js` with `Cache-Control: no-cache` so updates are picked up; `manifest.webmanifest`
  as `application/manifest+json`.
- The SW **scope** is its folder. Keep `sw.js` next to `index.html`.
- Add the final site URL to the **Supabase Redirect URLs** list (already required for login).
  If the PWA ever runs from a different origin or path than the web version, add that too.
- Test with Lighthouse "Installable" and "PWA optimized" checks, Chrome DevTools >
  Application > Service Workers (tick "Offline"), and on a real Android device.

## 7. Risks to watch

- **Stale code after deploy** if cache names are not bumped. Automate the bump.
- **Caching authenticated or live responses by accident.** Keep the allow-list (shell + spec
  files) rather than a catch-all cache rule.
- **Install prompt fatigue.** Do not show an install banner on first visit; offer an "Install"
  button in the footer after the user has opened docs pages.
- **Hash links inside an installed app** work normally, but external links (GitHub) open in the
  system browser; this is expected.
