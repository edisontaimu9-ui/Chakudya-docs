/** Developer account page (#/account): sign in or create an account, then manage consumer API keys. */
const RenderAccount = (() => {
  const esc = (s) => RenderEndpoint.escapeHtml(String(s ?? ""));
  let container = null;
  let mode = "signin"; // signin | signup | reset
  let flash = null;    // { kind: "ok"|"err", text }
  let newKey = null;   // raw key, shown once, only in memory

  function setFlash(kind, text) { flash = text ? { kind, text } : null; }
  const flashHtml = () => (flash ? `<div class="account-msg account-msg--${flash.kind}" role="status">${esc(flash.text)}</div>` : "");

  async function keysApi(method, path = "", body) {
    const token = await DevAuth.getAccessToken();
    if (!token) { const e = new Error("Your session has expired. Sign in again."); e.status = 401; throw e; }
    let res;
    try {
      res = await fetch(`${AppState.state.baseUrl.replace(/\/$/, "")}/developer/keys${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (_) { throw new Error("Couldn't reach the API. Try again in a moment."); }
    const json = await res.json().catch(() => null);
    if (!res.ok) { const e = new Error(json?.message || json?.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
    return json;
  }

  // ── Signed out ────────────────────────────────────────────
  function renderSignedOut() {
    const title = { signin: "Sign in", signup: "Create your account", reset: "Reset your password" }[mode];
    const btn = { signin: "Sign in", signup: "Create account", reset: "Send reset link" }[mode];
    const pw = mode !== "reset";
    container.innerHTML = `
      <section class="account">
        <p class="eyebrow">Developer account</p>
        <h1 class="hero__title">Get an API key</h1>
        <p class="hero__lead">Create a free account to generate your own consumer API keys. A key gives you three times the public rate limit, access to the FHIR operations, and usage counts for each key.</p>
        <div class="account-card">
          <div class="account-tabs" role="tablist">
            <button type="button" class="account-tab ${mode === "signin" ? "is-active" : ""}" data-mode="signin">Sign in</button>
            <button type="button" class="account-tab ${mode === "signup" ? "is-active" : ""}" data-mode="signup">Create account</button>
          </div>
          <h2 class="account-card__title">${title}</h2>
          ${flashHtml()}
          <form class="account-form" novalidate>
            <div class="field"><label class="field__label" for="acc-email">Email</label>
              <input id="acc-email" type="email" autocomplete="email" required /></div>
            ${pw ? `<div class="field"><label class="field__label" for="acc-pass">Password</label>
              <input id="acc-pass" type="password" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" minlength="8" required />
              ${mode === "signup" ? `<span class="field__hint">At least 8 characters. We'll email you a link to confirm your address.</span>` : ""}</div>` : ""}
            <button class="btn btn--primary" type="submit">${btn}</button>
          </form>
          ${DevAuth.googleEnabled() && mode !== "reset" ? `<div class="account-or"><span>or</span></div><button type="button" class="btn" id="acc-google">Continue with Google</button>` : ""}
          <p class="account-links">${mode === "signin" ? `<a href="#/account" data-mode="reset">Forgot your password?</a>` : mode === "reset" ? `<a href="#/account" data-mode="signin">Back to sign in</a>` : ""}</p>
        </div>
      </section>`;

    container.querySelectorAll("[data-mode]").forEach((n) => n.addEventListener("click", (e) => {
      e.preventDefault(); mode = n.dataset.mode; setFlash(null); renderSignedOut();
    }));
    container.querySelector("#acc-google")?.addEventListener("click", () => DevAuth.signInWithGoogle());
    container.querySelector(".account-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = container.querySelector("#acc-email").value.trim();
      const password = container.querySelector("#acc-pass")?.value || "";
      const submit = e.target.querySelector("button[type=submit]");
      if (!email || (pw && password.length < 8)) { setFlash("err", pw ? "Enter your email and a password of at least 8 characters." : "Enter your email."); return renderSignedOut(); }
      submit.disabled = true;
      try {
        if (mode === "signin") { await DevAuth.signIn(email, password); setFlash(null); render(container); return; }
        if (mode === "signup") {
          const r = await DevAuth.signUp(email, password);
          if (r.signedIn) { setFlash(null); render(container); return; }
          mode = "signin"; setFlash("ok", "Check your inbox for a confirmation link, then sign in here.");
        } else {
          await DevAuth.resetPassword(email); mode = "signin"; setFlash("ok", "If that email has an account, a reset link is on its way.");
        }
      } catch (err) { setFlash("err", err.message); }
      renderSignedOut();
    });
  }

  // ── Signed in ─────────────────────────────────────────────
  const fmtDate = (v) => (v ? new Date(v).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "never");

  async function renderSignedIn() {
    const s = DevAuth.session();
    const recovery = DevAuth.inRecovery();
    container.innerHTML = `
      <section class="account">
        <p class="eyebrow">Developer account</p>
        <h1 class="hero__title">Your API keys</h1>
        <div class="account-bar"><span>Signed in as <strong>${esc(s?.email || "your account")}</strong></span><button class="btn btn--sm" id="acc-signout" type="button">Sign out</button></div>
        ${flashHtml()}
        ${recovery ? `<div class="account-card"><h2 class="account-card__title">Set a new password</h2>
          <form class="account-form" id="acc-newpass" novalidate><div class="field"><label class="field__label" for="np">New password</label>
          <input id="np" type="password" autocomplete="new-password" minlength="8" required /></div>
          <button class="btn btn--primary" type="submit">Save password</button></form></div>` : ""}
        <div class="account-card" id="acc-keys"><div class="loading-state" style="padding:24px 0"><div class="spinner"></div><p>Loading your keys…</p></div></div>
        <div class="callout"><strong>What a key gives you.</strong> Three times each public route's rate limit, tracked per key instead of per IP. Access to the <code>/fhir</code> clinical operations. A usage count for every key. Send it as <code>Authorization: Bearer YOUR_KEY</code>. A consumer key can only read and compute; it can never write data or reach admin routes.</div>
      </section>`;

    container.querySelector("#acc-signout").addEventListener("click", async () => { await DevAuth.signOut(); newKey = null; setFlash("ok", "Signed out."); mode = "signin"; render(container); });
    container.querySelector("#acc-newpass")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await DevAuth.setNewPassword(container.querySelector("#np").value); setFlash("ok", "Password updated."); }
      catch (err) { setFlash("err", err.message); }
      renderSignedIn();
    });
    await loadKeys();
  }

  async function loadKeys() {
    const box = container.querySelector("#acc-keys");
    let res;
    try { res = await keysApi("GET"); }
    catch (err) {
      if (err.status === 401) { await DevAuth.signOut(); setFlash("err", err.message); mode = "signin"; return render(container); }
      box.innerHTML = `<div class="account-msg account-msg--err">${esc(err.message)}</div>`;
      return;
    }
    const keys = res.data || [];
    const max = res.max_keys || 3;
    const rows = keys.map((k) => `
      <div class="key-row"><div class="key-row__main">
        <strong>${esc(k.label)}</strong> <span class="mono key-row__prefix">${esc(k.key_prefix || "cnr_")}…</span>
        <span class="field__hint">Created ${fmtDate(k.created_at)} · last used ${fmtDate(k.last_used_at)} · ${k.usage?.today ?? 0} requests today, ${k.usage?.last_7_days ?? 0} in 7 days</span></div>
        <button class="btn btn--sm" data-revoke="${esc(k.id)}" type="button">Revoke</button></div>`).join("");
    box.innerHTML = `
      ${newKey ? `<div class="key-reveal"><strong>Copy your new key now. It won't be shown again.</strong>
        <code class="key-reveal__key" id="acc-newkey"></code>
        <div class="key-reveal__actions"><button class="btn btn--sm btn--primary" id="acc-copy" type="button">Copy key</button>
        <button class="btn btn--sm" id="acc-use" type="button">Use in Try It</button><button class="btn btn--sm btn--ghost" id="acc-dismiss" type="button">I've saved it</button></div>
        <div class="code-block"><pre><code id="acc-curl"></code></pre></div></div>` : ""}
      ${keys.length ? `<div class="key-list">${rows}</div>` : `<p class="field__hint">You don't have any keys yet.</p>`}
      <h2 class="account-card__title">Create a key</h2>
      ${keys.length >= max ? `<p class="field__hint">You've reached the limit of ${max} active keys. Revoke one to create another.</p>` : `
      <form class="account-form account-form--inline" id="acc-create" novalidate>
        <div class="field"><label class="field__label" for="acc-label">Label</label><input id="acc-label" type="text" maxlength="60" placeholder="e.g. Thanzi mobile app" required /></div>
        <button class="btn btn--primary" type="submit">Create key</button></form>
        <span class="field__hint">${keys.length} of ${max} keys in use.</span>`}`;

    if (newKey) {
      box.querySelector("#acc-newkey").textContent = newKey;
      box.querySelector("#acc-curl").textContent = `curl -H "Authorization: Bearer ${newKey}" \\\n  ${AppState.state.baseUrl}/foods/categories`;
      box.querySelector("#acc-copy").addEventListener("click", async () => CopyModule.toast((await CopyModule.copyText(newKey)) ? "Key copied" : "Couldn't copy - select it manually"));
      box.querySelector("#acc-use").addEventListener("click", () => { DevAuth.setTryItKey(newKey); CopyModule.toast("Try It will now send this key (until you close the tab)"); });
      box.querySelector("#acc-dismiss").addEventListener("click", () => { newKey = null; loadKeys(); });
    }
    box.querySelectorAll("[data-revoke]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Revoke this key? Apps using it will stop working immediately.")) return;
      b.disabled = true;
      try { await keysApi("DELETE", `/${encodeURIComponent(b.dataset.revoke)}`); DevAuth.clearTryItKey(); setFlash("ok", "Key revoked."); }
      catch (err) { setFlash("err", err.message); }
      renderSignedIn();
    }));
    box.querySelector("#acc-create")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const label = box.querySelector("#acc-label").value.trim();
      if (!label) { box.querySelector("#acc-label").focus(); return; }
      e.target.querySelector("button").disabled = true;
      try { const r = await keysApi("POST", "", { label }); newKey = r.key; setFlash(null); }
      catch (err) { setFlash("err", err.message); }
      renderSignedIn();
    });
  }

  function render(el) {
    container = el;
    if (!DevAuth.configured()) {
      el.innerHTML = `<div class="empty-state"><h3>Sign-in isn't set up yet</h3><p>The site owner still needs to add the Supabase publishable key to <span class="mono">js/config.js</span>.</p><a class="btn" href="#/docs/getting-started">Back to the docs</a></div>`;
      return;
    }
    if (DevAuth.isSignedIn()) renderSignedIn(); else renderSignedOut();
  }

  /** Entry from the router: a fresh visit never re-shows a key that was revealed earlier. */
  function show(el) { newKey = null; render(el); }

  return { render, show, setFlash };
})();
