(async function main() {
  ThemeModule.init();

  const BASE_URL_KEY = "chakudya-docs:base-url";
  const content = document.getElementById("content");

  try {
    await SpecLoader.load();
  } catch (e) {
    const offline = navigator.onLine === false;
    content.innerHTML = `
      <div class="empty-state">
        <h3>${offline ? "You're offline" : "Couldn't load the API spec"}</h3>
        <p>${offline ? "The docs haven't been saved on this device yet. Connect once and they'll be available offline next time." : RenderEndpoint.escapeHtml(e.message)}</p>
        <p><button class="btn btn--sm" id="spec-retry" type="button">Try again</button></p>
        <p class="field__hint">If you opened this file directly, serve it over HTTP (not <code>file://</code>) so <code>fetch("openapi.json")</code> is allowed.</p>
      </div>`;
    document.getElementById("spec-retry").addEventListener("click", () => location.reload());
    return;
  }

  const { spec, endpoints } = AppState.state;

  // ── Header: brand / version / GitHub ──────────────────────
  document.getElementById("version-chip").textContent = `v${spec.info?.version || "?"}`;

  const repoUrl = "https://github.com/edisontaimu9-ui/chakudya-api";
  const githubLink = document.getElementById("github-link");
  githubLink.href = repoUrl;
  githubLink.hidden = false;

  // ── Base URL ───────────────────────────────────────────────
  // Resolve any {variable} placeholders in the OpenAPI server URL using
  // that variable's declared default, so a templated servers[] entry
  // (e.g. "https://{worker-subdomain}.workers.dev") never gets used
  // verbatim as a literal, unfetchable hostname.
  function resolveServerUrl(server) {
    if (!server?.url) return "";
    let url = server.url;
    const vars = server.variables || {};
    for (const [key, def] of Object.entries(vars)) {
      if (def?.default !== undefined) {
        url = url.split(`{${key}}`).join(def.default);
      }
    }
    return url;
  }
  const productionUrl = resolveServerUrl(spec.servers?.[0]) || "";

  // The docs always call production - no picker, no URL shown to visitors,
  // nothing persisted. Clear anything left over from before this was locked
  // down so an old saved override can't quietly reappear.
  try { localStorage.removeItem(BASE_URL_KEY); } catch (_) { /* ignore */ }
  AppState.set({ baseUrl: productionUrl });

  // ── Developer login ────────────────────────────────────────
  // Capture a session Supabase put in the URL hash (email confirmation, password
  // reset, Google) BEFORE the router runs, then show the account page.
  const accountLink = document.getElementById("account-link");
  function updateAccountLink() {
    accountLink.hidden = !DevAuth.configured();
    accountLink.textContent = DevAuth.isSignedIn() ? "My API keys" : "Get API key";
  }
  updateAccountLink();
  DevAuth.onChange(updateAccountLink);
  function applyRedirect(r) {
    if (r?.error) RenderAccount.setFlash("err", r.error);
    else if (r?.signedIn) RenderAccount.setFlash("ok", r.type === "recovery" ? "Choose a new password below." : "You're signed in.");
  }
  applyRedirect(await DevAuth.handleRedirect());

  // ── Sidebar / search / mobile toggle ─────────────────────────
  Sidebar.render();
  SearchModule.init();

  const sidebar = document.getElementById("sidebar");
  const scrim = document.getElementById("sidebar-scrim");
  const toggleBtn = document.getElementById("sidebar-toggle");
  function closeSidebar() {
    sidebar.classList.remove("is-open");
    scrim.classList.remove("is-open");
    toggleBtn.setAttribute("aria-expanded", "false");
  }
  function openSidebar() {
    sidebar.classList.add("is-open");
    scrim.classList.add("is-open");
    toggleBtn.setAttribute("aria-expanded", "true");
  }
  toggleBtn.addEventListener("click", () => {
    sidebar.classList.contains("is-open") ? closeSidebar() : openSidebar();
  });
  scrim.addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sidebar.classList.contains("is-open")) { closeSidebar(); toggleBtn.focus(); }
  });

  // ── Keep --header-h equal to the real header height (it changes on mobile, where the nav wraps to a second row)
  const headerEl = document.getElementById("app-header");
  function syncHeaderHeight() {
    document.documentElement.style.setProperty("--header-h", headerEl.offsetHeight + "px");
  }
  syncHeaderHeight();
  if ("ResizeObserver" in window) new ResizeObserver(syncHeaderHeight).observe(headerEl);
  window.addEventListener("resize", syncHeaderHeight);

  // ── Router ─────────────────────────────────────────────────
  function route() {
    const hash = location.hash.replace(/^#\/?/, "");
    Seo.reset();
    // The landing page is full-width with no sidebar; docs and reference pages keep it.
    const isLanding = !hash;
    const isGuide = hash === "docs" || hash.startsWith("docs/");
    const isLegal = hash.startsWith("legal/");
    const isNutri = hash === "nutrimind";
    document.body.classList.toggle("is-landing", isLanding);
    document.body.classList.toggle("is-nutrimind", isNutri);
    const guideId = hash.split("/")[1] || "getting-started";
    const activeNav = isLanding ? "nav-home"
      : isNutri ? "nav-nutrimind"
      : isGuide && guideId !== "api-reference" ? "nav-docs"
      : hash === "account" || hash === "submit" || isLegal ? ""
      : "nav-reference";
    const submitLink = document.getElementById("submit-link");
    if (submitLink) { if (hash === "submit") submitLink.setAttribute("aria-current", "page"); else submitLink.removeAttribute("aria-current"); }
    ["nav-home", "nav-nutrimind", "nav-docs", "nav-reference"].forEach((id) => {
      const a = document.getElementById(id);
      if (!a) return;
      if (id === activeNav) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });

    if (isLanding) {
      RenderLanding.render(content);
      Sidebar.setActive(null);
      AppState.set({ activeId: null });
      document.getElementById("main").focus({ preventScroll: true });
      window.scrollTo(0, 0);
      closeSidebar();
      return;
    }
    if (isNutri) {
      RenderNutriMind.render(content);
      Seo.set("Chakudya NutriMind - Nutrition assistant", "Ask Chakudya NutriMind about Malawian foods, nutrients and nutrition guidance. Answers come with sources from the Chakudya Nutrition Registry.");
      Sidebar.setActive(null);
      AppState.set({ activeId: null });
      document.getElementById("main").focus({ preventScroll: true });
      window.scrollTo(0, 0);
      closeSidebar();
      return;
    }
    if (hash === "submit") {
      RenderSubmit.render(content);
      Seo.set("Submit a packaged food", "Add a missing packaged food to the Chakudya Nutrition Registry by photographing its label or typing in the details. Every submission is reviewed before it is published.");
      Sidebar.setActive(null);
      AppState.set({ activeId: null });
      document.getElementById("main").focus({ preventScroll: true });
      window.scrollTo(0, 0);
      closeSidebar();
      return;
    }
    if (isLegal) {
      const legalId = hash.split("/")[1];
      if (!RenderLegal.has(legalId) || hash.split("/").length > 2) {
        content.innerHTML = `
          <div class="empty-state">
            <h3>Page not found</h3>
            <p>There is no legal page at <span class="mono">${RenderEndpoint.escapeHtml(hash)}</span>.</p>
            <a class="btn" href="#/legal/privacy">Go to Privacy Policy</a>
          </div>`;
      } else {
        RenderLegal.render(legalId, content);
      }
      Sidebar.setActive(null);
      AppState.set({ activeId: null });
      document.getElementById("main").focus({ preventScroll: true });
      window.scrollTo(0, 0);
      closeSidebar();
      return;
    }
    if (hash === "reference") {
      // Old overview route: its content now lives in the docs guides.
      location.replace("#/docs/getting-started");
      return;
    }
    if (isGuide) {
      if (hash === "docs") { location.replace("#/docs/getting-started"); return; }
      // "#/docs/<guide>" or, for the guides split into smaller pages, "#/docs/<guide>/<page>".
      const parts = hash.split("/");
      const subId = parts[2];
      if (!RenderDocs.has(guideId, subId) || parts.length > 3) {
        const back = subId && RenderDocs.has(guideId)
          ? `<a class="btn" href="#/docs/${RenderEndpoint.escapeHtml(guideId)}">Back to ${RenderEndpoint.escapeHtml(RenderDocs.meta(guideId).title)}</a>`
          : `<a class="btn" href="#/docs/getting-started">Go to Getting Started</a>`;
        content.innerHTML = `
          <div class="empty-state">
            <h3>Page not found</h3>
            <p>There is no documentation page at <span class="mono">${RenderEndpoint.escapeHtml(hash)}</span>.</p>
            ${back}
          </div>`;
        Sidebar.setActive(null);
        AppState.set({ activeId: null });
        closeSidebar();
        return;
      }
      RenderDocs.render(guideId, content, subId);
      const gs = RenderDocs.meta(guideId, subId);
      Seo.set(`${gs.title} - API Documentation`, gs.blurb);
      Sidebar.setActive(`guide:${guideId}`);
      AppState.set({ activeId: null });
      document.getElementById("main").focus({ preventScroll: true });
      window.scrollTo(0, 0);
      closeSidebar();
      return;
    }
    if (hash === "account") {
      RenderAccount.show(content);
      Seo.set("Developer account and API keys", "Sign in to create and manage Chakudya API keys for higher rate limits.");
      Sidebar.setActive(null);
      AppState.set({ activeId: null });
      document.getElementById("main").focus({ preventScroll: true });
      window.scrollTo(0, 0);
      closeSidebar();
      return;
    }
    const endpoint = endpoints.find((e) => e.slug === hash);
    if (!endpoint) {
      content.innerHTML = `
        <div class="empty-state">
          <h3>Endpoint not found</h3>
          <p>No documented route matches <span class="mono">${RenderEndpoint.escapeHtml(hash)}</span>.</p>
          <a class="btn" href="#/docs/api-reference">Back to the API reference</a>
        </div>`;
      AppState.set({ activeId: null });
      return;
    }
    RenderEndpoint.render(endpoint, content);
    Seo.set(`${endpoint.summary} - API Reference`, `${endpoint.method} ${endpoint.path}. ${endpoint.description || endpoint.summary}`);
    Sidebar.setActive(endpoint.id);
    AppState.set({ activeId: endpoint.id });
    document.getElementById("main").focus({ preventScroll: true });
    window.scrollTo(0, 0);
    closeSidebar();
  }

  window.addEventListener("hashchange", async () => {
    // A confirmation / reset link opened while the docs are already loaded.
    if (/access_token=|error_description=/.test(location.hash)) applyRedirect(await DevAuth.handleRedirect());
    route();
  });
  route();

  // ── Prev/next keyboard shortcuts (← / →) ──────────────────
  // Only while viewing an endpoint, and never while the person is
  // typing anywhere (search box, Try It params/body, etc.).
  document.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement?.isContentEditable) return;
    const activeId = AppState.state.activeId;
    if (!activeId) return;
    const list = AppState.state.endpoints;
    const i = list.findIndex((ep) => ep.id === activeId);
    if (i === -1) return;
    const target = e.key === "ArrowLeft" ? list[i - 1] : list[i + 1];
    if (!target) return;
    e.preventDefault();
    location.hash = `#/${target.slug}`;
  });
})();
