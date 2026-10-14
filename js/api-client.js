const ApiClient = (() => {
  /** Substitute {param} path placeholders and append query params. */
  function buildUrl(baseUrl, path, pathParams, queryParams) {
    let resolvedPath = path;
    for (const [key, val] of Object.entries(pathParams || {})) {
      resolvedPath = resolvedPath.replace(`{${key}}`, encodeURIComponent(val));
    }
    const base = (baseUrl || "").replace(/\/$/, "");
    const url = new URL(base + resolvedPath);
    for (const [key, val] of Object.entries(queryParams || {})) {
      if (val !== undefined && val !== null && val !== "") url.searchParams.set(key, val);
    }
    return url.toString();
  }

  function buildHeaders({ hasBody, authToken }) {
    const headers = {};
    if (hasBody) headers["Content-Type"] = "application/json";
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
    return headers;
  }

  /**
   * Route a call made on the docs site's own behalf (no visitor key). When
   * window.CHAKUDYA_API.gatewayUrl is set, calls to the API go through the gateway Worker,
   * which holds the site key server-side, so no key ships to the browser. Without a
   * gatewayUrl it falls back to the older browser-side siteKey. Returns { url, headers }.
   * Calls to any other origin (e.g. a custom base URL) are left untouched.
   */
  function siteRequest(url) {
    const cfg = window.CHAKUDYA_API || {};
    try {
      if (cfg.baseUrl && new URL(url).origin === new URL(cfg.baseUrl).origin) {
        if (cfg.gatewayUrl) {
          const u = new URL(url);
          return { url: cfg.gatewayUrl.replace(/\/$/, "") + "/p" + u.pathname + u.search, headers: {} };
        }
        if (cfg.siteKey) return { url, headers: { Authorization: `Bearer ${cfg.siteKey}` } };
      }
    } catch (_) { /* fall through */ }
    return { url, headers: {} };
  }

  /** Header-only view of siteRequest (kept for callers that build their own fetch). */
  function siteAuthHeaders(url) {
    return siteRequest(url).headers;
  }

  /**
   * Executes the request and returns a normalized result. Never throws -
   * network/CORS failures come back as { ok:false, networkError:true }.
   */
  async function execute({ url, method, headers, body }) {
    const startedAt = performance.now();
    try {
      // A key the visitor supplied (Try It) goes straight to the API; otherwise the call
      // goes through the site gateway (or the legacy site key).
      const hasAuth = headers && Object.keys(headers).some((h) => h.toLowerCase() === "authorization");
      const site = hasAuth ? { url, headers: {} } : siteRequest(url);
      const res = await fetch(site.url, {
        method,
        headers: { ...(headers || {}), ...site.headers },
        body: body !== undefined ? body : undefined,
      });
      const durationMs = Math.round(performance.now() - startedAt);

      const responseHeaders = [];
      res.headers.forEach((value, key) => responseHeaders.push([key, value]));

      const rawText = await res.text();
      let parsed = null;
      try { parsed = rawText ? JSON.parse(rawText) : null; } catch (_) { parsed = null; }

      return {
        ok: true,
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
        bodyText: rawText,
        bodyJson: parsed,
        durationMs,
      };
    } catch (e) {
      const durationMs = Math.round(performance.now() - startedAt);
      return {
        ok: false,
        networkError: true,
        message: e?.message || "Network request failed",
        durationMs,
      };
    }
  }

  return { buildUrl, buildHeaders, execute, siteRequest, siteAuthHeaders };
})();
