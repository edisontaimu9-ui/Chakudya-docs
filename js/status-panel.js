/**
 * Prominent "right now" status banner + per-service breakdown, rendered at
 * the top of the Overview page (below the hero). Pings GET /health against
 * the currently selected baseUrl - no manual command needed to see it.
 *
 * This is current-status only, not a historical uptime tracker: nothing is
 * recorded over time, it just reflects what /health returns at the moment
 * of the last check. Re-checks: on mount, whenever baseUrl changes, every
 * 60s while the tab is visible and the panel is on screen, and on click of
 * the Refresh button.
 *
 * The panel is destroyed/recreated every time RenderOverview re-renders
 * (container.innerHTML is cleared on navigation), so check() defensively
 * looks up its DOM elements each call and stops its own interval the
 * moment they're gone rather than relying on an external lifecycle hook.
 */
const StatusPanel = (() => {
  const REFRESH_MS = 60000;
  let timer = null;
  let inFlight = false;
  let baseUrlListenerAttached = false;

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function panelEl() {
    return document.getElementById("status-panel");
  }
  function servicesEl() {
    return document.getElementById("status-services");
  }

  function labelFor(state) {
    switch (state) {
      case "ok": return "All Systems Operational";
      case "degraded": return "Degraded - one or more required services are down";
      case "error": return "Unable to reach the API";
      case "checking": return "Checking status…";
      default: return "Status unknown - set a base URL above";
    }
  }

  function setPanel(state, detail) {
    const panel = panelEl();
    if (!panel) return; // navigated away mid-check
    panel.className = `status-panel status-panel--${state}`;
    panel.querySelector(".status-panel__label").textContent = labelFor(state);
    panel.querySelector(".status-panel__detail").textContent = detail || "";
  }

  function renderServices(services) {
    const wrap = servicesEl();
    if (!wrap) return;
    wrap.innerHTML = "";
    if (!services) return;
    // Show generic roles instead of vendor names for the underlying
    // data/infra providers - visitors don't need to know which specific
    // vendor backs each piece.
    const LABEL_OVERRIDES = {
      supabase: "Database",
      groq: "LLM",
    };
    Object.entries(services).forEach(([name, info], i) => {
      const status = info?.status || "unknown";
      const good = status === "ok" || status === "configured" || status === "bound";
      const bad = status === "error";
      const dotClass = good ? "status-service__dot--ok" : bad ? "status-service__dot--error" : "";
      const label = LABEL_OVERRIDES[name.toLowerCase()] || name.replace(/_/g, " ");
      const row = el(`
        <div class="status-service">
          <span class="status-service__dot ${dotClass}" aria-hidden="true"></span>
          <span class="status-service__name">${label}</span>
          <span class="status-service__value">${status}</span>
        </div>
      `);
      // Small stagger so the dots don't all blink in perfect unison.
      row.querySelector(".status-service__dot").style.animationDelay = `${(i % 6) * 0.15}s`;
      wrap.appendChild(row);
    });
  }

  function timestamp() {
    return `Checked ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  }

  async function check() {
    if (inFlight) return;
    if (!panelEl()) { stop(); return; } // panel not on screen - nothing to do

    const baseUrl = AppState.state.baseUrl;
    if (!baseUrl) {
      setPanel("unknown", "");
      renderServices(null);
      return;
    }

    inFlight = true;
    setPanel("checking", "Checking…");

    let url;
    try {
      url = ApiClient.buildUrl(baseUrl, "/health", {}, {});
    } catch (_) {
      inFlight = false;
      setPanel("error", "The current base URL isn't valid.");
      renderServices(null);
      return;
    }

    const result = await ApiClient.execute({ url, method: "GET", headers: {} });
    inFlight = false;
    if (!panelEl()) return; // navigated away while the request was in flight

    const body = result.bodyJson;

    if (result.ok && result.status === 200 && body?.status === "healthy") {
      setPanel("ok", timestamp());
      renderServices(body.services);
      return;
    }
    if (result.ok && body?.status === "degraded") {
      setPanel("degraded", timestamp());
      renderServices(body.services);
      return;
    }
    if (!result.ok) {
      setPanel("error", result.message || "Network error reaching /health (CORS, DNS, or the API is down).");
      renderServices(null);
      return;
    }
    setPanel("error", (result.bodyText || "Unexpected response from /health").slice(0, 200));
    renderServices(null);
  }

  function start() {
    stop();
    timer = setInterval(() => {
      if (!document.hidden) check();
    }, REFRESH_MS);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function markup() {
    return `
      <div class="status-panel status-panel--checking" id="status-panel" role="status" aria-live="polite">
        <div class="status-panel__main">
          <span class="status-panel__dot" aria-hidden="true"></span>
          <span class="status-panel__label">Checking status…</span>
        </div>
        <span class="status-panel__detail"></span>
        <button class="status-panel__refresh" id="status-panel-refresh" type="button">Refresh</button>
      </div>
      <div class="status-services" id="status-services"></div>
    `;
  }

  /** Appends the panel + service grid to `container` and starts checking. Call once per Overview render. */
  function mount(container) {
    container.insertAdjacentHTML("beforeend", markup());
    document.getElementById("status-panel-refresh").addEventListener("click", () => check());

    if (!baseUrlListenerAttached) {
      AppState.on("change:baseUrl", () => check());
      baseUrlListenerAttached = true;
    }

    check();
    start();
  }

  return { mount, check };
})();
