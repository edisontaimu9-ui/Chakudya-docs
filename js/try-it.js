const TryIt = (() => {
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function mount(endpoint, container) {
    const spec = AppState.state.spec;
    const pathParams = endpoint.parameters.filter((p) => p.in === "path");
    const queryParams = endpoint.parameters.filter((p) => p.in === "query");
    const hasBody = !!endpoint.requestBody;
    const bodyExample = SchemaExample.forRequestBody(spec, endpoint.requestBody);

    const panel = el(`
      <div class="tryit">
        <div class="tryit__bar">
          <div class="tryit__title">
            <span class="badge-method badge-method--${endpoint.method}">${endpoint.method}</span>
            <span>Try this endpoint live</span>
          </div>
          <button class="btn btn--primary btn--sm" type="button" data-action="toggle">Try it</button>
        </div>
        <div class="tryit__body">
          ${endpoint.authMode !== "public" ? `
            <div class="auth-row">
              <div class="field">
                <label class="field__label">Authorization <span class="param-required">${endpoint.authMode === "admin" ? "required" : "optional"}</span></label>
                <input type="text" data-role="auth" placeholder="Bearer token (ADMIN_API_KEY or a minted key)" autocomplete="off" spellcheck="false" />
                <span class="field__hint">Kept in memory for this page only — never saved to storage or sent anywhere but the request below.</span>
              </div>
            </div>` : ""}
          ${pathParams.length ? `<div class="field"><label class="field__label" style="margin-bottom:2px">Path parameters</label><div class="field-grid" data-role="path-fields"></div></div>` : ""}
          ${queryParams.length ? `<div class="field"><label class="field__label" style="margin-bottom:2px">Query parameters</label><div class="field-grid" data-role="query-fields"></div></div>` : ""}
          ${hasBody ? `
            <div class="field">
              <label class="field__label">Request body (JSON)</label>
              <textarea data-role="body" spellcheck="false"></textarea>
              <span class="field__hint">Editable — this is a starting example, not the only valid shape.</span>
            </div>` : ""}
          <div>
            <button class="btn btn--primary" type="button" data-action="send">Send request</button>
          </div>
          <div class="tryit__error" data-role="error"></div>
          <div class="tryit__result" data-role="result"></div>
        </div>
      </div>
    `);

    // Path param fields
    if (pathParams.length) {
      const grid = panel.querySelector('[data-role="path-fields"]');
      pathParams.forEach((p) => {
        const f = el(`
          <div class="field">
            <label class="field__label">${p.name}<span class="param-required">required</span></label>
            <input type="text" data-path-param="${p.name}" autocomplete="off" spellcheck="false" placeholder="${p.name}" />
          </div>
        `);
        grid.appendChild(f);
      });
    }

    // Query param fields
    if (queryParams.length) {
      const grid = panel.querySelector('[data-role="query-fields"]');
      queryParams.forEach((p) => {
        const schema = SpecLoader.deref(spec, p.schema) || {};
        const f = el(`
          <div class="field">
            <label class="field__label">${p.name}${p.required ? '<span class="param-required">required</span>' : ""}</label>
            <input type="text" data-query-param="${p.name}" autocomplete="off" spellcheck="false"
              placeholder="${schema.default !== undefined ? schema.default : p.name}" />
          </div>
        `);
        grid.appendChild(f);
      });
    }

    // Body textarea default
    if (hasBody) {
      const ta = panel.querySelector('[data-role="body"]');
      ta.value = bodyExample !== null && bodyExample !== undefined ? JSON.stringify(bodyExample, null, 2) : "{}";
    }

    // Toggle open/closed
    panel.querySelector('[data-action="toggle"]').addEventListener("click", () => {
      panel.classList.toggle("is-open");
    });

    panel.querySelector('[data-action="send"]').addEventListener("click", () => send(panel, endpoint));

    container.appendChild(panel);
  }

  async function send(panel, endpoint) {
    const spec = AppState.state.spec;
    const btn = panel.querySelector('[data-action="send"]');
    const errorBox = panel.querySelector('[data-role="error"]');
    const resultBox = panel.querySelector('[data-role="result"]');
    errorBox.classList.remove("is-visible");
    resultBox.classList.remove("is-visible");
    resultBox.innerHTML = "";

    const baseUrl = AppState.state.baseUrl;
    if (!baseUrl) {
      errorBox.textContent = "Set a base URL in the header above before sending a request.";
      errorBox.classList.add("is-visible");
      return;
    }

    const pathParams = {};
    panel.querySelectorAll("[data-path-param]").forEach((inp) => {
      pathParams[inp.dataset.pathParam] = inp.value;
    });
    const missingPath = Object.entries(pathParams).find(([, v]) => !v);
    if (missingPath) {
      errorBox.textContent = `"${missingPath[0]}" is required.`;
      errorBox.classList.add("is-visible");
      return;
    }

    const queryParams = {};
    panel.querySelectorAll("[data-query-param]").forEach((inp) => {
      if (inp.value) queryParams[inp.dataset.queryParam] = inp.value;
    });

    const authInput = panel.querySelector('[data-role="auth"]');
    const authToken = authInput ? authInput.value.trim() : "";
    if (endpoint.authMode === "admin" && !authToken) {
      errorBox.textContent = "This endpoint requires a bearer token.";
      errorBox.classList.add("is-visible");
      return;
    }

    let body;
    const bodyField = panel.querySelector('[data-role="body"]');
    if (bodyField) {
      const raw = bodyField.value.trim();
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch (e) {
          errorBox.textContent = "Request body isn't valid JSON: " + e.message;
          errorBox.classList.add("is-visible");
          return;
        }
      }
    }

    const url = ApiClient.buildUrl(baseUrl, endpoint.path, pathParams, queryParams);
    const headers = ApiClient.buildHeaders({ hasBody: body !== undefined, authToken });
    const bodyText = body !== undefined ? JSON.stringify(body, null, 2) : undefined;

    btn.disabled = true;
    btn.textContent = "Sending…";
    resultBox.classList.add("is-visible");
    resultBox.innerHTML = `<div class="loading-state" style="padding:24px 0"><div class="spinner"></div><p>Waiting for response…</p></div>`;

    const result = await ApiClient.execute({ url, method: endpoint.method, headers, body: bodyText });

    btn.disabled = false;
    btn.textContent = "Send request";

    resultBox.innerHTML = "";
    resultBox.appendChild(buildRequestSummary({ url, method: endpoint.method, headers, bodyText }));

    if (!result.ok) {
      errorBox.innerHTML = `Request failed — this is usually a CORS block, an unreachable base URL, or an offline network.
        <br/><span class="mono">${RenderEndpoint.escapeHtml(result.message)}</span>`;
      errorBox.classList.add("is-visible");
      return;
    }

    resultBox.appendChild(buildResponseSummary(result));
  }

  function buildRequestSummary({ url, method, headers, bodyText }) {
    const wrap = el(`<div><h3 class="section__title" style="font-size:13px">Request</h3></div>`);
    wrap.appendChild(RenderEndpoint.codeBlock(`${method} — request URL`, url, { lang: "text" }));
    const headerLines = Object.entries(headers)
      .map(([k, v]) => `${k}: ${k === "Authorization" ? "Bearer ••••••••" : v}`)
      .join("\n");
    if (headerLines) wrap.appendChild(RenderEndpoint.codeBlock("Request headers", headerLines, { lang: "text" }));
    if (bodyText) wrap.appendChild(RenderEndpoint.codeBlock("Request body", JSON.parse(bodyText)));
    return wrap;
  }

  function buildResponseSummary(result) {
    const wrap = el(`<div><h3 class="section__title" style="font-size:13px">Response</h3></div>`);
    const meta = el(`
      <div class="result-meta">
        <span class="result-status ${result.status < 400 ? "result-status--ok" : "result-status--err"}">${result.status} ${RenderEndpoint.escapeHtml(result.statusText || "")}</span>
        <span class="result-meta__item">${result.durationMs} ms</span>
      </div>
    `);
    wrap.appendChild(meta);

    const headerLines = result.headers.map(([k, v]) => `${k}: ${v}`).join("\n");
    if (headerLines) wrap.appendChild(RenderEndpoint.codeBlock("Response headers", headerLines, { lang: "text" }));

    if (result.bodyJson !== null) {
      wrap.appendChild(RenderEndpoint.codeBlock("Response body", result.bodyJson));
    } else if (result.bodyText) {
      wrap.appendChild(RenderEndpoint.codeBlock("Response body", result.bodyText, { lang: "text" }));
    } else {
      wrap.appendChild(el(`<p class="field__hint">Empty response body.</p>`));
    }
    return wrap;
  }

  return { mount };
})();
