/**
 * Developer login for the docs site, talking to Supabase Auth (GoTrue) over plain
 * fetch - no SDK, no build step. The session (access + refresh token) lives in
 * localStorage so people stay signed in. Consumer API keys are NEVER stored here
 * except, if the person opts in, in sessionStorage for the Try It console.
 */
const DevAuth = (() => {
  const SESSION_KEY = "chakudya-docs:session";
  const TRYIT_KEY = "chakudya-docs:consumer-key";
  const RECOVERY_KEY = "chakudya-docs:recovery";
  const listeners = [];
  let refreshing = null;

  const cfg = () => window.CHAKUDYA_AUTH || {};
  const configured = () => {
    const c = cfg();
    return Boolean(c.supabaseUrl && c.supabaseAnonKey && !/^PASTE/i.test(c.supabaseAnonKey));
  };
  // Always the site root, so the redirect URL allow-listed in Supabase keeps working from any page.
  const redirectUrl = () => location.origin + "/";
  const nowSec = () => Math.floor(Date.now() / 1000);

  function loadSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (_) { return null; }
  }
  function saveSession(s) {
    try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch (_) { /* ignore */ }
    listeners.forEach((fn) => fn(s));
  }
  function fromTokenResponse(r, fallbackEmail) {
    return {
      access_token: r.access_token,
      refresh_token: r.refresh_token,
      expires_at: r.expires_at || nowSec() + (Number(r.expires_in) || 3600),
      email: r.user?.email || fallbackEmail || "",
    };
  }

  async function gotrue(path, { method = "GET", body, token } = {}) {
    if (!configured()) throw new Error("Sign-in isn't configured yet.");
    const headers = { apikey: cfg().supabaseAnonKey, "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    let res;
    try {
      res = await fetch(cfg().supabaseUrl.replace(/\/$/, "") + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch (_) {
      throw new Error("Couldn't reach the sign-in service. Check your connection.");
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) { json = null; }
    if (!res.ok) {
      const msg = json?.msg || json?.error_description || json?.message || json?.error || `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  async function signUp(email, password) {
    const r = await gotrue(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirectUrl())}`, { method: "POST", body: { email, password } });
    if (r?.access_token) { saveSession(fromTokenResponse(r, email)); return { signedIn: true }; }
    return { confirmEmail: true };
  }

  async function signIn(email, password) {
    const r = await gotrue("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
    saveSession(fromTokenResponse(r, email));
  }

  async function resetPassword(email) {
    await gotrue(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectUrl())}`, { method: "POST", body: { email } });
  }

  async function setNewPassword(password) {
    const token = await getAccessToken();
    if (!token) throw new Error("Your session has expired. Request a new reset link.");
    await gotrue("/auth/v1/user", { method: "PUT", body: { password }, token });
    sessionStorage.removeItem(RECOVERY_KEY);
  }

  function signInWithFacebook() {
    // scopes=email so Supabase gets the address the API needs to issue developer keys.
    location.href = `${cfg().supabaseUrl.replace(/\/$/, "")}/auth/v1/authorize?provider=facebook&scopes=email&redirect_to=${encodeURIComponent(redirectUrl())}`;
  }
  function signInWithGoogle() {
    location.href = `${cfg().supabaseUrl.replace(/\/$/, "")}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl())}`;
  }

  async function signOut() {
    const s = loadSession();
    clearTryItKey();
    saveSession(null);
    if (s?.access_token) { try { await gotrue("/auth/v1/logout?scope=local", { method: "POST", token: s.access_token }); } catch (_) { /* already signed out locally */ } }
  }

  /** Returns a valid access token, refreshing it first if it is about to expire. */
  async function getAccessToken() {
    const s = loadSession();
    if (!s) return null;
    if (s.expires_at - nowSec() > 60) return s.access_token;
    if (!refreshing) {
      refreshing = (async () => {
        try {
          const r = await gotrue("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: s.refresh_token } });
          const next = fromTokenResponse(r, s.email);
          saveSession(next);
          return next.access_token;
        } catch (_) {
          saveSession(null);
          return null;
        } finally { refreshing = null; }
      })();
    }
    return refreshing;
  }

  /**
   * Supabase sends people back to this page with the session in the URL hash after an
   * email confirmation, password reset or Google sign-in. Capture it BEFORE the
   * docs router sees it, then point the hash at the account page.
   */
  async function handleRedirect() {
    const h = location.hash.replace(/^#/, "");
    if (!h.includes("access_token=") && !h.includes("error_description=")) return;
    const p = new URLSearchParams(h);
    const clean = () => history.replaceState(null, "", location.pathname + location.search + "#/account");
    if (p.get("error_description")) {
      clean();
      return { error: p.get("error_description").replace(/\+/g, " ") };
    }
    const token = p.get("access_token");
    let email = "";
    try { email = (await gotrue("/auth/v1/user", { token }))?.email || ""; } catch (_) { /* keep going */ }
    saveSession({ access_token: token, refresh_token: p.get("refresh_token"), expires_at: Number(p.get("expires_at")) || nowSec() + (Number(p.get("expires_in")) || 3600), email });
    if (p.get("type") === "recovery") sessionStorage.setItem(RECOVERY_KEY, "1");
    clean();
    return { signedIn: true, type: p.get("type") };
  }

  // Optional: let Try It send the person's consumer key (session-only, never localStorage).
  function setTryItKey(key) { try { sessionStorage.setItem(TRYIT_KEY, key); } catch (_) { /* ignore */ } }
  function getTryItKey() { try { return sessionStorage.getItem(TRYIT_KEY) || ""; } catch (_) { return ""; } }
  function clearTryItKey() { try { sessionStorage.removeItem(TRYIT_KEY); } catch (_) { /* ignore */ } }

  return {
    configured, googleEnabled: () => Boolean(cfg().googleEnabled),
    facebookEnabled: () => Boolean(cfg().facebookEnabled),
    session: loadSession, isSignedIn: () => Boolean(loadSession()),
    inRecovery: () => sessionStorage.getItem(RECOVERY_KEY) === "1",
    onChange: (fn) => listeners.push(fn),
    signUp, signIn, signOut, resetPassword, setNewPassword, signInWithGoogle, signInWithFacebook,
    getAccessToken, handleRedirect, setTryItKey, getTryItKey, clearTryItKey,
  };
})();
