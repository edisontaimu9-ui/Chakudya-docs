(async function main() {
  ThemeModule.init();

  const BASE_URL_KEY = "chakudya-docs:base-url";
  const content = document.getElementById("content");

  try {
    await SpecLoader.load();
  } catch (e) {
    content.innerHTML = `
      <div class="empty-state">
        <h3>Couldn't load the API spec</h3>
        <p>${RenderEndpoint.escapeHtml(e.message)}</p>
        <p class="field__hint">Make sure this page is served over HTTP (not opened as a local <code>file://</code>), so <code>fetch("openapi.json")</code> is allowed.</p>
      </div>`;
    return;
  }

  const { spec, endpoints } = AppState.state;

  // ── Header: brand / version / GitHub ──────────────────────
  document.getElementById("version-chip").textContent = `v${spec.info?.version || "?"}`;
  document.title = `${spec.info?.title || "Chakudya API"} - Docs`;

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

  // ── Router ─────────────────────────────────────────────────
  function route() {
    const hash = location.hash.replace(/^#\/?/, "");
    // The landing page is full-width with no endpoint sidebar.
    document.body.classList.toggle("is-landing", !hash);
    document.getElementById("nav-home")?.setAttribute("aria-current", !hash ? "page" : "false");
    document.getElementById("nav-reference")?.setAttribute("aria-current", hash && hash !== "account" ? "page" : "false");
    if (!hash) {
      RenderLanding.render(content);
      Sidebar.setActive(null);
      AppState.set({ activeId: null });
      document.getElementById("main").focus({ preventScroll: true });
      window.scrollTo(0, 0);
      closeSidebar();
      return;
    }
    if (hash === "reference") {
      RenderOverview.render(content);
      Sidebar.setActive(null);
      AppState.set({ activeId: null });
      document.getElementById("main").focus({ preventScroll: true });
      window.scrollTo(0, 0);
      closeSidebar();
      return;
    }
    if (hash === "account") {
      RenderAccount.show(content);
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
          <a class="btn" href="#/">Back to overview</a>
        </div>`;
      AppState.set({ activeId: null });
      return;
    }
    RenderEndpoint.render(endpoint, content);
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
