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
   * The docs site's own key (window.CHAKUDYA_API.siteKey), as a header object. Empty when no key
   * is configured or when the URL is not the configured API, so the key never goes to a custom
   * base URL a visitor typed in.
   */
  function siteAuthHeaders(url) {
    const cfg = window.CHAKUDYA_API || {};
    if (!cfg.siteKey || !cfg.baseUrl) return {};
    try {
      return new URL(url).origin === new URL(cfg.baseUrl).origin ? { Authorization: `Bearer ${cfg.siteKey}` } : {};
    } catch (_) { return {}; }
  }

  /**
   * Executes the request and returns a normalized result. Never throws -
   * network/CORS failures come back as { ok:false, networkError:true }.
   */
  async function execute({ url, method, headers, body }) {
    const startedAt = performance.now();
    try {
      // A key the visitor supplied (Try It) wins; otherwise fall back to the site's own key.
      const hasAuth = headers && Object.keys(headers).some((h) => h.toLowerCase() === "authorization");
      const res = await fetch(url, {
        method,
        headers: hasAuth ? headers : { ...(headers || {}), ...siteAuthHeaders(url) },
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

  return { buildUrl, buildHeaders, execute, siteAuthHeaders };
})();
