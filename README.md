# Chakudya Nutrition Registry - API Docs

Interactive, Swagger-UI-style developer portal for the **Chakudya Nutrition
Registry (CNR)** API - a Malawi-focused food and nutrition data API running
on Cloudflare Workers.

This is a **static site** (plain HTML/CSS/JS, no build step, no framework)
that reads `openapi.json` at runtime and renders the whole portal from it -
sidebar, endpoint docs, request/response examples, and a live "Try it"
console. It does not modify or touch the Chakudya API project in any way;
it's a separate, deployable-on-its-own frontend.

Everything documented here was verified against the actual repository
(`src/index.js`'s router and `routePolicy()`, `wrangler.toml`, and the
existing `openapi.yaml`) before this site was built - nothing here was
invented.

---

## 1. Run it locally

No dependencies, no build step. Any static file server works, because the
page loads `openapi.json` via `fetch()`, which most browsers block for
`file://` pages.

```bash
cd chakudya-docs
python3 -m http.server 8080
# or: npx serve .
# or: npx http-server -p 8080
```

Then open `http://localhost:8080`.

---

## 2. Deploy it

Because it's a static folder, any of these work with zero configuration:

**Cloudflare Pages**
```bash
npx wrangler pages deploy chakudya-docs --project-name=chakudya-docs
```
or connect the repo in the dashboard with build output directory = `chakudya-docs` (or the repo root, if you place these files there) and no build command.

**GitHub Pages**
Commit this folder to a repo (e.g. as `/docs` on your default branch, or its own `gh-pages` branch) and enable Pages for that path in repo Settings → Pages. No build step needed.

**Netlify**
```bash
npx netlify deploy --dir=chakudya-docs --prod
```
or drag-and-drop the folder into the Netlify dashboard. Build command: none. Publish directory: `.`.

**Vercel**
```bash
npx vercel --prod chakudya-docs
```
Framework preset: "Other" / static.

No environment variables are required for any of these - the site is 100%
client-side and the API base URL is configured in the browser (see below).

---

## 3. Configuring the API base URL

The header has a **Base URL** field, pre-filled from the OpenAPI spec's
`servers[0].url` (a placeholder - the real deployment URL isn't published
in this repo; set your own in the field or via **Production** once you
point the spec at it). You can:

- Pick **Production** from the dropdown (whatever URL you've configured), or
- Pick **Local (wrangler dev)**, which assumes the Worker's default dev port
  (`http://localhost:8787` - Wrangler's standard default; change it if your
  `wrangler dev` uses a different port), or
- Type any custom URL - useful for a staging Worker or a fork.

The value is saved to `localStorage` (`chakudya-docs:base-url`) so it
persists across visits. Every "Try it" request is built against whatever's
currently in that field - nothing is hardcoded into the JS beyond the
spec-derived default.

The Authorization/bearer token field on admin-gated endpoints is
**intentionally not persisted anywhere** (not `localStorage`, not sent
anywhere but the one request you fire) - it lives in the input's DOM value
for the current page load only, and is cleared on refresh.

---

## 4. CORS

**No changes are required on the Worker.** It already sends fully permissive
CORS headers on every response (`src/index.js`, `CORS_HEADERS`):

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, apikey
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: X-Cache
```

Because `Access-Control-Allow-Origin` is `*`, this docs site can call the
production API directly from any origin you deploy it to (or from
`localhost` while developing).

**One real limitation, not a misconfiguration:** only headers listed in
`Access-Control-Expose-Headers` (just `X-Cache`) plus the browser's built-in
"simple" response headers (like `Content-Type`) are readable by JavaScript
on a cross-origin response. The Worker also sends `X-Request-Id` and, on
429s, `Retry-After` - those exist on the real response but **won't appear**
in the "Try it" response-headers panel, because the browser withholds
unexposed headers from `fetch()`. This is called out inline in the docs
site itself (Overview page) so it doesn't look like a bug. If you want the
Try It panel to show those headers too, add them to
`Access-Control-Expose-Headers` in `CORS_HEADERS` in `src/index.js` and
redeploy the Worker - that's the only Worker-side change this docs site
would benefit from, and it's optional.

---

## 5. What's in the project

```
chakudya-docs/
├── index.html                    # shell: header, sidebar, main containers
├── openapi.yaml                  # spec, copied verbatim from the API repo
├── openapi.json                  # same spec, JSON - what the UI actually fetches
├── data/
│   └── endpoint-metadata.json    # rate limits + role requirements (from routePolicy()),
│                                  # deliberately kept separate from the OpenAPI spec
├── css/
│   ├── theme.css                 # color tokens, typography, dark/light
│   ├── layout.css                # header/sidebar/main grid, responsive rules
│   └── components.css            # badges, cards, tables, try-it console, toasts
├── js/
│   ├── state.js                  # tiny shared state + pub/sub
│   ├── spec-loader.js            # fetches + normalizes openapi.json into endpoints/groups
│   ├── schema-example.js         # builds example JSON from schemas; JSON highlighter
│   ├── api-client.js             # builds & executes the real fetch() for Try It
│   ├── render-endpoint.js        # renders one endpoint's full doc page
│   ├── render-overview.js        # renders the landing page
│   ├── try-it.js                 # the interactive request/response console
│   ├── sidebar.js                # nav tree: grouping, collapse, active state
│   ├── search.js                 # filters the sidebar from header or sidebar search
│   ├── theme.js                  # dark/light toggle, persisted
│   ├── copy.js                   # copy-to-clipboard + toasts
│   └── main.js                   # bootstraps everything, hash router
├── assets/favicon.svg
└── API_SOURCE_README.md          # the original Chakudya API repo's README, for reference
```

The UI never hardcodes an endpoint list - every route, parameter, schema,
and example on every doc page is derived from `openapi.json` at load time.
`data/endpoint-metadata.json` is the one deliberately separate layer: rate
limits and role gates are *runtime policy*, not shape, so they're not part
of the OpenAPI document - they're read out of `routePolicy()` in
`src/index.js` and merged in at render time.

---

## 6. Endpoints documented (86 of 86)

Every route the Worker actually serves is documented - nothing was skipped.
`/manufacturers`, `/products`, and `/nutrition` were removed from the API in
v1.15.0-v1.16.0 and no longer appear here.

**Meta**
- `GET /` - API metadata

**Health**
- `GET /health` - Upstream service health check

**Batch**
- `POST /batch` - Run up to 20 sub-requests in one round trip (public, rate-limited)

**API Keys**
- `GET /admin/keys` - List API keys (root key only)
- `POST /admin/keys` - Create a new API key (root key only)
- `DELETE /admin/keys/{id}` - Revoke an API key (root key only)

**Foods**
- `GET /foods` - List foods
- `POST /foods` - Create a food (admin)
- `POST /foods/bulk` - Bulk-create foods (admin)
- `GET /foods/lookup` - External food lookup cascade (public, rate-limited)
- `GET /foods/search` - Typo-tolerant fuzzy search (public, rate-limited)
- `GET /foods/autocomplete` - Type-ahead search (public, rate-limited)
- `GET /foods/categories` - Food category list (public, rate-limited, cached 24h)
- `GET /foods/substitutes` - Nutritionally close substitutes for a food (public, rate-limited)
- `GET /foods/compare` - Side-by-side nutrient comparison of 2-6 foods (public, rate-limited)
- `GET /foods/{id}` - Get a food by id
- `GET /foods/{id}/label` - Codex-style nutrition facts label
- `PUT /foods/{id}` - Replace a food (admin)
- `PATCH /foods/{id}` - Partially update a food (admin)
- `DELETE /foods/{id}` - Delete a food (admin)

**Glycaemic Index**
- `GET /glycaemic-index` - List glycaemic index/load reference entries
- `POST /glycaemic-index` - Create an entry (admin)
- `POST /glycaemic-index/bulk` - Bulk-create entries (admin)
- `GET /glycaemic-index/{id}` - Get an entry by id
- `PUT /glycaemic-index/{id}` - Replace an entry (admin)
- `PATCH /glycaemic-index/{id}` - Partially update an entry (admin)
- `DELETE /glycaemic-index/{id}` - Delete an entry (admin)

**Exchange**
- `GET /exchange` - List diabetes/renal exchange list entries
- `POST /exchange` - Create an exchange list entry (admin)
- `POST /exchange/bulk` - Bulk-create exchange list entries (admin)
- `PUT /exchange/{id}` - Replace an exchange list entry (admin)
- `PATCH /exchange/{id}` - Partially update an exchange list entry (admin)
- `DELETE /exchange/{id}` - Delete an exchange list entry (admin)

**Renal**
- `GET /renal` - List renal foods
- `POST /renal` - Create a renal food entry (admin)
- `POST /renal/bulk` - Bulk-create renal food entries (admin)
- `PUT /renal/{id}` - Replace a renal food entry (admin)
- `PATCH /renal/{id}` - Partially update a renal food entry (admin)
- `DELETE /renal/{id}` - Delete a renal food entry (admin)

**Formulas**
- `GET /formulas` - List enteral formulas
- `POST /formulas` - Create an enteral formula (admin)
- `POST /formulas/bulk` - Bulk-create enteral formulas (admin)
- `PUT /formulas/{id}` - Replace an enteral formula (admin)
- `PATCH /formulas/{id}` - Partially update an enteral formula (admin)
- `DELETE /formulas/{id}` - Delete an enteral formula (admin)

**Drug Interactions**
- `GET /drug-interactions` - List drug-nutrient interaction entries
- `POST /drug-interactions` - Create an entry (admin)
- `POST /drug-interactions/bulk` - Bulk-create entries (admin)
- `GET /drug-interactions/search` - Keyword search (public, rate-limited)
- `GET /drug-interactions/{id}` - Get an entry by id
- `PUT /drug-interactions/{id}` - Replace an entry (admin)
- `PATCH /drug-interactions/{id}` - Partially update an entry (admin)
- `DELETE /drug-interactions/{id}` - Delete an entry (admin)

**Packaged**
- `GET /packaged` - List packaged/branded foods
- `GET /packaged/pending` - Admin review queue (admin)
- `POST /packaged/scan` - Submit a packaged food via photo (public, rate-limited)
- `POST /packaged/submit` - Submit a packaged food (public, rate-limited)
- `PUT /packaged/{id}` - Replace a packaged food (admin)
- `PATCH /packaged/{id}` - Partially update a packaged food (admin)
- `DELETE /packaged/{id}` - Delete a packaged food (admin)
- `POST /packaged/{id}/approve` - Approve a pending packaged food (admin)
- `POST /packaged/{id}/reject` - Reject a pending packaged food (admin)

**Favorites**
- `GET /favorites` - List a user's favorites (public, rate-limited)
- `POST /favorites` - Save a favorite (public, rate-limited, idempotent)
- `DELETE /favorites` - Remove a favorite (public, rate-limited)

**History**
- `GET /history` - Recently viewed, most recent first (public, rate-limited)
- `POST /history` - Log a view (public, rate-limited, opt-in)

**Food Log**
- `GET /log` - List nutrition diary entries for a user_id
- `POST /log` - Log a diary entry
- `GET /log/{id}` - Get a log entry by id
- `DELETE /log/{id}` - Delete a log entry
- `GET /log/summary` - Daily or weekly calorie totals

**Recipes**
- `POST /recipes/calculate` - Total and per-serving nutrition for a recipe (public, rate-limited)

**Meals**
- `POST /meals/analyze` - Macro split, food groups, and target comparison for a meal (public, rate-limited)

**Ingredients**
- `POST /ingredients/parse` - Parse free-text ingredients into structured items (public, rate-limited)

**DRI**
- `GET /dri` - Look up EAR/RDA/AI/UL by life stage or age+sex
- `GET /dri/life-stages` - List every DRI life-stage group
- `POST /dri/compare` - Compare a day's intake against a life stage's RDA/AI targets

**RAG**
- `POST /rag/ask` - RAG Search Orchestrator (public, rate-limited)
- `POST /rag/ingest` - Ingest a document into the RAG knowledge base (admin)
- `POST /rag/retrieve` - Raw semantic retrieval (public, rate-limited)
- `DELETE /rag/source` - Bulk-remove chunks by citation (admin)

**Memory**
- `POST /memory/consolidate` - Manually trigger consolidation for one session (admin)
- `GET /memory/recall` - Recall (deprecated - use POST, same params as query string)
- `POST /memory/recall` - Recall top-K relevant memory rows for a session (public, rate-limited, preferred)
- `POST /memory/write` - Write a raw memory fact (public, rate-limited)

---

## 7. Endpoints that needed manual (non-automatic) documentation

The OpenAPI spec (and this site) was generated from source, but a few things
can't be inferred from route signatures alone and were sourced from the
repo's README / `routePolicy()` instead of the route handlers themselves:

- **Rate limits and the `reviewer` role** (`data/endpoint-metadata.json`) - these
  live in `routePolicy()`, a separate function from the route handlers, so
  they're attached as metadata rather than pulled from the OpenAPI
  `security` scheme (OpenAPI has no native concept of "rate limit" or
  "sub-role within a scheme").
- **`GET /memory/recall`** is marked deprecated in the spec/UI on the
  strength of the README explicitly calling it deprecated in favor of the
  POST form - the route itself doesn't self-report deprecation.
- **`POST /memory/consolidate`** also runs automatically once an hour via a
  Cron Trigger (`wrangler.toml`), bypassing HTTP auth entirely. That's noted
  in the endpoint's callout since it's real, useful context, but it isn't
  something Try It can exercise (there's no HTTP route for the cron path).
- **Row shapes for `foods`, `exchange`, `renal`, `formulas`, `packaged`,
  `glycaemic-index`, `drug-interactions`** are intentionally modeled loosely in the
  spec (`additionalProperties: true` plus a handful of illustrative
  properties) rather than as an exhaustive column list, because - per the
  source README - those tables' columns evolve independently of the code
  (they're introspected from D1 at query time, not defined by a fixed ORM
  schema in `src/index.js`). The example values shown (e.g. "Nsima (thick,
  maize)") come directly from the spec's own `example` fields, not
  generated by this docs site.

Nothing was left undocumented because it couldn't be figured out - the
items above are annotated *more* precisely than a pure route-signature
scan could manage, not less.

---

## 8. A note on the JS client SDK

The API repo's README points to a separate SDK repo
([`Chakudya-sdk`](https://github.com/edisontaimu9-ui/Chakudya-sdk)) - that's
a different project from this docs site and wasn't touched here.
