/**
 * Landing page (route "#/") - the consumer-friendly front door.
 *
 * The technical documentation lives under "#/docs/..." (see RenderDocs).
 *
 * Numbers shown here are never hard-coded:
 *   - Endpoints / resource groups come from the loaded OpenAPI spec.
 *   - Record counts come live from the API's own list responses
 *     (`count` on GET /<resource>?limit=1). If a request fails, that
 *     tile is simply left out - no placeholder or guessed figure.
 *   - The API version comes from the spec's info.version.
 */
const RenderLanding = (() => {
  const IMG = "assets/images/";
  const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Live record counts. One request per resource per page load, cached in memory.
  const COUNT_SOURCES = [
    { key: "foods", path: "/foods", label: "Foods in the registry", note: "Local food composition records" },
    { key: "gi", path: "/glycaemic-index", label: "Glycaemic index entries", note: "GI / GL reference values" },
    { key: "exchange", path: "/exchange", label: "Exchange list items", note: "Standard & therapeutic lists" },
    { key: "renal", path: "/renal", label: "Renal nutrition foods", note: "For renal dietary planning" },
    { key: "formulas", path: "/formulas", label: "Enteral formulas", note: "Clinical nutrition products" },
    { key: "drugs", path: "/drug-interactions", label: "Drug-nutrient interactions", note: "Known interactions" },
  ];
  // WHO growth reference tables: summed into one tile, and only shown when every table answers (a partial sum would understate it).
  const GROWTH_PATHS = ["/weight-for-age", "/length-height-for-age", "/weight-for-length-height", "/bmi-for-age", "/bmi-for-age-under-5", "/hc-for-age", "/muac-for-age", "/weight-velocity", "/length-velocity", "/hc-velocity"];
  let countsPromise = null;

  function esc(s) { return RenderEndpoint.escapeHtml(String(s)); }
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function fmt(n) { return Number(n).toLocaleString("en-US"); }

  function epLink(method, path) {
    const ep = AppState.state.endpoints.find((e) => e.method === method && e.path === path);
    return ep ? `#/${ep.slug}` : "#/docs/api-reference";
  }

  /** Image with a graceful fallback: if the file isn't uploaded yet the <img> removes itself and the tinted backdrop remains. */
  function img(file, alt, w, h, { eager = false } = {}) {
    return `<img src="${IMG}${file}" alt="${esc(alt)}" width="${w}" height="${h}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" onerror="this.remove()" />`;
  }

  /** Hero photo: small file for phones, larger for desktop; the only eager image on the page. */
  function heroImg() {
    const alt = "A Malawian meal of nsima with fried fish, beans, greens and relish on a tray";
    return `<img src="${IMG}hero-malawian-meal.webp" srcset="${IMG}hero-malawian-meal-600.webp 600w, ${IMG}hero-malawian-meal.webp 1000w" sizes="(max-width: 900px) 92vw, 560px" alt="${esc(alt)}" width="1000" height="750" fetchpriority="high" decoding="async" onerror="this.remove()" />`;
  }

  /* ───────── live data ───────── */

  async function countOf(path) {
    try {
      const url = ApiClient.buildUrl(AppState.state.baseUrl, path, {}, { limit: 1 });
      const r = await ApiClient.execute({ url, method: "GET", headers: {} });
      const n = r.ok && r.status === 200 ? r.bodyJson?.count : null;
      // limit=1: a count of 1 can't be told apart from the API's fallback (rows returned), so it is never shown.
      return Number.isFinite(n) && n > 1 ? n : null;
    } catch (_) { return null; }
  }

  function fetchCounts() {
    if (countsPromise) return countsPromise;
    const growth = Promise.all(GROWTH_PATHS.map(countOf)).then((ns) =>
      ns.every((n) => n !== null)
        ? { key: "growth", label: "WHO growth reference points", note: `Across ${ns.length} reference tables`, count: ns.reduce((a, b) => a + b, 0) }
        : null
    );
    const core = Promise.all(COUNT_SOURCES.map(async (src) => {
      const n = await countOf(src.path);
      return n ? { ...src, count: n } : null;
    }));
    countsPromise = Promise.all([core, growth]).then(([rows, g]) => {
      const out = rows.filter(Boolean);
      if (g) out.splice(1, 0, g); // right after "Foods", so food + growth lead
      if (!out.length) countsPromise = null; // allow a retry on the next visit
      return out;
    });
    return countsPromise;
  }

  async function checkHealth() {
    try {
      const url = ApiClient.buildUrl(AppState.state.baseUrl, "/health", {}, {});
      const r = await ApiClient.execute({ url, method: "GET", headers: {} });
      return r.ok && r.status === 200 && r.bodyJson?.status === "healthy";
    } catch (_) { return false; }
  }

  /* ───────── motion helpers ───────── */

  function animateCount(node, target) {
    if (reduceMotion()) { node.textContent = fmt(target); return; }
    const dur = 1400, start = performance.now();
    function frame(now) {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      node.textContent = fmt(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function observe(root) {
    const reveals = root.querySelectorAll(".reveal");
    const counters = root.querySelectorAll("[data-count]");
    if (!("IntersectionObserver" in window) || reduceMotion()) {
      reveals.forEach((n) => n.classList.add("is-in"));
      counters.forEach((n) => { n.textContent = fmt(n.dataset.count); n.dataset.counted = "1"; });
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        e.target.querySelectorAll("[data-count]").forEach(runCounter);
        if (e.target.matches("[data-count]")) runCounter(e.target);
        io.unobserve(e.target);
      });
    }, { threshold: 0.15 });
    reveals.forEach((n) => io.observe(n));
    root.__io = io;
  }
  function runCounter(n) {
    if (n.dataset.counted) return;
    n.dataset.counted = "1";
    animateCount(n, Number(n.dataset.count));
  }

  /* ───────── sections ───────── */

  function heroSection({ showKey }) {
    return el(`
      <section class="lp-hero" aria-labelledby="lp-title">
        <div class="lp-hero__glow" aria-hidden="true"></div>
        <div class="lp-hero__copy">
          <p class="lp-pill"><span class="lp-pill__dot" id="lp-health-dot" aria-hidden="true"></span><span id="lp-health-text">Malawi's open nutrition intelligence platform</span></p>
          <h1 id="lp-title" class="lp-title">The intelligence behind better nutrition and <em>healthier lives.</em></h1>
          <p class="lp-lead">Chakudya brings together food composition data, nutrition computation, growth and anthropometric assessment, disease-specific nutrition information, and clinical decision-support resources in one connected platform. Built for Malawi, designed for wider impact, and open to developers, students, researchers, health professionals, and innovators building the future of nutrition and health.</p>
          <div class="lp-cta">
            <a class="btn btn--primary btn--lg" href="#lp-try" data-scroll="lp-try">Explore nutrition data</a>
            <a class="btn btn--lg" href="#lp-about" data-scroll="lp-about">Explore the platform</a>
            ${showKey ? `<a class="lp-link lp-cta__link" href="#/account">Get an API key <span aria-hidden="true">\u2192</span></a>` : ""}
          </div>
          <p class="lp-trust__label">Platform highlights</p>
          <ul class="lp-trust" aria-label="Platform highlights">
            <li>Malawian food composition data</li>
            <li>Nutrition computation and assessment</li>
            <li>Clinical and disease-specific nutrition intelligence</li>
            <li>Open infrastructure for health innovation</li>
          </ul>
        </div>
        <div class="lp-hero__media">
          <figure class="lp-photo lp-photo--hero">
            ${heroImg()}
            <span class="lp-photo__ph" aria-hidden="true">${icon("plate", 64)}</span>
          </figure>
        </div>
      </section>
    `);
  }

  function statsSection() {
    return el(`
      <section class="lp-section lp-stats reveal" aria-labelledby="lp-stats-h">
        <div class="lp-head">
          <p class="lp-kicker">At a glance</p>
          <h2 id="lp-stats-h">Chakudya in numbers</h2>
          <p class="lp-sub">Live record counts from the Chakudya registry, loaded when this page opens.</p>
        </div>
        <div class="lp-stat-grid" id="lp-stat-grid">
          <div class="lp-stat lp-stat--loading" id="lp-stat-loading"><div class="lp-stat__num" aria-hidden="true">…</div><div class="lp-stat__label">Loading live counts</div><div class="lp-stat__note">Fetching from the API</div></div>
        </div>
      </section>
    `);
  }

  async function hydrateStats(root) {
    const grid = root.querySelector("#lp-stat-grid");
    if (!grid) return;
    const rows = await fetchCounts();
    if (!grid.isConnected) return; // navigated away
    grid.querySelector("#lp-stat-loading")?.remove();
    rows.forEach((r) => {
      const card = el(`
        <div class="lp-stat lp-stat--live">
          <div class="lp-stat__num" data-count="${r.count}">0</div>
          <div class="lp-stat__label">${esc(r.label)}</div>
          <div class="lp-stat__note">${esc(r.note)}</div>
        </div>`);
      grid.appendChild(card);
    });
    if (!rows.length) {
      grid.appendChild(el(`<p class="lp-stat__offline">${navigator.onLine === false ? "You're offline, so live record counts aren't shown." : "Live record counts are unavailable right now."} The documentation below still works.</p>`));
    }
    // Counters added after the observer ran: start the ones already on screen.
    if (reduceMotion() || !("IntersectionObserver" in window)) {
      grid.querySelectorAll("[data-count]").forEach(runCounter);
    } else {
      const io = new IntersectionObserver((es) => es.forEach((e) => {
        if (e.isIntersecting) { runCounter(e.target); io.unobserve(e.target); }
      }), { threshold: 0.4 });
      grid.querySelectorAll("[data-count]").forEach((n) => io.observe(n));
    }
  }

  function aboutSection() {
    const pillars = [
      ["leaf", "Food composition & dietary data", "Explore nutritional composition of Malawian foods, packaged products, glycaemic index data, food exchange lists and other dietary references, with international data sources supporting broader coverage.", epLink("GET", "/foods")],
      ["child", "Growth & anthropometric intelligence", "Support the interpretation of height, weight, BMI, MUAC and other anthropometric measurements using relevant growth references, age-specific indicators and assessment methods across different stages of life.", epLink("GET", "/growth/assess")],
      ["calc", "Nutritional computation", "Access computational methods for estimating energy and protein requirements, analysing meals and recipes, comparing intake with dietary reference values, and supporting evidence-informed nutrition assessment.", epLink("POST", "/meals/analyze")],
      ["steth", "Clinical & disease-specific nutrition", "Explore structured nutrition information for conditions requiring tailored dietary management, including renal disease, diabetes and other clinical nutrition applications.", epLink("GET", "/exchange")],
      ["spark", "Nutrition intelligence & AI infrastructure", "Build applications that connect nutrition data, computational tools and structured knowledge. Chakudya provides a foundation for AI-assisted nutrition experiences, research tools and digital health solutions.", epLink("POST", "/rag/ask")],
      ["network", "Open API & shared infrastructure", "Integrate nutrition data and capabilities into websites, applications, research workflows and digital health systems through a shared API, reducing the need to independently rebuild common nutrition datasets and computational logic.", "#/docs/getting-started"],
    ];
    const flow = ["Food data", "Assessment", "Computation", "Clinical knowledge", "AI infrastructure", "Open API"];
    return el(`
      <section class="lp-section reveal" id="lp-about" aria-labelledby="lp-about-h">
        <div class="lp-head">
          <p class="lp-kicker">What is Chakudya?</p>
          <h2 id="lp-about-h">A connected foundation for nutrition science and health intelligence.</h2>
          <p class="lp-sub">Chakudya means \u201Cfood\u201D in Chichewa. The Chakudya Nutrition Registry is an open nutrition intelligence platform that connects food composition data, nutritional computation, anthropometric assessment, clinical knowledge and computational tools through a shared infrastructure.</p>
          <p class="lp-sub">From understanding the nutritional value of local foods to assessing growth, estimating nutritional requirements and exploring disease-specific nutrition information, Chakudya brings essential data and practical capabilities together to support research, clinical practice, education and health innovation.</p>
        </div>
        <ul class="lp-flow" aria-label="How the platform connects">
          ${flow.map((t) => `<li>${t}</li>`).join("")}
        </ul>
        <ol class="lp-pillars">
          ${pillars.map(([ic, t, d, href], i) => `
            <li>
              <a class="lp-card lp-pillar" href="${href}">
                <span class="lp-pillar__top"><span class="lp-card__icon">${icon(ic, 22)}</span><span class="lp-pillar__n" aria-hidden="true">0${i + 1}</span></span>
                <h3>${t}</h3>
                <p>${d}</p>
              </a>
            </li>`).join("")}
        </ol>
      </section>
    `);
  }

  function trySection() {
    const picks = ["nsima", "beans", "tomato", "rice", "potatoes"];
    const sec = el(`
      <section class="lp-section lp-try reveal" id="lp-try" aria-labelledby="lp-try-h">
        <div class="lp-try__panel">
          <div class="lp-try__copy">
            <p class="lp-kicker">Try it</p>
            <h2 id="lp-try-h">Look up a food, right now</h2>
            <p class="lp-sub">Type a food name to see its nutrients, straight from the Chakudya registry. Results are live, not a mock-up.</p>
          </div>
          <form class="lp-search" role="search" aria-label="Food lookup">
            <label class="sr-only" for="lp-food-q">Food name</label>
            <input id="lp-food-q" type="search" placeholder="e.g. nsima, beans, tomato" autocomplete="off" value="nsima" />
            <button class="btn btn--primary" type="submit">Look up</button>
          </form>
          <div class="lp-chips" role="group" aria-label="Quick picks">
            ${picks.map((p) => `<button type="button" class="lp-chip" data-q="${p}">${p}</button>`).join("")}
          </div>
          <div class="lp-result" id="lp-result" aria-live="polite"></div>
        </div>
      </section>
    `);
    const form = sec.querySelector("form");
    const input = sec.querySelector("#lp-food-q");
    const out = sec.querySelector("#lp-result");

    async function run(q) {
      q = q.trim();
      if (!q) return;
      out.innerHTML = `<p class="lp-result__msg"><span class="spinner spinner--sm" aria-hidden="true"></span> Looking up “${esc(q)}”…</p>`;
      const url = ApiClient.buildUrl(AppState.state.baseUrl, "/foods/lookup", {}, { q });
      const r = await ApiClient.execute({ url, method: "GET", headers: {} });
      if (!out.isConnected) return;
      if (!r.ok || r.status >= 500) {
        out.innerHTML = `<p class="lp-result__msg lp-result__msg--err">${navigator.onLine === false ? "You're offline. Food lookups need an internet connection." : "Couldn't reach the API just now. Please try again in a moment."}</p>`;
        return;
      }
      const d = r.bodyJson?.data;
      const row = Array.isArray(d) ? d[0] : d;
      if (!row || (!row.food_name && !row.name)) {
        out.innerHTML = `<p class="lp-result__msg">No match for “${esc(q)}”. Try another food name.</p>`;
        return;
      }
      const nutrients = [
        ["Energy", row.kcal, "kcal"], ["Protein", row.protein_g, "g"], ["Carbs", row.carbs_g, "g"],
        ["Fat", row.fat_g, "g"], ["Iron", row.iron_mg, "mg"], ["Calcium", row.calcium_mg, "mg"],
      ].filter(([, v]) => v !== null && v !== undefined && v !== "");
      out.innerHTML = `
        <div class="lp-food">
          <div class="lp-food__top">
            <h3>${esc(row.food_name || row.name)}</h3>
            ${row.category ? `<span class="lp-tag">${esc(row.category)}</span>` : ""}
          </div>
          ${row.measure ? `<p class="lp-food__measure">Per ${esc(row.measure)}</p>` : ""}
          <dl class="lp-nutrients">
            ${nutrients.map(([k, v, u]) => `<div><dt>${k}</dt><dd>${esc(v)}<small>${u}</small></dd></div>`).join("")}
          </dl>
          <p class="lp-food__src">Source: ${esc(r.bodyJson?.source || "Chakudya API")} · <a href="${epLink("GET", "/foods/lookup")}">See the endpoint docs</a></p>
        </div>`;
    }

    form.addEventListener("submit", (e) => { e.preventDefault(); run(input.value); });
    sec.querySelectorAll(".lp-chip").forEach((b) => b.addEventListener("click", () => { input.value = b.dataset.q; run(b.dataset.q); }));
    // Auto-run once the section is first seen, so the page feels alive.
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { run(input.value); io.disconnect(); } }, { threshold: 0.3 });
      io.observe(sec);
    }
    return sec;
  }

  function nutriMindSection() {
    return el(`
      <section class="lp-section lp-nutrimind reveal" id="lp-nutrimind" aria-labelledby="lp-nm-h">
        <div class="lp-try__panel lp-nm__panel">
          <img class="lp-nm__logo" src="assets/images/nutrimind-logo-420.webp" width="112" height="112" alt="Chakudya NutriMind logo" loading="lazy" />
          <div class="lp-try__copy">
            <p class="lp-kicker">Nutrition assistant</p>
            <h2 id="lp-nm-h">Ask Chakudya NutriMind</h2>
            <p class="lp-sub">Ask questions about Malawian foods, nutrients and nutrition guidance and get answers with sources, powered by the Chakudya Nutrition Registry.</p>
          </div>
          <div class="lp-cta">
            <a class="btn btn--primary btn--lg" href="#/nutrimind">Start chatting</a>
          </div>
        </div>
      </section>
    `);
  }

  function coachSection() {
    const wa = "https://wa.me/265886295324?text=" + encodeURIComponent("Hi Thanzi Coach");
    return el(`
      <section class="lp-section lp-coach reveal" id="lp-coach" aria-labelledby="lp-coach-h">
        <div class="lp-try__panel lp-coach__panel">
          <div class="lp-try__copy">
            <p class="lp-kicker">On WhatsApp</p>
            <h2 id="lp-coach-h">Meet Thanzi Coach</h2>
            <p class="lp-sub">Personalized nutrition and wellness coaching for Malawians, powered by the Chakudya Nutrition Registry (CNR).</p>
          </div>
          <div class="lp-cta">
            <a class="btn btn--primary btn--lg" href="${wa}" target="_blank" rel="noopener">Chat on WhatsApp</a>
          </div>
          <p class="lp-coach__note">Thanzi Coach gives general nutrition guidance. It does not replace advice from a qualified health professional.</p>
        </div>
      </section>
    `);
  }

  function audienceSection() {
    const a = [
      ["Everyone", "heart", "Look up what's in everyday Malawian meals, from nsima to relish, in familiar portions.", "#lp-try", "Try a lookup"],
      ["Students", "book", "Learn with real composition data, glycaemic index, exchange lists and growth references instead of textbook tables.", "#/docs/api-reference", "Browse the data"],
      ["Health professionals", "steth", "Support nutrition care with growth assessment and renal, tube-feeding and drug-interaction information.", epLink("GET", "/growth/assess"), "See growth assessment"],
      ["Researchers", "flask", "Find consistent, citable food and growth reference data with documented sources.", "openapi.json", "Download the data spec"],
      ["Food businesses", "store", "Standardised nutrition labels, barcode lookup and recipe nutrition totals for products and menus.", epLink("GET", "/foods/{id}/label"), "See label data"],
      ["Developers", "code", "Build apps on the same data with an open API, interactive docs and free keys.", "#lp-dev", "For developers"],
    ];
    return el(`
      <section class="lp-section reveal" id="lp-audience" aria-labelledby="lp-aud-h">
        <div class="lp-head">
          <p class="lp-kicker">Who it's for</p>
          <h2 id="lp-aud-h">Made for everyone who cares about nutrition</h2>
        </div>
        <div class="lp-aud-grid">
          ${a.map(([t, ic, d, href, cta]) => `
            <article class="lp-aud">
              <span class="lp-card__icon">${icon(ic, 22)}</span>
              <h3>${t}</h3>
              <p>${d}</p>
              <a class="lp-link" ${href.endsWith(".json") ? `href="${href}" download` : `href="${href}"`}>${cta} <span aria-hidden="true">→</span></a>
            </article>`).join("")}
        </div>
      </section>
    `);
  }

  function usesSection() {
    const tiles = [
      ["food-staples.webp", "Nsima served with a tomato stew and greens", "Nutrition & dietetics apps"],
      ["food-legumes-protein.webp", "Bowls of beans, lentils and whole grains", "Meal planning systems"],
      ["food-fruit-veg.webp", "Fresh fruit and vegetables", "Health & fitness apps"],
      ["food-fish.webp", "Fresh whole fish and fish steaks on ice", "Food & barcode scanners"],
    ];
    const uses = ["Clinical decision support tools", "Nutrition research tools", "AI-powered nutrition assistants", "Educational applications"];
    return el(`
      <section class="lp-section reveal" id="lp-uses" aria-labelledby="lp-uses-h">
        <div class="lp-head">
          <p class="lp-kicker">Real-world uses</p>
          <h2 id="lp-uses-h">What Chakudya can power</h2>
        </div>
        <div class="lp-gallery">
          ${tiles.map(([file, alt, cap], i) => `
            <figure class="lp-tile lp-tile--${i + 1}">
              ${img(file, alt, 480, 600)}
              <figcaption>${cap}</figcaption>
            </figure>`).join("")}
        </div>
        <div class="lp-uses-more tag-list">${uses.map((u) => `<span>${u}</span>`).join("")}</div>
      </section>
    `);
  }

  function missionSection() {
    return el(`
      <section class="lp-section lp-mission reveal" id="lp-mission" aria-labelledby="lp-mission-h">
        <div class="lp-head">
          <p class="lp-kicker">About Chakudya</p>
          <h2 id="lp-mission-h">Open nutrition infrastructure for Malawi</h2>
          <p class="lp-sub">Chakudya Nutrition Registry is an open nutrition data and intelligence infrastructure built for Malawi. It brings together food composition data, nutrition reference systems, computational methods and disease-specific nutrition knowledge within a shared, interoperable platform.</p>
          <p class="lp-sub">From nutrient analysis and nutrition assessment to therapeutic dietary planning and clinical nutrition workflows, Chakudya provides structured data, reusable tools and API services for health professionals, researchers, students, developers and AI-enabled applications. Its goal is to make nutrition knowledge more accessible, computation more reusable and health technology development more grounded in reliable, locally relevant nutrition data.</p>
        </div>
      </section>
    `);
  }

  function devSection() {
    const base = AppState.state.baseUrl || "";
    const { endpoints, groups, spec } = AppState.state;
    const tech = [
      `${endpoints.length} documented endpoints`, `${groups.length} resource groups`, `API v${spec.info?.version || "?"}`,
      "OpenAPI spec", "Open CORS", "Self-service API keys", "OAuth 2.0 client credentials", "Batched requests",
      "FHIR R4 care workflows", "AI-ready knowledge (retrieval-augmented answers)",
    ];
    const curl = `curl "${base}/foods/lookup?q=nsima"`;
    const sec = el(`
      <section class="lp-section lp-dev reveal" id="lp-dev" aria-labelledby="lp-dev-h">
        <div class="lp-dev__copy">
          <p class="lp-kicker">For developers</p>
          <h2 id="lp-dev-h">Your first call takes one line</h2>
          <p class="lp-sub">Everything on this site is served by one open API. Public routes need no key, and CORS is open, so you can call it from a browser, a script or a terminal. Add a key later for higher limits and FHIR access.</p>
          <p class="lp-dev__tech-label">Under the hood</p>
          <div class="tag-list lp-dev__tech">${tech.map((t) => `<span>${esc(t)}</span>`).join("")}</div>
          <div class="lp-cta">
            <a class="btn btn--primary" href="#/docs/getting-started">Read the docs</a>
            <a class="btn" href="openapi.yaml" download>Download openapi.yaml</a>
          </div>
        </div>
        <div class="lp-code">
          <div class="lp-code__bar"><span>Terminal</span><button type="button" class="btn btn--sm" id="lp-copy">Copy</button></div>
          <pre><code></code></pre>
        </div>
      </section>
    `);
    sec.querySelector("code").textContent = curl;
    CopyModule.bind(sec.querySelector("#lp-copy"), curl);
    return sec;
  }

  function closingSection({ showKey }) {
    return el(`
      <section class="lp-closing reveal" aria-labelledby="lp-close-h">
        <h2 id="lp-close-h">Better food data. Healthier Malawi.</h2>
        <div class="lp-cta lp-cta--center">
          <a class="btn btn--primary btn--lg" href="#lp-try" data-scroll="lp-try">Try a food lookup</a>
          <a class="btn btn--lg" href="#/docs/getting-started">Developer docs</a>
          ${showKey ? `<a class="btn btn--lg btn--ghost" href="#/account">Get an API key</a>` : ""}
        </div>
      </section>
    `);
  }

  function footer() {
    return el(`
      <footer class="lp-footer">
        <div class="lp-footer__grid">
          <div class="lp-footer__brand">
            <img class="lp-footer__logo" src="assets/images/chakudya-logo-192.webp" alt="Chakudya Nutrition Registry logo" width="72" height="72" loading="lazy" onerror="this.remove()" />
            <p class="lp-footer__name">Chakudya Nutrition Registry</p>
            <p class="lp-footer__tag">Better food data. Healthier Malawi.</p>
          </div>
          <nav aria-label="Resources">
            <h3 class="lp-footer__h">Resources</h3>
            <a href="#/nutrimind">NutriMind assistant</a>
            <a href="#lp-mission" data-scroll="lp-mission">About Chakudya</a>
            <a href="#/docs/getting-started">Documentation</a>
            <a href="#/docs/api-reference">API Reference</a>
            <a href="openapi.json" download>OpenAPI spec</a>
            <a href="https://github.com/edisontaimu9-ui/chakudya-api" target="_blank" rel="noopener">GitHub</a>
          </nav>
          <nav aria-label="Connect">
            <h3 class="lp-footer__h">Connect</h3>
            <a href="mailto:edisontaimu9@gmail.com">Email</a>
            <a href="https://www.linkedin.com/in/edison-taimu-a37415367" target="_blank" rel="noopener">LinkedIn</a>
            <a href="https://x.com/edisontaimu" target="_blank" rel="noopener">X (Twitter)</a>
            <a href="https://www.facebook.com/share/1GixAae4hT/" target="_blank" rel="noopener">Facebook</a>
            <a href="https://minutriq.me" target="_blank" rel="noopener">Portfolio</a>
            <a href="https://wa.me/265886295324" target="_blank" rel="noopener">WhatsApp: Thanzi Coach</a>
          </nav>
          <nav aria-label="Legal">
            <h3 class="lp-footer__h">Legal</h3>
            <a href="#/legal/privacy">Privacy Policy</a>
            <a href="#/legal/terms">Terms of Use</a>
            <a href="#/legal/data-sources">Data Sources &amp; Attribution</a>
            <a href="#/legal/disclaimer">Clinical Disclaimer</a>
          </nav>
        </div>
        <p class="lp-footer__note">Growth and clinical tools are for screening and decision support only. They do not replace professional judgment or establish a diagnosis. Always consult a qualified health professional.</p>
        <p class="lp-footer__copy">© 2026 Chakudya Nutrition Registry. All rights reserved.</p>
      </footer>
    `);
  }

  /* ───────── icons (inline, currentColor) ───────── */
  function icon(name, size = 20) {
    const p = {
      plate: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/>',
      leaf: '<path d="M5 19c0-8 4-13 14-14 0 10-5 14-13 14"/><path d="M5 19c2-5 5-8 9-10"/>',
      child: '<circle cx="12" cy="6" r="3"/><path d="M6 21v-5a6 6 0 0 1 12 0v5"/>',
      map: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/>',
      steth: '<path d="M6 3v6a4 4 0 0 0 8 0V3"/><path d="M10 13v2a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="11" r="2"/>',
      code: '<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 5l-4 14"/>',
      scan: '<path d="M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3M7 12h10"/>',
      utensils: '<path d="M6 3v8M9 3v8M6 7h3M7.5 11v10M17 3c-2 2-2.5 5-2 8h2v10"/>',
      pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
      fhir: '<path d="M12 3 4 7v6c0 4 3.4 7 8 8 4.6-1 8-4 8-8V7l-8-4Z"/><path d="m9 12 2 2 4-4"/>',
      calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
      spark: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>',
      network: '<circle cx="6" cy="12" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="m8 11 8-4M8 13l8 4"/>',
      spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
      key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3"/>',
      heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.6-7 10-7 10Z"/>',
      book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z"/><path d="M4 19a2 2 0 0 1 2-2h13"/>',
      flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/>',
      store: '<path d="M4 9 5.5 4h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6"/>',
    }[name] || "";
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  }

  /* ───────── render ───────── */

  function render(container) {
    container.innerHTML = "";
    const showKey = typeof DevAuth !== "undefined" && DevAuth.configured();
    const root = el(`<div class="lp"></div>`);

    root.append(
      heroSection({ showKey }),
      statsSection(),
      aboutSection(),
      trySection(),
      nutriMindSection(),
      coachSection(),
      audienceSection(),
      usesSection(),
      missionSection(),
      devSection(),
      closingSection({ showKey }),
      footer()
    );
    container.appendChild(root);

    // In-page anchor (#lp-try) must not clobber the hash router.
    root.querySelectorAll("[data-scroll]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById(a.dataset.scroll)?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
    }));
    root.querySelectorAll('a[href^="#lp-"]').forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById(a.getAttribute("href").slice(1))?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
    }));

    observe(root);
    const statsEl = root.querySelector("#lp-stat-grid");
    if (statsEl && "IntersectionObserver" in window) {
      const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { io.disconnect(); hydrateStats(root); } }, { rootMargin: "400px" });
      io.observe(statsEl);
    } else {
      hydrateStats(root);
    }
    checkHealth().then((ok) => {
      const dot = root.querySelector("#lp-health-dot"), txt = root.querySelector("#lp-health-text");
      if (!dot || !dot.isConnected || !ok) return;
      dot.classList.add("is-ok");
      txt.textContent = "API online · Malawi's open nutrition intelligence platform";
    });
  }

  return { render };
})();
