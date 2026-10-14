/**
 * Developer documentation guides - routes "#/docs/<section>".
 *
 * The eight sections (Getting Started, API Endpoints, Authentication,
 * Request & Response Examples, Data Schemas, Error Handling, Integrations
 * and API Reference) are assembled from content that already existed in this
 * site (the old overview page) plus facts that are read live from the loaded
 * OpenAPI spec and data/endpoint-metadata.json, so lists of routes, schemas,
 * status codes and rate limits can't drift out of sync with the spec.
 *
 * Individual endpoint pages ("#/<slug>") are rendered by RenderEndpoint and
 * are what "API Reference" links into.
 */
const RenderDocs = (() => {
  const SECTIONS = [
    { id: "getting-started", title: "Getting Started", blurb: "Base URL, your first request and live API status." },
    { id: "endpoints", title: "API Endpoints", blurb: "What the API provides, grouped by resource." },
    { id: "authentication", title: "Authentication", blurb: "API keys, key types, open routes and rate limits." },
    { id: "examples", title: "Request & Response Examples", blurb: "Response format, pagination and runnable examples." },
    { id: "schemas", title: "Data Schemas", blurb: "Shared response and object shapes from the spec." },
    { id: "errors", title: "Error Handling", blurb: "Status codes, error bodies, retries and request IDs." },
    { id: "integrations", title: "Integrations", blurb: "Browsers, the JS SDK, FHIR, AI assistants and batching." },
    { id: "api-reference", title: "API Reference", blurb: "Every documented route, with a page for each." },
  ];
  const LANG_KEY = "chakudya-docs:snippet-lang";

  /* ───────── tiny helpers ───────── */

  const esc = (s) => RenderEndpoint.escapeHtml(String(s));
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  const base = () => (AppState.state.baseUrl || "https://your-worker.workers.dev").replace(/\/$/, "");
  const has = (id) => SECTIONS.some((s) => s.id === id);

  function epFor(method, path) {
    return AppState.state.endpoints.find((e) => e.method === method && e.path === path);
  }
  /** Method badge + path, linked to the endpoint page when that route is documented. */
  function epRef(method, path) {
    const ep = epFor(method, path);
    const inner = `<span class="badge-method badge-method--${method}">${method}</span><code>${esc(path)}</code>`;
    return ep ? `<a class="doc-ep" href="#/${ep.slug}">${inner}</a>` : `<span class="doc-ep">${inner}</span>`;
  }
  /** Plain-text link to an endpoint page when it exists. */
  function epLink(method, path, text) {
    const ep = epFor(method, path);
    const label = text || `<code>${esc(path)}</code>`;
    return ep ? `<a href="#/${ep.slug}">${label}</a>` : label;
  }

  function table(headers, rows, cls = "") {
    return el(`
      <div class="table-scroll"><table class="param-table doc-table ${cls}">
        <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>`);
  }

  function section(id, title, ...nodes) {
    const sec = el(`<section class="section doc-section" id="doc-${id}"><h2 class="section__title"></h2></section>`);
    sec.querySelector("h2").textContent = title;
    nodes.forEach((n) => {
      if (n === null || n === undefined) return;
      sec.append(typeof n === "string" ? el(`<div>${n}</div>`) : n);
    });
    return sec;
  }
  const p = (html) => el(`<p class="endpoint-desc">${html}</p>`);
  const callout = (html, danger) => el(`<div class="callout${danger ? " callout--danger" : ""}">${html}</div>`);

  /* ───────── code samples: curl / JavaScript / Python tabs ───────── */

  function toCurl({ method, path, query, body, auth }) {
    const url = base() + path + (query ? "?" + query : "");
    const lines = [method === "GET" && !auth && body === undefined ? `curl "${url}"` : `curl -X ${method} "${url}"`];
    if (auth) lines.push(`  -H "Authorization: Bearer YOUR_API_KEY"`);
    if (body !== undefined) {
      lines.push(`  -H "Content-Type: application/json"`);
      lines.push(`  -d '${JSON.stringify(body)}'`);
    }
    return lines.join(" \\\n");
  }
  function toJs({ method, path, query, body, auth }) {
    const url = base() + path + (query ? "?" + query : "");
    const headers = [];
    if (auth) headers.push(`    Authorization: "Bearer YOUR_API_KEY",`);
    if (body !== undefined) headers.push(`    "Content-Type": "application/json",`);
    const opts = [];
    if (method !== "GET") opts.push(`  method: "${method}",`);
    if (headers.length) opts.push(`  headers: {\n${headers.join("\n")}\n  },`);
    if (body !== undefined) opts.push(`  body: JSON.stringify(${JSON.stringify(body, null, 2).replace(/\n/g, "\n  ")}),`);
    const call = opts.length ? `fetch("${url}", {\n${opts.join("\n")}\n})` : `fetch("${url}")`;
    return `const res = await ${call};\nconst data = await res.json();\nconsole.log(data);`;
  }
  function toPy({ method, path, query, body, auth }) {
    const url = base() + path + (query ? "?" + query : "");
    const args = [`"${url}"`];
    if (auth) args.push(`headers={"Authorization": "Bearer YOUR_API_KEY"}`);
    if (body !== undefined) args.push(`json=${JSON.stringify(body, null, 4).replace(/\n/g, "\n    ")}`);
    args.push("timeout=30");
    return `import requests\n\nres = requests.${method.toLowerCase()}(\n    ${args.join(",\n    ")},\n)\nprint(res.json())`;
  }

  /** Tabbed code sample. The chosen language is remembered and kept in sync across every sample on the page. */
  function snippets(samples) {
    const wrap = el(`<div class="snip"><div class="tabs" role="tablist" aria-label="Language"></div></div>`);
    const tabs = wrap.querySelector(".tabs");
    let saved = null;
    try { saved = localStorage.getItem(LANG_KEY); } catch (_) { /* ignore */ }
    const start = samples.some((s) => s.label === saved) ? saved : samples[0].label;
    samples.forEach((s) => {
      const btn = el(`<button type="button" class="tab-btn" role="tab" data-lang="${esc(s.label)}" tabindex="-1"></button>`);
      btn.textContent = s.label;
      tabs.appendChild(btn);
      const panel = el(`<div class="tab-panel" role="tabpanel" data-lang="${esc(s.label)}"></div>`);
      panel.appendChild(RenderEndpoint.codeBlock(s.label, s.code, { lang: s.lang }));
      wrap.appendChild(panel);
    });
    function select(lang, broadcast) {
      wrap.querySelectorAll("[data-lang]").forEach((n) => {
        const on = n.dataset.lang === lang;
        n.classList.toggle("is-active", on);
        if (n.matches(".tab-btn")) { n.setAttribute("aria-selected", on ? "true" : "false"); n.tabIndex = on ? 0 : -1; }
      });
      if (broadcast) {
        try { localStorage.setItem(LANG_KEY, lang); } catch (_) { /* ignore */ }
        document.querySelectorAll(".snip").forEach((other) => {
          if (other !== wrap) other.dispatchEvent(new CustomEvent("snip-lang", { detail: lang }));
        });
      }
    }
    tabs.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const list = [...tabs.querySelectorAll(".tab-btn")];
      const i = list.indexOf(document.activeElement);
      if (i === -1) return;
      e.preventDefault();
      const next = list[(i + (e.key === "ArrowRight" ? 1 : list.length - 1)) % list.length];
      select(next.dataset.lang, true);
      next.focus();
    });
    tabs.addEventListener("click", (e) => {
      const b = e.target.closest(".tab-btn");
      if (b) select(b.dataset.lang, true);
    });
    wrap.addEventListener("snip-lang", (e) => {
      if (samples.some((s) => s.label === e.detail)) select(e.detail, false);
    });
    select(start, false);
    return wrap;
  }

  function sampleSet(req) {
    // Show the Authorization header on any route that needs a key, unless the caller set `auth` itself.
    if (req.auth === undefined) {
      const ep = epFor(req.method, req.path);
      req = { ...req, auth: !!ep && ["key", "admin", "optional"].includes(ep.authMode) };
    }
    return snippets([
      { label: "curl", lang: "bash", code: toCurl(req) },
      { label: "JavaScript", lang: "js", code: toJs(req) },
      { label: "Python", lang: "python", code: toPy(req) },
    ]);
  }

  /** A worked example: description, tabbed code, a "Run live" button and a link to the endpoint page. */
  function example(ex) {
    const card = el(`
      <article class="doc-example">
        <header class="doc-example__head">
          <h3></h3>
          <div class="doc-example__ep"></div>
        </header>
        <p class="doc-example__desc"></p>
      </article>`);
    card.querySelector("h3").textContent = ex.title;
    card.querySelector(".doc-example__ep").innerHTML = epRef(ex.method, ex.path);
    card.querySelector(".doc-example__desc").innerHTML = ex.desc;
    card.appendChild(sampleSet(ex));

    const bar = el(`<div class="doc-run"><button type="button" class="btn btn--sm btn--primary">Run live</button><span class="doc-run__hint">Calls the production API from your browser.</span></div>`);
    const out = el(`<div class="doc-run__out" aria-live="polite"></div>`);
    bar.querySelector("button").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      out.innerHTML = `<p class="doc-run__msg"><span class="spinner spinner--sm" aria-hidden="true"></span> Running…</p>`;
      const url = ApiClient.buildUrl(AppState.state.baseUrl, ex.path, {}, Object.fromEntries(new URLSearchParams(ex.query || "")));
      const hasBody = ex.body !== undefined;
      const r = await ApiClient.execute({
        url, method: ex.method,
        headers: ApiClient.buildHeaders({ hasBody, authToken: "" }),
        body: hasBody ? JSON.stringify(ex.body) : undefined,
      });
      btn.disabled = false;
      out.innerHTML = "";
      if (!r.ok) {
        out.appendChild(el(`<p class="doc-run__msg doc-run__msg--err">${navigator.onLine === false ? "You're offline. Live examples need an internet connection." : "Couldn't reach the API: " + esc(r.message)}</p>`));
        return;
      }
      const raw = r.bodyJson ?? r.bodyText;
      const text = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
      const shown = text.length > 6000 ? text.slice(0, 6000) + "\n… (truncated)" : text;
      out.appendChild(RenderEndpoint.codeBlock(`Live response · HTTP ${r.status} · ${r.durationMs} ms`, shown, { lang: "json" }));
    });
    card.append(bar, out);
    return card;
  }

  /* ───────── page chrome ───────── */

  function intercept(root) {
    // In-page anchors must not hit the hash router.
    root.querySelectorAll('a[href^="#doc-"]').forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      const t = document.getElementById(a.getAttribute("href").slice(1));
      if (!t) return;
      t.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }));
  }

  function pager(id) {
    const i = SECTIONS.findIndex((s) => s.id === id);
    const card = (s, dir) => s
      ? `<a class="endpoint-pager__card endpoint-pager__card--${dir}" href="#/docs/${s.id}">
           <span class="endpoint-pager__label">${dir === "prev" ? "← Previous" : "Next →"}</span>
           <span class="doc-pager__title">${esc(s.title)}</span></a>`
      : `<span class="endpoint-pager__spacer"></span>`;
    return el(`<nav class="endpoint-pager doc-pager" aria-label="Documentation sections">${card(SECTIONS[i - 1], "prev")}${card(SECTIONS[i + 1], "next")}</nav>`);
  }

  function page(id, lead, blocks) {
    const idx = SECTIONS.findIndex((s) => s.id === id);
    const meta = SECTIONS[idx];
    const root = el(`
      <div class="doc-page">
        <p class="eyebrow">Documentation · ${idx + 1} of ${SECTIONS.length}</p>
        <h1 class="doc-title"></h1>
        <p class="doc-lead"></p>
      </div>`);
    root.querySelector("h1").textContent = meta.title;
    root.querySelector(".doc-lead").innerHTML = lead;
    const body = el(`<div class="doc-body"></div>`);
    blocks.forEach((b) => b && body.appendChild(b));
    const heads = [...body.querySelectorAll(".doc-section:not(.doc-schema)")];
    if (heads.length >= 3) {
      root.appendChild(el(`
        <nav class="doc-toc" aria-label="On this page">
          <span class="doc-toc__label">On this page</span>
          ${heads.map((h) => `<a href="#${h.id}">${esc(h.querySelector("h2").textContent)}</a>`).join("")}
        </nav>`));
    }
    root.appendChild(body);
    root.appendChild(pager(id));
    intercept(root);
    return root;
  }

  /* ───────── 1. Getting Started ───────── */

  function gettingStarted() {
    const { spec, endpoints } = AppState.state;
    const status = el(`<div class="doc-mount"></div>`);
    const demo = el(`<div class="doc-mount"></div>`);
    setTimeout(() => { if (status.isConnected) StatusPanel.mount(status); }, 0);
    setTimeout(() => { if (demo.isConnected) DemoTerminal.mount(demo); }, 0);

    const baseBlock = RenderEndpoint.codeBlock("Base URL", base(), { lang: "text" });
    const steps = el(`
      <ol class="doc-steps">
        <li><strong>Get an API key.</strong> <a href="#/account">Sign in</a> and create a self-service key. Only <code>GET /</code>, <code>GET /health</code> and the FHIR conformance reads work without one.</li>
        <li><strong>Send it as a bearer token.</strong> Add <code>Authorization: Bearer YOUR_API_KEY</code> to each request. Consumer keys get three times the standard rate limit and FHIR access.</li>
        <li><strong>Explore the reference.</strong> Every endpoint has parameters, example requests and responses, and a live <em>Try it</em> console in the <a href="#/docs/api-reference">API Reference</a>.</li>
        <li><strong>Use the spec.</strong> Download <a href="openapi.yaml" download>openapi.yaml</a> or <a href="openapi.json" download>openapi.json</a> to generate clients or import into any OpenAPI 3 tool.</li>
      </ol>`);

    const next = el(`
      <div class="group-grid doc-next">
        ${["authentication", "examples", "errors", "integrations"].map((id) => {
          const s = SECTIONS.find((x) => x.id === id);
          return `<a class="group-card" href="#/docs/${id}"><div class="group-card__title">${esc(s.title)}</div><div class="group-card__desc">${esc(s.blurb)}</div></a>`;
        }).join("")}
      </div>`);

    return page("getting-started",
      `The Chakudya Nutrition Registry (CNR) API is a JSON-over-HTTPS API for Malawian food data, WHO growth assessment, clinical nutrition tools, a FHIR R4 facade and AI-ready knowledge. It currently documents <strong>${endpoints.length}</strong> endpoints (v${esc(spec.info?.version || "?")}).`,
      [
        section("start", "Quick start", p("All requests go to one base URL. Responses are JSON and cross-origin requests are allowed, so you can call it from a browser, a script or a phone terminal."), baseBlock, steps),
        section("first", "Make your first request", p(`Search the local food database for <em>nsima</em>. This uses ${epLink("GET", "/foods")} and needs your API key.`), sampleSet({ method: "GET", path: "/foods", query: "search=nsima&limit=5", auth: true })),
        section("live", "Live API status", p("Checked against <code>GET /health</code> when this page loads, then every minute while it is open. This is current status only, not a history."), status),
        section("demo", "See it in action", p("Real responses from the production API."), demo),
        section("next", "Where to next", next),
      ]);
  }

  /* ───────── 2. API Endpoints ───────── */

  function apiEndpoints() {
    const { groups } = AppState.state;
    // What the API provides - kept in sync by hand with the "What the API provides"
    // section of the chakudya-api README, same convention as openapi.yaml.
    const list = el(`
      <ul class="feature-list">
        <li><span><strong>Natural language meal and ingredient parsing</strong> (<code>/ingredients/parse</code>, <code>/meals/analyze</code>). Turn free text like "2 eggs, 1 cup rice, 100g chicken" into structured, calculable nutrition data.</span></li>
        <li><span><strong>Malawian food composition data</strong> (<code>/foods</code>). Locally relevant foods and their nutrient values.</span></li>
        <li><span><strong>Codex-oriented nutrition labels</strong> (<code>/foods/:id/label</code>). Standardized label built from a food's serving-size data, referencing CXS 1-1985 and CXG 2-1985, with an availability status on every declared value.</span></li>
        <li><span><strong>Food exchange systems</strong> (<code>/exchange</code>). Standard and therapeutic exchange lists.</span></li>
        <li><span><strong>Glycaemic index data</strong> (<code>/glycaemic-index</code>). GI/GL values for foods.</span></li>
        <li><span><strong>Renal nutrition data</strong> (<code>/renal</code>). Foods and nutrition information relevant to renal dietary planning.</span></li>
        <li><span><strong>Enteral formulas</strong> (<code>/formulas</code>). Structured information for clinical nutrition applications.</span></li>
        <li><span><strong>Drug-nutrient interactions</strong> (<code>/drug-interactions</code>). Lookup and search for known interactions.</span></li>
        <li><span><strong>WHO child and adolescent growth standards</strong> (<code>/length-height-for-age</code>, <code>/weight-for-age</code>, <code>/weight-for-length-height</code>, <code>/bmi-for-age</code>, <code>/bmi-for-age-under-5</code>, <code>/hc-for-age</code>, <code>/muac-for-age</code>, <code>/muac</code>). Z-scores, percentiles and status bands from birth to 19 years. Screening aids, not diagnoses.</span></li>
        <li><span><strong>Growth velocity</strong> (<code>/weight-velocity</code>, <code>/length-velocity</code>, <code>/hc-velocity</code>). WHO 6-month increment bands for infants.</span></li>
        <li><span><strong>Combined growth assessment</strong> (<code>/growth/assess</code>). Every applicable WHO indicator for one child in a single call, with the findings that need attention listed first.</span></li>
        <li><span><strong>Preterm growth</strong> (<code>/fenton-preterm</code>). Fenton chart classification, trajectories, velocity and server-rendered charts. Raw reference values are never returned.</span></li>
        <li><span><strong>FHIR R4 facade</strong> (<code>/fhir</code>). Stateless growth evaluation and the full Nutrition Care Process: screening, assessment, diagnosis, intervention, monitoring and ADIME documents, plus validation, terminology maps and audit events.</span></li>
        <li><span><strong>Packaged and branded foods</strong> (<code>/packaged</code>). Barcode lookup, community product submission, and OCR assisted data capture.</span></li>
        <li><span><strong>External food lookup</strong> (<code>/foods/lookup</code>, <code>/foods/autocomplete</code>, <code>/foods/categories</code>, <code>/foods/search</code>, <code>/foods/by-category</code>, <code>/foods/substitutes</code>, <code>/foods/compare</code>). Search, compare, substitute, and pull in USDA FoodData Central, Open Food Facts, and FatSecret data when a food isn't in the local database.</span></li>
        <li><span><strong>Recipe and meal calculation</strong> (<code>/recipes/calculate</code>, <code>/meals/analyze</code>). Per-serving nutrition totals and macro/food-group breakdowns for a full recipe or meal.</span></li>
        <li><span><strong>Dietary reference intakes</strong> (<code>/dri</code>, <code>/dri/compare</code>). Official EAR/RDA/AI/UL values by life stage, and comparison against an actual day's intake.</span></li>
        <li><span><strong>Favorites, history, and food log</strong> (<code>/favorites</code>, <code>/history</code>, <code>/log</code>). Client-supplied-identity diary and tracking, no account system required.</span></li>
        <li><span><strong>RAG powered nutrition knowledge</strong> (<code>/rag/ask</code>, <code>/rag/retrieve</code>). Retrieve relevant knowledge or ask a question directly. Admins can add documents with <code>/rag/ingest</code> or upload files for automatic ingestion with <code>/rag/upload</code>.</span></li>
        <li><span><strong>Session memory</strong> (<code>/memory/write</code>, <code>/memory/recall</code>, <code>/memory/consolidate</code>). Store, consolidate, and recall contextual information for AI assisted applications.</span></li>
        <li><span><strong>Consumer API keys</strong> (<a href="#/account">sign in to get one</a>). Self-service keys with three times the public rate limit, access to the FHIR operations and per-key usage counts.</span></li>
        <li><span><strong>Batch requests</strong> (<code>/batch</code>). Fan out several calls in one round trip through the same auth/rate-limit pipeline as a normal request.</span></li>
      </ul>`);

    const grid = el(`<div class="group-grid"></div>`);
    groups.forEach((g) => {
      const a = el(`<a class="group-card" href="#/${g.endpoints[0]?.slug || ""}"><div class="group-card__title"></div><div class="group-card__desc"></div></a>`);
      a.querySelector(".group-card__title").textContent = g.tag;
      a.querySelector(".group-card__desc").textContent = `${g.endpoints.length} endpoint${g.endpoints.length === 1 ? "" : "s"}`;
      grid.appendChild(a);
    });

    return page("endpoints",
      `Everything the API can do, by capability and by resource. Each resource below opens its first endpoint; the complete route list lives in the <a href="#/docs/api-reference">API Reference</a>.`,
      [
        section("provides", "What the API provides", list),
        section("resources", "Explore by resource", grid),
        section("conventions", "Conventions",
          p("Resources use plain REST paths (<code>/foods</code>, <code>/foods/{id}</code>), <code>GET</code> for reads and <code>POST</code> for calculations and submissions. List routes share the same pagination and response envelope, described under <a href=\"#/docs/examples\">Request &amp; Response Examples</a>. Errors are covered in <a href=\"#/docs/errors\">Error Handling</a>.")),
      ]);
  }

  /* ───────── 3. Authentication ───────── */

  function rateLimitTable() {
    const groups = new Map();
    AppState.state.endpoints.forEach((ep) => {
      const rl = ep.meta?.rateLimit;
      if (!rl) return;
      const key = `${rl.limit}|${rl.windowSeconds}|${rl.scope}`;
      if (!groups.has(key)) groups.set(key, { rl, eps: [] });
      groups.get(key).eps.push(ep);
    });
    if (!groups.size) return null;
    const sorted = [...groups.values()].sort((a, b) => b.eps.length - a.eps.length);
    const fmt = (rl) => `${rl.limit} per ${rl.windowSeconds === 60 ? "minute" : rl.windowSeconds + " s"}`;
    const rows = sorted.map((g, i) => {
      const scope = g.rl.scope === "admin" ? "per credential" : "per IP address";
      let routes;
      if (i === 0) routes = `The standard limit. Applies to ${g.eps.length} documented routes, including most reads.`;
      else {
        const chips = g.eps.map((e) => `<a class="doc-chip" href="#/${e.slug}"><code>${esc(e.method)} ${esc(e.path)}</code></a>`);
        routes = chips.length > 6
          ? `<details class="doc-more"><summary>${g.eps.length} routes</summary><div class="doc-chips">${chips.join("")}</div></details>`
          : `<div class="doc-chips">${chips.join("")}</div>`;
      }
      return [`<strong>${fmt(g.rl)}</strong>`, scope, routes];
    });
    return table(["Limit", "Counted", "Routes"], rows);
  }

  function authentication() {
    const keyReq = { method: "GET", path: "/foods", query: "search=nsima&limit=5", auth: true };
    const bearer = RenderEndpoint.codeBlock("Authorization header", "Authorization: Bearer YOUR_API_KEY", { lang: "text" });
    const rl = rateLimitTable();

    return page("authentication",
      `Almost every route needs an API key. Create your own on the account page, send it as a bearer token, and use the key types below to see which routes you can reach.`,
      [
        section("public", "Routes that need no key",
          p("Only <code>GET /</code>, <code>GET /health</code> and the FHIR conformance reads (<code>GET /fhir/metadata</code>, <code>CodeSystem</code>, <code>OperationDefinition</code>, <code>StructureDefinition</code>, <code>ConceptMap</code> and <code>Questionnaire</code>) work without a key. They are rate-limited by IP address."),
          p("Every other route returns <code>401</code> with the code <code>api_key_required</code> when no key is sent. Each endpoint page shows a badge for the credential it needs.")),
        section("roles", "Key types and access",
          table(["Badge", "Credential", "Reaches"], [
            ["Public", "None", "The open routes above."],
            ["API key required", "Any valid key: consumer, reviewer or admin", "Reads, growth and clinical tools, FHIR operations, recipes and meals, RAG ask and retrieve, memory, food log, favorites and history."],
            ["Admin key required", "Admin key", "Registry writes (foods, exchange, renal, formulas, drug interactions, glycaemic index, reference tables), bulk inserts, packaged review, RAG ingest and uploads, FHIR AuditEvent."],
            ["Admin (reviewer+)", "Reviewer or admin key", "Packaged-food review queue."],
            ["Root key required", "Root key only", "API key management and the admin monitor snapshot."],
            ["Login token required", "Developer login token", "Managing your own consumer keys at <code>/developer/keys</code>."],
            ["Webhook secret", "Shared secret in <code>x-webhook-secret</code>", "The storage trigger webhook, <code>POST /rag/webhook</code>."],
          ]),
          p("Admin, reviewer and root keys are issued by the API maintainers. A consumer key is refused on those routes.")),
        section("keys", "Consumer API keys",
          p("Anyone can create their own key on the <a href=\"#/account\">account page</a> (email and password, or Google). Send it as a bearer token:"),
          bearer,
          sampleSet(keyReq),
          table(["Rule", "Detail"], [
            ["Confirmation", "Your account email must be confirmed before you can create keys."],
            ["Limit", "Up to 3 active keys per account. Revoke one to create another."],
            ["Role", "Consumer keys can read and compute. They can never write reference data, manage keys or reach admin routes."],
            ["Rate limits", "<strong>3x</strong> the public limit of each route, counted in the key's own bucket instead of the shared per-IP one. Batch sub-requests count too."],
            ["FHIR", "Consumer keys can call the <code>/fhir</code> operations."],
            ["Visibility", "A key is shown <strong>once</strong>, when you create it. The account page lists your active keys with last-used time and usage counts."],
          ]),
          callout("<strong>Keep keys private.</strong> Don't put a key in front-end code that other people can open. Call the API from a server rather than from browser code.")),
        section("login", "Login tokens vs API keys",
          p("The account page signs you in with Supabase Auth and uses that <em>login</em> access token only for managing your keys (<code>/developer/keys</code>). It is not an API key and is not accepted anywhere else. The docs site handles this for you.")),
        section("limits", "Rate limits",
          p("Limits are applied per route. When you exceed one the API answers <code>429</code> with a <code>Retry-After</code> header (see <a href=\"#/docs/errors\">Error Handling</a>). Current limits for the documented routes:"),
          rl),
      ]);
  }

  /* ───────── 4. Request & Response Examples ───────── */

  const EXAMPLES = [
    {
      title: "Search foods", method: "GET", path: "/foods", query: "search=nsima&limit=5",
      desc: "Search the local database by name. List responses include <code>count</code>, <code>limit</code> and <code>offset</code>.",
    },
    {
      title: "Look up a food (with external fallback)", method: "GET", path: "/foods/lookup", query: "q=nsima",
      desc: "Name or barcode lookup that falls back to USDA FoodData Central, Open Food Facts and FatSecret when a food isn't in the local database.",
    },
    {
      title: "Compare foods side by side", method: "GET", path: "/foods/compare", query: "foods=nsima,rice,potatoes",
      desc: "Compare the nutrients of 2 to 6 foods.",
    },
    {
      title: "Analyze a meal", method: "POST", path: "/meals/analyze",
      body: { meal_type: "lunch", ingredients: [{ food_name: "nsima", quantity: 1, unit: "chunk" }, { food_name: "beans", quantity: 1, unit: "cup" }, { food_name: "tomato", quantity: 1, unit: "medium" }] },
      desc: "Resolves each ingredient, converts units and returns totals, a macronutrient split and food-group coverage.",
    },
    {
      title: "Parse free-text ingredients", method: "POST", path: "/ingredients/parse",
      body: { text: "2 eggs, 1 cup rice, 100g chicken and 1/2 avocado" },
      desc: "Turns plain text into <code>ingredients</code> in the exact shape <code>/recipes/calculate</code> and <code>/meals/analyze</code> accept. A bare count with no unit comes back as <code>unit: \"serving\"</code>.",
    },
    {
      title: "Retrieve nutrition knowledge", method: "POST", path: "/rag/retrieve",
      body: { query: "high potassium foods", context: "both", top_k: 5 },
      desc: "Semantic retrieval for AI assistants. <code>context</code> is <code>clinical</code>, <code>general</code> or <code>both</code>.",
    },
  ];

  function examplesPage() {
    const listOk = RenderEndpoint.codeBlock("List response", { status: "success", count: 123, limit: 50, offset: 0, data: [] });
    const oneOk = RenderEndpoint.codeBlock("Single or mutation response", { status: "success", message: "Food created", data: {} });
    const errBlock = RenderEndpoint.codeBlock("Error response", { status: "error", message: "Description of what went wrong" });
    const cursorBlock = RenderEndpoint.codeBlock("Cursor response", { status: "success", limit: 50, has_more: true, next_cursor: 187, data: [] });
    const cursorCurl = RenderEndpoint.codeBlock("Walk the pages", [
      `curl "${base()}/foods?limit=50&cursor="       # first page`,
      `curl "${base()}/foods?limit=50&cursor=187"    # next page: use next_cursor from the last response`,
    ].join("\n"), { lang: "bash" });

    const envelope = el(`<div class="doc-pair"></div>`);
    envelope.append(listOk, oneOk, errBlock);

    return page("examples",
      `The shapes you will see in every response, how to page through lists, and runnable examples of the most common calls. Every example has a <em>Run live</em> button that calls the production API.`,
      [
        section("envelope", "Response format",
          p("Every JSON response carries a <code>status</code> of <code>success</code> or <code>error</code>. FHIR routes return FHIR resources, and FHIR errors are <code>OperationOutcome</code> resources (see <a href=\"#/docs/errors\">Error Handling</a>)."),
          envelope),
        section("pagination", "Pagination",
          p("List routes support two modes, chosen by whether <code>?cursor=</code> is present. <strong>Offset/limit</strong> (the default) uses <code>?limit=50&amp;offset=100</code>. <strong>Cursor</strong> (keyset) adds <code>?cursor=</code>, empty for the first page. Each response includes <code>next_cursor</code> to pass as the next request's <code>cursor</code>, and stops when <code>has_more</code> is <code>false</code>. Cursor pages are always ordered by <code>id.asc</code>, even where the offset mode's default order differs, and are not disturbed by rows changing mid-walk."),
          cursorBlock, cursorCurl),
        section("worked", "Worked examples", ...EXAMPLES.map(example)),
      ]);
  }

  /* ───────── 5. Data Schemas ───────── */

  function schemaOf(spec, node) {
    node = SpecLoader.deref(spec, node) || {};
    if (!node.allOf) return node;
    const merged = { ...node, properties: { ...(node.properties || {}) }, required: [...(node.required || [])] };
    node.allOf.forEach((sub) => {
      const s = schemaOf(spec, sub);
      Object.assign(merged.properties, s.properties || {});
      merged.required.push(...(s.required || []));
      if (!merged.description && s.description) merged.description = s.description;
      if (!merged.type && s.type) merged.type = s.type;
    });
    return merged;
  }
  function refName(ref) { return ref ? ref.split("/").pop() : ""; }
  function typeOf(spec, prop) {
    if (!prop) return "any";
    if (prop.$ref) {
      const n = refName(prop.$ref);
      return AppState.state.spec.components?.schemas?.[n] ? `<a href="#doc-schema-${esc(n)}">${esc(n)}</a>` : esc(n);
    }
    if (prop.allOf?.length === 1) return typeOf(spec, prop.allOf[0]);
    if (prop.oneOf || prop.anyOf) return (prop.oneOf || prop.anyOf).map((s) => typeOf(spec, s)).join(" | ");
    if (prop.enum) return prop.enum.map((v) => `<code>${esc(v)}</code>`).join(" | ");
    if (prop.type === "array") return `array of ${typeOf(spec, prop.items)}`;
    return esc((prop.type || "object") + (prop.format ? ` (${prop.format})` : "") + (prop.nullable ? ", nullable" : ""));
  }

  function schemasPage() {
    const { spec } = AppState.state;
    const schemas = spec.components?.schemas || {};
    const names = Object.keys(schemas);
    const chips = el(`<div class="doc-chips doc-chips--index">${names.map((n) => `<a class="doc-chip" href="#doc-schema-${esc(n)}"><code>${esc(n)}</code></a>`).join("")}</div>`);

    const items = names.map((name) => {
      const s = schemaOf(spec, schemas[name]);
      const required = new Set(s.required || []);
      const props = Object.entries(s.properties || {});
      const node = el(`<section class="section doc-section doc-schema" id="doc-schema-${esc(name)}"><h3 class="doc-schema__name"><code></code></h3></section>`);
      node.querySelector("code").textContent = name;
      if (s.description) node.appendChild(el(`<p class="endpoint-desc">${esc(s.description)}</p>`));
      if (props.length) {
        node.appendChild(table(["Field", "Type", "Description"], props.map(([k, v]) => {
          const d = SpecLoader.deref(spec, v) || {};
          const extra = [d.default !== undefined ? `default: ${JSON.stringify(d.default)}` : "", d.example !== undefined && typeof d.example !== "object" ? `e.g. ${JSON.stringify(d.example)}` : ""].filter(Boolean).join(" · ");
          return [`<code>${esc(k)}</code>${required.has(k) ? '<span class="param-required">required</span>' : ""}`, typeOf(spec, v), `${esc(d.description || "")}${extra ? ` <span class="field__hint">${esc(extra)}</span>` : ""}`];
        })));
      } else {
        node.appendChild(el(`<p class="section__note">Free-form object. See the example below.</p>`));
      }
      const ex = SchemaExample.build(spec, { $ref: `#/components/schemas/${name}` });
      if (ex !== null && ex !== undefined && typeof ex === "object") node.appendChild(RenderEndpoint.codeBlock("Example", ex));
      return node;
    });

    return page("schemas",
      `The reusable object shapes defined in the OpenAPI spec. Most endpoints also show their own request and response examples on their reference page. Examples below are generated from the spec's own declared fields and examples.`,
      [
        section("index", "Schemas", p(`${names.length} shared schemas are defined in <a href="openapi.json" download>openapi.json</a>.`), chips),
        ...items,
      ]);
  }

  /* ───────── 6. Error Handling ───────── */

  const STATUS_ROWS = [
    ["200", "Success", ""],
    ["204", "Preflight (<code>OPTIONS</code>) response.", ""],
    ["400", "Bad request. A required parameter is missing or invalid, for example a non-numeric <code>cursor</code>.", ""],
    ["401", "A credential is required, or the one sent is missing or invalid.", ""],
    ["403", "The credential is valid but lacks the role or scope, or the account email isn't confirmed yet.", ""],
    ["404", "The resource or route was not found.", ""],
    ["405", "Method not allowed for this route.", ""],
    ["409", "Conflict, for example you already have 3 active keys, or a barcode already has an approved or pending entry.", ""],
    ["413", "Upload too large (the file limit is 25 MB).", ""],
    ["422", "Valid request, but it failed validation or isn't supported. FHIR routes list every problem in an <code>OperationOutcome</code>.", ""],
    ["429", "Rate limit exceeded. Wait for the number of seconds in <code>Retry-After</code>.", ""],
    ["500", "Internal server error. The body carries a <code>request_id</code> you can quote when reporting it.", ""],
    ["501", "Not supported on this deployment (FHIR responses use an <code>OperationOutcome</code>).", ""],
    ["502", "An upstream step failed (for example the embedding or storage service).", ""],
    ["503", "A required upstream service is unavailable or not configured on this deployment.", ""],
  ];

  function errorsPage() {
    const { endpoints } = AppState.state;
    const counts = {};
    endpoints.forEach((ep) => Object.keys(ep.responses || {}).forEach((c) => { counts[c] = (counts[c] || 0) + 1; }));
    const rows = STATUS_ROWS.map(([code, meaning]) => {
      const n = counts[code];
      const cls = code[0] === "2" ? "ok" : code[0] === "4" ? "warn" : "err";
      return [`<span class="doc-code doc-code--${cls}">${code}</span>`, meaning, n ? `${n} documented route${n === 1 ? "" : "s"}` : "<span class=\"field__hint\">any route</span>"];
    });

    const errBody = RenderEndpoint.codeBlock("Standard error", { status: "error", message: "Description of what went wrong" });
    const err500 = RenderEndpoint.codeBlock("500 error", { status: "error", message: "Internal server error", request_id: "5e2f..." });
    const e429 = RenderEndpoint.codeBlock("429 response", "HTTP/1.1 429 Too Many Requests\nRetry-After: 60\n\n" + JSON.stringify({ status: "error", message: "Rate limit exceeded. Try again shortly." }, null, 2), { lang: "text" });

    const jsClient = [
      `const BASE = "${base()}";`,
      "",
      "async function cnr(path, options = {}, retries = 2) {",
      "  const res = await fetch(BASE + path, options);",
      "",
      "  // Rate limited: wait for Retry-After, then try again.",
      "  if (res.status === 429 && retries > 0) {",
      '    const wait = Number(res.headers.get("Retry-After") || 60);',
      "    await new Promise((r) => setTimeout(r, wait * 1000));",
      "    return cnr(path, options, retries - 1);",
      "  }",
      "",
      "  const body = await res.json();",
      "  if (!res.ok) {",
      "    const message = body.message || body.issue?.[0]?.diagnostics || `HTTP ${res.status}`;",
      "    const err = new Error(message);",
      "    err.status = res.status;",
      '    err.requestId = res.headers.get("X-Request-Id") || body.request_id;',
      "    throw err;",
      "  }",
      "  return body;",
      "}",
      "",
      'const foods = await cnr("/foods?search=nsima&limit=5");',
    ].join("\n");
    const pyClient = [
      "import time",
      "import requests",
      "",
      `BASE = "${base()}"`,
      "",
      'def cnr(path, method="GET", retries=2, **kwargs):',
      "    res = requests.request(method, BASE + path, timeout=30, **kwargs)",
      "",
      "    # Rate limited: wait for Retry-After, then try again.",
      "    if res.status_code == 429 and retries > 0:",
      '        time.sleep(int(res.headers.get("Retry-After", 60)))',
      "        return cnr(path, method, retries - 1, **kwargs)",
      "",
      "    body = res.json()",
      "    if not res.ok:",
      '        message = body.get("message") or f"HTTP {res.status_code}"',
      '        request_id = res.headers.get("X-Request-Id") or body.get("request_id")',
      '        raise RuntimeError(f"{message} (HTTP {res.status_code}, request {request_id})")',
      "    return body",
      "",
      'foods = cnr("/foods?search=nsima&limit=5")',
    ].join("\n");

    return page("errors",
      `Errors are plain JSON with a matching HTTP status. Check the status code first, then read <code>message</code>. Send the <code>X-Request-Id</code> with any bug report.`,
      [
        section("shape", "Error format",
          p("Non-FHIR routes return <code>status: \"error\"</code> and a human-readable <code>message</code>. FHIR routes return a FHIR <code>OperationOutcome</code> (see the <a href=\"#/docs/schemas\">FhirOperationOutcome</a> schema)."),
          errBody, err500),
        section("codes", "Status codes",
          table(["Code", "Meaning", "Documented on"], rows)),
        section("headers", "Response headers",
          p("These headers are sent on responses and are readable from browser JavaScript, because the API exposes them in <code>Access-Control-Expose-Headers</code>."),
          table(["Header", "What it tells you"], [
            ["<code>X-Request-Id</code>", "A unique ID for the request, on every response (success, error, rate-limited or cached). Quote it when reporting an issue."],
            ["<code>Retry-After</code>", "On a <code>429</code>, the number of seconds to wait before trying again."],
            ["<code>X-Cache</code>", "<code>HIT</code> or <code>MISS</code> on cached reads, so you can see whether a response came from the edge cache."],
            ["<code>WWW-Authenticate</code>", "On a <code>401</code>, describes how to authenticate."],
          ])),
        section("rate", "Handling rate limits", p("Back off for <code>Retry-After</code> seconds rather than retrying immediately. See <a href=\"#/docs/authentication\">Authentication</a> for the limit of each route, and use a consumer key for three times the public limit."), e429),
        section("client", "A resilient client",
          p("Wrap your calls once: retry after a <code>429</code>, throw on any other error, and keep the request ID."),
          snippets([{ label: "JavaScript", lang: "js", code: jsClient }, { label: "Python", lang: "python", code: pyClient }])),
      ]);
  }

  /* ───────── 7. Integrations ───────── */

  function integrationsPage() {
    const fhirEps = AppState.state.endpoints.filter((e) => e.path.startsWith("/fhir"));
    const cors = RenderEndpoint.codeBlock("Response headers",
      "Access-Control-Allow-Origin: *\nAccess-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS\nAccess-Control-Allow-Headers: Content-Type, Authorization, apikey\nAccess-Control-Max-Age: 86400\nAccess-Control-Expose-Headers: X-Cache, X-Request-Id, Retry-After, WWW-Authenticate",
      { lang: "text" });

    const batchBody = { requests: [{ id: "nsima", method: "GET", path: "/foods/lookup?q=nsima" }, { id: "beans", method: "GET", path: "/foods?search=beans&limit=3" }] };

    const fhirTable = fhirEps.length
      ? table(["Operation", "Summary"], fhirEps.map((e) => [epRef(e.method, e.path), esc(e.summary)]))
      : null;

    return page("integrations",
      `Ways to connect Chakudya to browsers, apps, clinical systems and AI assistants.`,
      [
        section("browser", "Browsers and CORS",
          p("The API sends permissive CORS headers on every response, so any origin can call it directly with no proxy. Remember not to ship an API key to the browser (see <a href=\"#/docs/authentication\">Authentication</a>)."),
          cors),
        section("sdk", "JavaScript SDK",
          p("A zero-dependency JavaScript client lives in its own repository. It ships browser (<code>&lt;script&gt;</code> tag), ESM and CommonJS builds with TypeScript types. See its README for install and usage."),
          el(`<p><a class="btn" href="https://github.com/edisontaimu9-ui/Chakudya-sdk" target="_blank" rel="noopener">Chakudya-sdk on GitHub</a></p>`)),
        section("openapi", "OpenAPI spec",
          p("The whole API is described in OpenAPI 3. Download it to generate a typed client in your language, or import it into any OpenAPI-compatible tool."),
          el(`<p class="doc-actions"><a class="btn" href="openapi.yaml" download>Download openapi.yaml</a><a class="btn" href="openapi.json" download>Download openapi.json</a></p>`)),
        section("fhir", "FHIR R4 and clinical systems",
          p("The <code>/fhir</code> facade is a stateless FHIR R4 layer for growth evaluation and the Nutrition Care Process (screening, assessment, diagnosis, intervention, monitoring and ADIME documents), with validation and terminology maps. Use a <a href=\"#/account\">consumer key</a> to call it."),
          fhirTable),
        section("ai", "AI assistants and RAG",
          p(`Ground an assistant in real nutrition data with ${epLink("POST", "/rag/retrieve")} (raw semantic retrieval) or ${epLink("POST", "/rag/ask")} (answer a question), and keep context between turns with ${epLink("POST", "/memory/write")} and ${epLink("GET", "/memory/recall")}.`),
          sampleSet({ method: "POST", path: "/rag/retrieve", body: { query: "high potassium foods", context: "both", top_k: 5 } })),
        section("batch", "Batching requests",
          p(`${epLink("POST", "/batch")} runs up to 20 sub-requests in one round trip through the same auth and rate-limit pipeline as a normal request. Each sub-request still counts against its own route's limit, and the batch itself is limited to 10 per minute per IP. Pass an <code>id</code> on each item to match results to requests.`),
          sampleSet({ method: "POST", path: "/batch", body: batchBody })),
      ]);
  }

  /* ───────── 8. API Reference ───────── */

  function apiReference() {
    const { groups, endpoints } = AppState.state;
    const filter = el(`
      <div class="doc-filter">
        <label class="sr-only" for="doc-ref-filter">Filter routes</label>
        <input id="doc-ref-filter" type="search" placeholder="Filter routes, e.g. growth, /foods, POST" autocomplete="off" />
        <span class="doc-filter__count" id="doc-ref-count" aria-live="polite"></span>
      </div>`);
    const wrap = el(`<div class="doc-ref"></div>`);
    groups.forEach((g) => {
      const sec = el(`
        <section class="doc-ref__group">
          <h3 class="doc-ref__title"><span></span><small>${g.endpoints.length}</small></h3>
          <ul class="doc-ref__list"></ul>
        </section>`);
      sec.querySelector("h3 span").textContent = g.tag;
      const ul = sec.querySelector("ul");
      g.endpoints.forEach((ep) => {
        const li = el(`
          <li data-search="${esc((ep.method + " " + ep.path + " " + ep.summary + " " + g.tag).toLowerCase())}">
            <a class="doc-ref__row" href="#/${ep.slug}">
              <span class="badge-method badge-method--${ep.method}">${ep.method}</span>
              <code class="doc-ref__path"></code>
              <span class="doc-ref__sum"></span>
            </a>
          </li>`);
        li.querySelector(".doc-ref__path").textContent = ep.path;
        li.querySelector(".doc-ref__sum").textContent = ep.summary;
        ul.appendChild(li);
      });
      wrap.appendChild(sec);
    });
    const empty = el(`<p class="section__note doc-ref__empty" hidden>No routes match that filter.</p>`);

    function apply(q) {
      q = q.trim().toLowerCase();
      let shown = 0;
      wrap.querySelectorAll(".doc-ref__group").forEach((g) => {
        let n = 0;
        g.querySelectorAll("li").forEach((li) => {
          const ok = !q || li.dataset.search.includes(q);
          li.hidden = !ok;
          if (ok) n++;
        });
        g.hidden = n === 0;
        shown += n;
      });
      empty.hidden = shown !== 0;
      filter.querySelector("#doc-ref-count").textContent = q ? `${shown} of ${endpoints.length}` : `${endpoints.length} routes`;
    }
    filter.querySelector("input").addEventListener("input", (e) => apply(e.target.value));
    apply("");

    return page("api-reference",
      `All ${endpoints.length} documented routes in ${groups.length} resource groups. Open any route for its parameters, example requests and responses, and a live <em>Try it</em> console. Use <kbd>←</kbd> and <kbd>→</kbd> on a route page to step through them.`,
      [
        section("routes", "Routes", filter, wrap, empty),
        section("spec", "Machine-readable spec",
          el(`<p class="doc-actions"><a class="btn" href="openapi.yaml" download>Download openapi.yaml</a><a class="btn" href="openapi.json" download>Download openapi.json</a></p>`)),
      ]);
  }

  /* ───────── entry point ───────── */

  const BUILDERS = {
    "getting-started": gettingStarted,
    endpoints: apiEndpoints,
    authentication,
    examples: examplesPage,
    schemas: schemasPage,
    errors: errorsPage,
    integrations: integrationsPage,
    "api-reference": apiReference,
  };

  function render(id, container) {
    container.innerHTML = "";
    const root = BUILDERS[id]();
    container.appendChild(root);
  }

  return { SECTIONS, has, render };
})();
