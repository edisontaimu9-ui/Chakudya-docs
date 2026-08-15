const RenderOverview = (() => {
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function groupSlugFirst(group) {
    return group.endpoints[0]?.slug || "";
  }

  function render(container) {
    const { spec, groups, endpoints } = AppState.state;
    container.innerHTML = "";

    const adminCount = endpoints.filter((e) => e.authMode !== "public").length;

    const hero = el(`
      <section class="hero">
        <p class="eyebrow">CNR — Central Nutrition Repository</p>
        <h1 class="hero__title">Chakudya Nutrition Registry API</h1>
        <p class="hero__lead"></p>
        <div class="hero__actions">
          <a class="btn btn--primary" href="#" data-jump="first">Browse endpoints</a>
          <a class="btn" href="openapi.yaml" download>Download openapi.yaml</a>
          <a class="btn" href="openapi.json" download>Download openapi.json</a>
        </div>
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-card__num">${endpoints.length}</div><div class="stat-card__label">Endpoints</div></div>
          <div class="stat-card"><div class="stat-card__num">${groups.length}</div><div class="stat-card__label">Resource groups</div></div>
          <div class="stat-card"><div class="stat-card__num">${endpoints.length - adminCount}</div><div class="stat-card__label">Public routes</div></div>
          <div class="stat-card"><div class="stat-card__num">${adminCount}</div><div class="stat-card__label">Admin-gated routes</div></div>
        </div>
      </section>
    `);
    hero.querySelector(".hero__lead").textContent = spec.info?.description
      ? spec.info.description.replace(/\s+/g, " ").trim()
      : "Malawi-focused food and nutrition data API.";
    container.appendChild(hero);

    const firstEp = endpoints[0];
    hero.querySelector('[data-jump="first"]').href = firstEp ? `#/${firstEp.slug}` : "#";

    // Group cards
    const groupsSection = el(`<div class="section"><h2 class="section__title">Explore by resource</h2><div class="group-grid"></div></div>`);
    const grid = groupsSection.querySelector(".group-grid");
    groups.forEach((g) => {
      const card = el(`
        <a class="group-card" href="#/${groupSlugFirst(g)}">
          <div class="group-card__title">${RenderEndpoint.escapeHtml(g.tag)}</div>
          <div class="group-card__desc">${g.endpoints.length} endpoint${g.endpoints.length === 1 ? "" : "s"}</div>
        </a>
      `);
      grid.appendChild(card);
    });
    container.appendChild(groupsSection);

    container.appendChild(el(`<hr class="divider" />`));

    // Auth model
    container.appendChild(el(`
      <div class="section">
        <h2 class="section__title">Authentication</h2>
        <p class="endpoint-desc">Send <code>Authorization: Bearer &lt;key&gt;</code> on admin-gated routes. The key can be either the
        root <code>ADMIN_API_KEY</code> or a per-consumer key minted via <code>POST /admin/keys</code> (root key only). Per-consumer
        keys carry a role — <code>admin</code> (full access) or <code>reviewer</code> (packaged review queue + reads only). Public
        <code>GET</code> routes and a handful of specific write routes (community submissions, RAG retrieve/ask, memory write/recall)
        need no key at all, but are rate-limited by IP.</p>
      </div>
    `));

    // Response format
    container.appendChild(el(`
      <div class="section">
        <h2 class="section__title">Response format</h2>
        <div class="field-grid" style="grid-template-columns: 1fr 1fr; gap:14px;"></div>
      </div>
    `)).querySelector(".field-grid").append(
      RenderEndpoint.codeBlock("List success", { status: "success", count: 123, limit: 50, offset: 0, data: [] }),
      RenderEndpoint.codeBlock("Error", { status: "error", message: "Description of what went wrong" })
    );

    // Pagination
    container.appendChild(el(`
      <div class="section">
        <h2 class="section__title">Pagination</h2>
        <p class="endpoint-desc">List routes support two modes, chosen by whether <code>?cursor=</code> is present. <strong>Offset/limit</strong>
        (default) — <code>?limit=50&amp;offset=100</code>. <strong>Cursor</strong> (keyset) — add <code>?cursor=</code> (empty for the first page);
        each response includes <code>next_cursor</code> to pass as the next request's <code>cursor</code>. Cursor pages are always ordered
        by <code>id.asc</code>, even where the offset mode's default order differs.</p>
      </div>
    `));

    // CORS
    container.appendChild(el(`
      <div class="section">
        <h2 class="section__title">CORS</h2>
        <p class="endpoint-desc">The Worker sends permissive CORS headers on every response, so this page (or any origin) can call it directly —
        no proxy needed for Try It below.</p>
      </div>
    `)).lastElementChild;
    container.lastElementChild.appendChild(
      RenderEndpoint.codeBlock(
        "Response headers",
        "Access-Control-Allow-Origin: *\nAccess-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS\nAccess-Control-Allow-Headers: Content-Type, Authorization, apikey\nAccess-Control-Max-Age: 86400\nAccess-Control-Expose-Headers: X-Cache",
        { lang: "text" }
      )
    );

    container.appendChild(el(`
      <div class="callout">
        <strong>Note on Try It —</strong> only response headers the Worker explicitly exposes (like <code>X-Cache</code>) or that
        browsers always allow (like <code>Content-Type</code>) are readable from JavaScript. Headers such as <code>X-Request-Id</code>
        or <code>Retry-After</code> are sent but not exposed for cross-origin reads, so they won't appear in the Try It response
        panel even though they're on the real response — check your network tab or a terminal <code>curl</code> if you need them.
      </div>
    `));
  }

  return { render };
})();
