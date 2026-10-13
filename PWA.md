# Chakudya docs as a PWA

The site is installable and the docs work offline.

## Files
| File | Role |
|---|---|
| `manifest.json` | App name, icons, colours, start URL, shortcuts |
| `sw.js` | Service worker (precache, update flow, offline fallback) |
| `js/pwa.js` | Registers the worker, update toast, Install button, online/offline toasts |
| `offline.html` | Shown only if a page is requested offline and nothing is saved yet |
| `assets/icons/` | 192, 512, maskable 512, Apple touch 180, favicons |
| `tools/stamp-sw.mjs` | Stamps `BUILD` in `sw.js` and checks the file lists |
| `_headers` | Cache headers for Cloudflare Pages / Netlify (GitHub Pages ignores it) |

## Caching rules
| Request | Behaviour |
|---|---|
| App shell (HTML, CSS, JS, icons, key images) | Precached, served from cache, replaced on a new `BUILD` |
| `openapi.json`, `openapi.yaml`, `data/endpoint-metadata.json` | Network first (4 s), saved copy when offline |
| Navigations | Cached `index.html` (hash routing means one page) |
| Google Fonts | Stale-while-revalidate |
| Chakudya API, Supabase, any request with `Authorization`, any non-GET | **Never handled or cached.** Live stats, lookups, Try It and key management always hit the network |

Offline, live widgets say so ("You're offline") instead of showing stale numbers.

## Every deploy
```
node tools/stamp-sw.mjs        # rewrites BUILD from a hash of the shell files
node tools/stamp-sw.mjs --check   # CI: fails if BUILD is stale or a listed file is missing
```
Skipping this means returning users keep the old shell. When you add a JS/CSS file, add it to `CORE` in `sw.js`; the stamp script fails if `index.html` uses a file that isn't precached.

## Updates
A new `BUILD` installs in the background. Open tabs show "Chakudya Nutrition Registry has been updated" with **Refresh site** and **Later**. The page only reloads when the user clicks it, so old HTML never mixes with new JS.

## Install
- Android / desktop Chrome and Edge: use the **Install** button in the header, or the browser menu.
- iOS Safari: Share, then Add to Home Screen.

## Requirements
- HTTPS (or `localhost`). Service workers do not run on plain HTTP or `file://`.
- Keep `sw.js` next to `index.html` and serve it with `Cache-Control: no-cache`.
- Keep all paths relative (the site works under `/Chakudya-docs/` on GitHub Pages).
- Supabase Redirect URLs must include the site URL (already needed for login).

## Not done
Fonts are still loaded from Google (cached after first use). Self-hosting them would make first-ever offline visits identical.
