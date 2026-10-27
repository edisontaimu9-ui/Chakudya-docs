/* Chakudya admin - shared core for every admin page.
 *
 * Each page (index.html, keys.html, ...) holds its own content in a <template id="tpl"> and calls
 *   Admin.mount({ id, title, init(), refresh(keep) })
 * This file provides the sign-in screen, header, page navigation, API calls, helpers and the
 * refresh / auto-refresh behaviour, so a page only loads and draws its own data.
 */
(() => {
  "use strict";
  const SESSION_KEY = "chakudya-docs:session"; // same key the docs site uses
  const AUTO_MS = 60000; // auto refresh is always on while a page is open and visible
  const AUTH = window.CHAKUDYA_AUTH || {};
  const API = window.CHAKUDYA_API || {};
  const SB = String(AUTH.supabaseUrl || "").replace(/\/$/, "");
  const GW = String(API.gatewayUrl || "").replace(/\/$/, "");
  const $ = (id) => document.getElementById(id);
  const nowSec = () => Math.floor(Date.now() / 1000);

  const PAGES = [
    ["index.html", "Overview", "overview"],
    ["keys.html", "API keys", "keys"],
    ["review.html", "Food review", "review"],
    ["usage.html", "Usage", "usage"],
    ["monitoring.html", "Errors & latency", "monitoring"],
    ["health.html", "Uptime", "health"],
    ["surveillance.html", "Surveillance", "surveillance"],
    ["activity.html", "Admin actions", "activity"],
    ["ingest.html", "RAG ingest", "ingest"],
    ["audit.html", "FHIR audit", "audit"],
  ];

  /* ───── session ───── */
  const loadSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (_) { return null; } };
  const saveSession = (s) => { try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch (_) {} };

  async function gotrue(path, body) {
    const res = await fetch(SB + path, { method: "POST", headers: { apikey: AUTH.supabaseAnonKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(j?.msg || j?.error_description || j?.message || "Sign-in failed");
    return j;
  }
  const fromToken = (r, email) => ({ access_token: r.access_token, refresh_token: r.refresh_token, expires_at: r.expires_at || nowSec() + (Number(r.expires_in) || 3600), email: r.user?.email || email || "" });

  async function token() {
    const s = loadSession();
    if (!s) return null;
    if (s.expires_at - nowSec() > 60) return s.access_token;
    try {
      const next = fromToken(await gotrue("/auth/v1/token?grant_type=refresh_token", { refresh_token: s.refresh_token }), s.email);
      saveSession(next);
      return next.access_token;
    } catch (_) { saveSession(null); return null; }
  }

  /* ───── API ───── */
  async function call(path, opts = {}) {
    const t = await token();
    if (!t) return { status: 401 };
    let res;
    const headers = { Authorization: "Bearer " + t };
    if (opts.body) headers["Content-Type"] = "application/json";
    try { res = await fetch(GW + "/a" + path, { method: opts.method || "GET", headers, body: opts.body ? JSON.stringify(opts.body) : undefined }); }
    catch (_) { return { status: 0 }; }
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }

  /* ───── helpers ───── */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => (typeof n === "number" ? n.toLocaleString() : "n/a");
  // Progress bar. pct is the headline percentage (0 when there is nothing yet). segs = [{ pct, cls }] draws a split bar;
  // run = true is the indeterminate "working" bar with no percentage; noPct hides the number (for a failed state).
  const clampPct = (n) => (typeof n === "number" && isFinite(n) ? Math.max(0, Math.min(100, n)) : 0);
  const bar = ({ text = "", pct = 0, cls = "", segs, run = false, noPct = false }) => {
    const p = clampPct(pct);
    const parts = (segs || [{ pct: p, cls }]).map((x) => `<i class="${esc(x.cls || "")}"${run ? "" : ` style="width:${clampPct(x.pct)}%"`}></i>`).join("");
    return `<div class="pbar-row"><span>${esc(text)}</span><b>${run || noPct ? "" : +p.toFixed(1) + "%"}</b></div>`
      + `<div class="pbar${run ? " run" : ""}" role="progressbar" aria-label="${esc(text || "Progress")}" aria-valuemin="0" aria-valuemax="100"${run ? "" : ` aria-valuenow="${Math.round(p)}"`}>${parts}</div>`;
  };
  const stat = (label, n) => `<div class="stat${typeof n === "number" ? "" : " null"}"><b>${fmt(n)}</b><span>${esc(label)}</span></div>`;
  const msFmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + " s" : Math.round(n) + " ms");
  function ago(iso) {
    if (!iso) return "never";
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 90) return "just now";
    if (s < 5400) return Math.round(s / 60) + " min ago";
    if (s < 129600) return Math.round(s / 3600) + " h ago";
    return Math.round(s / 86400) + " d ago";
  }
  function dayLabel(iso) {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }) + "<br>" + d.getUTCDate();
  }
  // Bar chart of calls per UTC day (days = [{ day, count }]), the last bar highlighted as today.
  function trendBars(days) {
    const max = Math.max(1, ...days.map((d) => d.count));
    return `<div class="trend">${days.map((d, i) => `<div class="col${i === days.length - 1 ? " today" : ""}"><span class="val">${fmt(d.count)}</span><div class="bar1" style="height:${Math.max(2, Math.round((d.count / max) * 110))}px"></div><span class="day">${dayLabel(d.day)}</span></div>`).join("")}</div>`;
  }
  // Filter chips: clicking [data-<attr>] inside #id marks it on and calls onPick(value).
  function chips(id, attr, onPick) {
    document.addEventListener("click", (e) => {
      const f = e.target.closest(`#${id} [data-${attr}]`);
      if (!f) return;
      document.querySelectorAll(`#${id} .chip`).forEach((c) => c.classList.toggle("on", c === f));
      onPick(f.dataset[attr]);
    });
  }

  /* ───── shell ───── */
  let cfg = null;
  let timer = null;
  let mounted = false;

  function show(view) {
    $("login").classList.toggle("hide", view !== "login");
    $("app").classList.toggle("hide", view !== "app");
  }
  function fatal(msg) { const f = $("fatal"); f.textContent = msg; f.classList.remove("hide"); }
  function notAuthorised() {
    const email = loadSession()?.email || "this account";
    fatal(`Not authorised. ${email} is not an approved admin, or the session expired. Sign out and use an approved account.`);
  }
  // Pages call this on every response: a 401 from the gateway means not signed in, or an email that is not on the admin list.
  function authFail(r) {
    if (r && r.status === 401) { notAuthorised(); return true; }
    return false;
  }
  // Shared by the pages that show counts from the overview. Returns the data, or null after showing the error.
  async function overview() {
    const r = await call("/admin/overview");
    if (authFail(r)) return null;
    if (r.status !== 200 || !r.body?.data) {
      fatal(r.status === 0 ? "Couldn't reach the gateway. Check your connection." : `Overview failed (${r.status}): ${r.body?.error || r.body?.message || "unknown error"}`);
      return null;
    }
    return r.body.data;
  }

  const ICON_REFRESH = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.9-3M4 5v4h4"/><path d="M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4"/></svg>';
  const ICON_OUT = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>';

  function shellHtml() {
    const nav = PAGES.map(([href, label, id]) => `<a href="${href}"${id === cfg.id ? ' class="on" aria-current="page"' : ""}>${esc(label)}</a>`).join("");
    return `
  <section id="login" class="card login hide">
    <div class="brand login-brand">
      <img src="../assets/icons/icon-192.png" alt="" width="44" height="44" />
      <div><div class="eyebrow">Nutrition Registry</div><h1>Chakudya <em>Admin</em></h1></div>
    </div>
    <p class="muted">Sign in with an approved admin account.</p>
    <label class="muted" for="em">Email</label>
    <input id="em" type="email" autocomplete="username" />
    <label class="muted" for="pw">Password</label>
    <div style="position:relative">
      <input id="pw" type="password" autocomplete="current-password" style="padding-right:64px" />
      <button id="eye" type="button" aria-label="Show password" style="position:absolute;right:6px;top:10px;padding:4px 10px;font-size:13px">Show</button>
    </div>
    <button id="go" class="primary" style="width:100%">Sign in</button>
    <button id="forgot" type="button" style="width:100%;margin-top:8px;background:none;border-color:transparent;color:var(--text2);text-decoration:underline">Forgot password? Email me a reset link</button>
    <p id="loginMsg" class="muted" role="status"></p>
    <p class="muted">Signed in with Google? Sign in on the docs site first, then reload this page.</p>
  </section>

  <section id="app" class="hide">
    <header class="topbar">
      <div class="brand">
        <img src="../assets/icons/icon-192.png" alt="" width="44" height="44" />
        <div>
          <div class="eyebrow">Nutrition Registry</div>
          <h1>Chakudya <em>Admin</em></h1>
        </div>
      </div>
      <div class="tools">
        <div id="who" class="who" title=""><span id="avatar" class="av" aria-hidden="true"></span><span id="whoEmail" class="em"></span></div>
        <button id="refresh" class="ibtn" type="button" title="Refresh now">${ICON_REFRESH}<span>Refresh</span></button>
        <button id="out" class="ibtn ghost" type="button" title="Sign out">${ICON_OUT}<span>Sign out</span></button>
      </div>
    </header>
    <nav class="nav" aria-label="Admin pages">${nav}</nav>
    <div class="live" id="live"><span class="pulse" aria-hidden="true"></span><span id="status" role="status"></span></div>
    <div id="fatal" class="card err hide"></div>
    <div id="page"></div>
  </section>`;
  }

  // Runs the page's refresh and keeps the status line honest. keep = true on auto refresh (pages keep loaded lists).
  let busy = false;
  let lastLoad = 0;
  async function load(keep) {
    if (busy) return;
    busy = true;
    $("fatal").classList.add("hide");
    $("refresh").disabled = true;
    $("refresh").classList.add("busy");
    $("live").classList.add("busy");
    $("status").textContent = "Refreshing…";
    try { await cfg.refresh?.(keep === true); }
    finally {
      busy = false;
      lastLoad = Date.now();
      $("refresh").disabled = false;
      $("refresh").classList.remove("busy");
      $("live").classList.remove("busy");
    }
    $("status").textContent = $("fatal").classList.contains("hide") ? "Live · updated " + new Date().toLocaleTimeString() : "";
  }

  // Always on: refresh every minute while the tab is visible, and catch up when you come back to a stale tab.
  function startAuto() {
    if (timer) return;
    timer = setInterval(() => { if (!document.hidden) load(true); }, AUTO_MS);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && loadSession() && Date.now() - lastLoad > AUTO_MS) load(true);
    });
  }

  async function start() {
    const s = loadSession();
    if (!s || !(await token())) { show("login"); return; }
    show("app");
    const email = loadSession()?.email || "";
    $("whoEmail").textContent = email;
    $("who").title = email;
    $("avatar").textContent = (email.trim()[0] || "A");
    startAuto();
    if (!mounted) {
      mounted = true;
      const tpl = $("tpl");
      if (tpl) $("page").appendChild(tpl.content.cloneNode(true));
      cfg.init?.();
    }
    load();
  }

  function mount(c) {
    cfg = c;
    document.title = "Chakudya admin · " + (c.title || c.id);
    const root = $("root");
    root.innerHTML = shellHtml();

    $("go").addEventListener("click", async () => {
      const email = $("em").value.trim(), password = $("pw").value;
      if (!email || !password) { $("loginMsg").textContent = "Enter email and password."; return; }
      $("go").disabled = true; $("loginMsg").textContent = "Signing in…";
      try { saveSession(fromToken(await gotrue("/auth/v1/token?grant_type=password", { email, password }), email)); $("pw").value = ""; $("loginMsg").textContent = ""; start(); }
      catch (e) { $("loginMsg").textContent = e.message; }
      $("go").disabled = false;
    });
    $("eye").addEventListener("click", () => {
      const showPw = $("pw").type === "password";
      $("pw").type = showPw ? "text" : "password";
      $("eye").textContent = showPw ? "Hide" : "Show";
      $("eye").setAttribute("aria-label", showPw ? "Hide password" : "Show password");
    });
    $("forgot").addEventListener("click", async () => {
      const email = $("em").value.trim();
      if (!email) { $("loginMsg").textContent = "Type your email above first."; return; }
      $("forgot").disabled = true; $("loginMsg").textContent = "Sending…";
      try {
        // The reset link lands on the docs site (already an allowed redirect), where you set the new password.
        const back = new URL("../", location.href).href;
        const res = await fetch(SB + "/auth/v1/recover?redirect_to=" + encodeURIComponent(back), { method: "POST", headers: { apikey: AUTH.supabaseAnonKey, "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
        $("loginMsg").textContent = res.ok ? "If that account exists, a reset link is on its way. Open it, set a new password, then come back here." : "Couldn't send the link. Try again in a minute.";
      } catch (_) { $("loginMsg").textContent = "Couldn't reach the sign-in service."; }
      $("forgot").disabled = false;
    });
    $("pw").addEventListener("keydown", (e) => { if (e.key === "Enter") $("go").click(); });
    $("refresh").addEventListener("click", () => load());
    // Reloading clears every list and any key shown on screen, so nothing from the session stays in the page.
    $("out").addEventListener("click", () => { saveSession(null); clearInterval(timer); location.reload(); });

    if (!SB || !GW) { show("login"); $("loginMsg").textContent = "Missing config. Check js/config.js."; }
    else start();
  }

  window.Admin = { $, esc, fmt, stat, bar, ago, msFmt, dayLabel, trendBars, chips, call, loadSession, overview, authFail, fatal, reload: load, mount };
})();
