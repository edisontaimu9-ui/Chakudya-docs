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
(`src/index.js`'s router and `routePolicy()`, the `src/fhir*.js` modules,
`src/ragPipeline.js`, `src/oauth.js` and `wrangler.toml`) - nothing here was
invented. Currently in line with API **v1.32.0**.

---

## Landing page

`#/` is a consumer-friendly landing page that presents CNR as a full nutrition platform (food data, growth assessment, clinical tools, FHIR care workflows, AI-ready knowledge) rather than just a food database (`js/render-landing.js`, `css/landing.css`).
The original technical overview now lives at `#/reference` (unchanged). All endpoint
and `#/account` routes are untouched.

- Counts shown (foods, WHO growth reference points summed over 10 tables, GI entries, exchange items, renal foods, formulas, drug
  interactions, packaged products) are read live from each list route's `count` via `GET /<resource>?limit=1`.
  Endpoints, groups and version come from `openapi.json`. Nothing is hard-coded; a failed
  request just omits that tile.
- Images live in `assets/images/` (all optional - a missing file falls back to a tinted
  placeholder): `hero-malawian-meal.webp` (1000x750) and `hero-malawian-meal-600.webp`
  (600x450, served to phones via `srcset`), `food-staples.webp`, `food-legumes-protein.webp`,
  `food-fruit-veg.webp`, `food-fish.webp` (480x600 each), `chakudya-logo.png` (master),
  `chakudya-logo-192.webp` (footer) and `og-chakudya.jpg` (1200x630, social preview).
  Only the hero is loaded eagerly (and preloaded on the landing route); everything else is lazy.
- Live record counts are fetched when the stats section nears the viewport. A count of 1 is
  never shown (with `limit=1` it can't be told apart from the API's fallback), and the growth
  tile only appears when all 10 growth tables answer.

PWA support is **not** implemented yet. See `PWA_READINESS.md` for the plan (manifest,
service worker, icons, offline strategy, install requirements).

## Routes and documentation structure

| Route | Page |
|---|---|
| `#/` | Consumer landing page (no sidebar) |
| `#/docs/getting-started` | Getting Started: base URL, first request, live status |
| `#/docs/endpoints` | API Endpoints: what the API provides, by resource |
| `#/docs/authentication` | Authentication: public routes, consumer keys, OAuth 2.0, rate limits |
| `#/docs/examples` | Request & Response Examples: envelope, pagination, runnable examples |
| `#/docs/schemas` | Data Schemas: every `components.schemas` entry in the spec |
| `#/docs/errors` | Error Handling: status codes, headers, retries |
| `#/docs/integrations` | Integrations: CORS, JS SDK, OpenAPI, FHIR, RAG, batch |
| `#/docs/api-reference` | API Reference: every documented route, filterable |
| `#/<method>-<path-slug>` | One endpoint page (unchanged), e.g. `#/get-foods` |
| `#/account` | Developer login and consumer keys (unchanged) |
| `#/reference` | Legacy link; redirects to `#/docs/getting-started` |

Route lists, schemas, status-code counts, rate limits and the FHIR operation table are
generated from `openapi.json` and `data/endpoint-metadata.json`. The hand-written parts are
the "What the API provides" list (kept in sync with the API README) and the prose.

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
├── js/config.js                  # Supabase URL + publishable key for the developer login
├── openapi.yaml                  # spec, kept in line with the API source (src/index.js router + routePolicy)
├── openapi.json                  # same spec, JSON - what the UI actually fetches
├── data/
│   └── endpoint-metadata.json    # rate limits + role requirements (from routePolicy()),
│                                  # deliberately kept separate from the OpenAPI spec
├── css/
│   ├── theme.css                 # color tokens, typography, dark/light
│   ├── layout.css                # header/sidebar/main grid, responsive rules
│   ├── components.css            # badges, cards, tables, try-it console, toasts
│   ├── landing.css               # consumer landing page (#/)
│   └── docs.css                  # developer guides (#/docs/...), header nav, sidebar guide list
├── js/
│   ├── state.js                  # tiny shared state + pub/sub
│   ├── spec-loader.js            # fetches + normalizes openapi.json into endpoints/groups
│   ├── schema-example.js         # builds example JSON from schemas; JSON highlighter
│   ├── api-client.js             # builds & executes the real fetch() for Try It
│   ├── render-endpoint.js        # renders one endpoint's full doc page
│   ├── render-landing.js         # consumer landing page (#/)
│   ├── render-docs.js            # the eight developer guides (#/docs/...)
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

## 6. Endpoints documented (163 of 163)

Every route the Worker actually serves is documented - nothing was skipped.
`/manufacturers`, `/products`, and `/nutrition` were removed from the API in
v1.15.0-v1.16.0 and no longer appear here. The list below matches API v1.32.0.

This list covers the whole spec (`openapi.json`). The portal UI deliberately
renders only public routes (see `js/spec-loader.js`), so admin-gated routes
such as key management, bulk inserts and `/rag/ingest` are in the spec but
not shown in the sidebar.

**Meta**
- `GET /` - API metadata

**Health**
- `GET /health` - Upstream service health check

**Batch**
- `POST /batch` - Run several sub-requests in one round trip

**API Keys**
- `GET /admin/keys` - List API keys (root key only)
- `POST /admin/keys` - Create a new API key (root key only)
- `DELETE /admin/keys/{id}` - Revoke an API key (root key only)

**OAuth** (client_credentials for machine-to-machine callers; the client secret is exchanged for a 1-hour bearer token)
- `POST /oauth/token` - OAuth 2.0 token endpoint (client_credentials)
- `GET /.well-known/oauth-authorization-server` - OAuth 2.0 authorization server metadata (RFC 8414)
- `GET /admin/oauth-clients` - List OAuth clients (root key only)
- `POST /admin/oauth-clients` - Create an OAuth client (root key only)
- `DELETE /admin/oauth-clients/{id}` - Revoke an OAuth client (root key only)

**Developer keys** (self-service consumer keys; authenticate with a developer login token, not an API key)
- `GET /developer/keys` - List your consumer API keys
- `POST /developer/keys` - Create a consumer API key
- `DELETE /developer/keys/{id}` - Revoke one of your keys

**Foods**
- `GET /foods` - List foods
- `POST /foods` - Create a food (admin)
- `POST /foods/bulk` - Bulk-create foods (admin)
- `GET /foods/lookup` - External food lookup cascade (public, rate-limited)
- `GET /foods/autocomplete` - Search-as-you-type suggestions (public, rate-limited)
- `GET /foods/categories` - Food category list (public, rate-limited, cached 24h)
- `GET /foods/search` - Typo-tolerant fuzzy search over foods (public, rate-limited)
- `GET /foods/substitutes` - Nutritionally close substitutes for a food (public, rate-limited)
- `GET /foods/compare` - Side-by-side nutrient comparison of 2-6 foods (public, rate-limited)
- `GET /foods/by-category` - Browse foods by category (public, rate-limited)
- `GET /foods/{id}/label` - Codex-oriented nutrition label for one food
- `GET /foods/{id}` - Get a food by id
- `PUT /foods/{id}` - Replace a food (admin)
- `PATCH /foods/{id}` - Partially update a food (admin)
- `DELETE /foods/{id}` - Delete a food (admin)

**Glycaemic Index**
- `GET /glycaemic-index` - List glycaemic index/load reference entries
- `POST /glycaemic-index` - Create a glycaemic index entry (admin)
- `POST /glycaemic-index/bulk` - Bulk-create glycaemic index entries (admin)
- `GET /glycaemic-index/{id}` - Get a glycaemic index entry by id
- `PUT /glycaemic-index/{id}` - Replace a glycaemic index entry (admin)
- `PATCH /glycaemic-index/{id}` - Partially update a glycaemic index entry (admin)
- `DELETE /glycaemic-index/{id}` - Delete a glycaemic index entry (admin)

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
- `POST /drug-interactions` - Create a drug-nutrient interaction entry (admin)
- `POST /drug-interactions/bulk` - Bulk-create drug-nutrient interaction entries (admin)
- `GET /drug-interactions/search` - Keyword search across drug-nutrient interactions
- `GET /drug-interactions/{id}` - Get a drug-nutrient interaction entry by id
- `PUT /drug-interactions/{id}` - Replace a drug-nutrient interaction entry (admin)
- `PATCH /drug-interactions/{id}` - Partially update a drug-nutrient interaction entry (admin)
- `DELETE /drug-interactions/{id}` - Delete a drug-nutrient interaction entry (admin)

**BMI for age**
- `GET /bmi-for-age/classify` - Classify BMI-for-age for a child or adolescent (5y 1m to 19y 0m)
- `GET /bmi-for-age` - List BMI-for-age reference rows (-3SD to +3SD cut-offs)
- `POST /bmi-for-age/bulk` - Bulk-create BMI-for-age rows (admin)

**HC velocity**
- `GET /hc-velocity/classify` - Classify a 6-month head circumference increment (birth to 24 months)
- `GET /hc-velocity` - List WHO 6-month head circumference increment rows (-3SD to +3SD, cm)
- `POST /hc-velocity/bulk` - Bulk-create HC velocity rows (admin)

**Length velocity**
- `GET /length-velocity/classify` - Classify a 6-month length increment (birth to 24 months)
- `GET /length-velocity` - List WHO 6-month length increment rows (-3SD to +3SD, cm)
- `POST /length-velocity/bulk` - Bulk-create Length velocity rows (admin)

**Weight velocity**
- `GET /weight-velocity/classify` - Classify a 6-month weight increment (birth to 24 months)
- `GET /weight-velocity` - List WHO 6-month weight increment rows (grams, with L/M/S/Delta)
- `POST /weight-velocity/bulk` - Bulk-create weight velocity rows (admin)

**MUAC for age**
- `GET /muac-for-age/classify` - Classify arm circumference (MUAC) for age, 3 to 60 months
- `GET /muac-for-age` - List WHO arm circumference-for-age rows (cm, with L/M/S)
- `POST /muac-for-age/bulk` - Bulk-create MUAC-for-age rows (admin)

**MUAC fixed cut-offs**
- `GET /muac/classify` - Classify MUAC with fixed age-group cut-offs (6 months to adult)

**Length height for age**
- `GET /length-height-for-age/classify` - Classify length/height-for-age (stunting), birth to 19 years
- `GET /length-height-for-age` - List WHO length/height-for-age rows (cm, with L/M/S)
- `POST /length-height-for-age/bulk` - Bulk-create length/height-for-age rows (admin)

**Weight for age**
- `GET /weight-for-age/classify` - Classify weight-for-age (underweight), birth to 10 years
- `GET /weight-for-age` - List WHO weight-for-age rows (kg, with L/M/S)
- `POST /weight-for-age/bulk` - Bulk-create weight-for-age rows (admin)

**Weight for length height**
- `GET /weight-for-length-height/classify` - Classify weight-for-length/height (wasting), birth to 5 years
- `GET /weight-for-length-height` - List WHO weight-for-length/height rows (kg, with L/M/S)
- `POST /weight-for-length-height/bulk` - Bulk-create weight-for-length/height rows (admin)

**BMI for age under 5**
- `GET /bmi-for-age-under-5/classify` - Classify BMI-for-age, birth to 5 years
- `GET /bmi-for-age-under-5` - List WHO BMI-for-age rows, birth to 5 years (kg/m2, with L/M/S)
- `POST /bmi-for-age-under-5/bulk` - Bulk-create BMI-for-age (under 5) rows (admin)

**HC for age**
- `GET /hc-for-age/classify` - Classify head circumference-for-age, birth to 5 years
- `GET /hc-for-age` - List WHO head circumference-for-age rows (cm, with L/M/S)
- `POST /hc-for-age/bulk` - Bulk-create head circumference-for-age rows (admin)

**Growth assessment** (every applicable WHO indicator in one call)
- `GET /growth/assess` - Combined WHO growth assessment (every applicable indicator in one call)

**Fenton Preterm** (licensed data — no list/dump route; every read returns a computed result, static metadata, or a rendered image, never raw L/M/S)
- `GET /fenton-preterm/classify` - Classify a preterm infant measurement (weight, length, or head circumference)
- `POST /fenton-preterm/profile` - Classify weight, length, and head circumference together at one timepoint
- `POST /fenton-preterm/growth` - Classify a series of same-metric measurements over time (trajectory + trend)
- `POST /fenton-preterm/velocity` - Growth velocity between consecutive same-metric measurements
- `GET /fenton-preterm/chart` - Server-rendered SVG growth chart (P3/P10/P50/P90/P97 curves)
- `GET /fenton-preterm/references` - Static reference metadata (years, sexes, metrics, valid age ranges, citations, license)
- `POST /fenton-preterm/bulk` - Bulk-create Fenton preterm reference rows (admin)

**FHIR** (stateless facade over the growth endpoints and the Nutrition Care Process, no storage, not yet registered with any OpenHIM/HIE instance; the hosted API runs in enforce mode, so every operation except conformance reads and `ConceptMap/$translate` needs a Bearer credential with a FHIR scope, and `AuditEvent` reads always do)
- `GET /fhir/metadata` - FHIR R4 CapabilityStatement
- `POST /fhir/Observation/$evaluate-growth` - Evaluate a growth/anthropometry measurement, FHIR-shaped
- `POST /fhir/Observation/$screen` - NCP screening (MUST, NRS-2002, MNA, SGA, PG-SGA or NACS classification)
- `POST /fhir/Observation/$assess-nutrition` - NCP Step 1 — nutrition assessment (adults)
- `POST /fhir/Condition/$diagnose` - NCP Step 2 — nutrition diagnosis (PES statement)
- `POST /fhir/CarePlan/$intervene` - NCP Step 3 — nutrition intervention
- `POST /fhir/CarePlan/$monitor` - NCP Step 4 - monitoring and evaluation of a follow-up visit
- `POST /fhir/Goal/$evaluate` - NCP Step 4 — monitoring and evaluation
- `POST /fhir/Bundle/$ncp-document` - NCP Step 5 - complete ADIME document Bundle
- `POST /fhir/Bundle/$care-context` - NCP Step 6 - professional and institutional context
- `POST /fhir/$validate` - Structural R4 check of one resource or Bundle
- `POST /fhir/ConceptMap/$translate` - Translate a Chakudya code (LOINC, HL7 practitioner-role, v3 ObservationInterpretation)
- `GET /fhir/ConceptMap/{id}` - Published terminology mapping
- `GET /fhir/AuditEvent` - Search stored audit events (admin)
- `GET /fhir/AuditEvent/{id}` - Read one stored audit event (admin)
- `POST /fhir/Bundle/$validate-document` - Validate an ADIME document Bundle
- `POST /fhir/Bundle/$nutrition-assessment` - Structured nutrition assessment (NCP step 1 foundation)
- `POST /fhir/QuestionnaireResponse/$validate` - Validate a QuestionnaireResponse against a built-in form
- `GET /fhir/Questionnaire` - List the built-in assessment forms
- `GET /fhir/Questionnaire/{id}` - One built-in assessment form
- `GET /fhir/CodeSystem/ncp-diagnosis` - NCP nutrition diagnostic terminology (2006 edition) as a FHIR CodeSystem
- `GET /fhir/CodeSystem/{name}` - FHIR CodeSystem used by the facade
- `GET /fhir/OperationDefinition/{id}` - FHIR OperationDefinition
- `GET /fhir/StructureDefinition/{name}` - FHIR Extension StructureDefinition

**Packaged**
- `GET /packaged` - List packaged/branded foods
- `GET /packaged/pending` - Admin review queue (admin)
- `POST /packaged/submit` - Submit a packaged food (public, rate-limited)
- `POST /packaged/scan` - Submit a packaged food via photo (public, rate-limited)
- `POST /packaged/{id}/approve` - Approve a pending packaged food (admin)
- `POST /packaged/{id}/reject` - Reject a pending packaged food (admin)
- `PUT /packaged/{id}` - Replace a packaged food (admin)
- `PATCH /packaged/{id}` - Partially update a packaged food (admin)
- `DELETE /packaged/{id}` - Delete a packaged food (admin)

**Favorites**
- `GET /favorites` - List a user's favorites (public, rate-limited)
- `POST /favorites` - Save a favorite (public, rate-limited, idempotent)
- `DELETE /favorites` - Remove a favorite (public, rate-limited)

**History**
- `GET /history` - Recently viewed, most recent first (public, rate-limited)
- `POST /history` - Log a view (public, rate-limited, opt-in)

**Food Log**
- `GET /log` - List nutrition diary entries (public, opt-in identity)
- `POST /log` - Log a food diary entry
- `GET /log/{id}` - Get a food log entry by id
- `DELETE /log/{id}` - Delete a food log entry
- `GET /log/summary` - Daily or weekly calorie totals for a user

**Recipes**
- `POST /recipes/calculate` - Compute total and per-serving nutrition for a recipe (public, rate-limited)

**Meals**
- `POST /meals/analyze` - Analyze a meal's macro split, food groups, and (optionally) targets (public, rate-limited)

**Ingredients**
- `POST /ingredients/parse` - Parse free-text ingredients into structured items (public, rate-limited)

**DRI**
- `GET /dri/life-stages` - List every DRI life-stage group
- `GET /dri` - Look up EAR/RDA/AI/UL by life stage or age+sex
- `POST /dri/compare` - Compare an actual day's intake against a life stage's RDA/AI targets

**RAG**
- `POST /rag/retrieve` - Raw semantic retrieval (public, rate-limited)
- `DELETE /rag/source` - Bulk-remove RAG chunks by citation (admin)
- `POST /rag/ingest` - Ingest a document into the RAG knowledge base (admin)
- `POST /rag/ask` - RAG Search Orchestrator (public, rate-limited)
- `POST /rag/upload` - Upload a document for automatic ingestion (admin)
- `POST /rag/enqueue` - Queue an already-uploaded file, or retry a failed job (admin)
- `GET /rag/jobs` - List recent ingestion jobs (admin)
- `GET /rag/jobs/{id}` - Get one ingestion job (admin)
- `POST /rag/webhook` - Storage trigger webhook (shared secret)

**Memory**
- `POST /memory/write` - Write a raw memory fact (public, rate-limited)
- `POST /memory/recall` - Recall top-K relevant memory rows for a session (public, rate-limited, preferred)
- `GET /memory/recall` - Recall (deprecated - use POST, same params as query string)
- `POST /memory/consolidate` - Manually trigger consolidation for one session (admin)

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
- **FHIR access mode.** Which `/fhir` operations need a credential depends on
  `FHIR_AUTH_MODE`, a deployment setting rather than something the route
  handlers declare. The docs describe the hosted configuration (`enforce`):
  conformance reads and `ConceptMap/$translate` are always open, `AuditEvent`
  reads always need a credential, and every other operation needs a Bearer
  token with a matching `system/<Resource>.<read|write>` scope. This was read
  from `fhirGovernance.js` and `wrangler.toml`. In open mode the same
  operations are public.
- **RAG ingestion pipeline** (`/rag/upload`, `/rag/enqueue`, `/rag/jobs`,
  `/rag/webhook`) is documented from `src/ragPipeline.js`; the webhook is
  authenticated by an `x-webhook-secret` header rather than a bearer token.
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

---

## 9. Developer login (consumer API keys)

The site has a sign-in page (`#/account`) where people create an account and
generate their own consumer API keys. It talks to Supabase Auth with plain
`fetch` (`js/auth.js`) and to the API's `/developer/keys` routes
(`js/render-account.js`). Those routes are in the spec but hidden from the
sidebar, like the admin routes.

One-time setup:

1. Run the API repo's `sql/029_add_developer_keys.sql` and deploy API v1.32.0.
2. Open `js/config.js` and replace `PASTE_PUBLISHABLE_KEY_HERE` with the
   project's publishable (anon) key from Supabase > Project Settings > API.
   That key is meant to be public. Never use the service_role key here.
   `supabaseUrl` must be the same project as the API's `SUPABASE_URL`.
3. In Supabase > Authentication: keep Email with "Confirm email" on, and add
   this site's URL (for example the GitHub Pages address) as the Site URL and
   under Redirect URLs. Confirmation and reset links send people back there.
4. Optional Google sign-in: enable the Google provider in Supabase, then set
   `googleEnabled: true` in `js/config.js`.

Notes:

- The login session (access and refresh token) is kept in `localStorage`. A
  raw API key is shown once and is never stored. If the person clicks
  "Use in Try It", it is kept in `sessionStorage` for that tab only.
- Until the publishable key is set, the header button stays hidden and
  `#/account` explains that sign-in isn't set up.


## Progressive Web App

The site is installable and works offline. See [PWA.md](PWA.md). Before every deploy run `node tools/stamp-sw.mjs` so returning users get the new version.
