const RenderEndpoint = (() => {
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function codeBlock(label, value, { lang = "json" } = {}) {
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    const html = typeof value === "string" ? escapeHtml(value) : SchemaExample.highlight(value);
    const block = el(`
      <div class="code-block">
        <div class="code-block__head">
          <span>${label}</span>
          <button class="copy-btn" type="button">Copy</button>
        </div>
        <pre><code class="lang-${lang}">${html}</code></pre>
      </div>
    `);
    CopyModule.bind(block.querySelector(".copy-btn"), text);
    return block;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  function authPill(endpoint) {
    if (endpoint.authMode === "admin") {
      const role = endpoint.meta?.requiredRole;
      const label = role === "root" ? "Root key required" : role === "reviewer" ? "Admin (reviewer+)" : "Admin key required";
      return `<span class="pill pill--auth-admin">🔒 ${label}</span>`;
    }
    if (endpoint.authMode === "optional") {
      return `<span class="pill">Bearer optional</span>`;
    }
    return `<span class="pill pill--auth-public">Public</span>`;
  }

  function rateLimitPill(endpoint) {
    const rl = endpoint.meta?.rateLimit;
    if (!rl) return "";
    const scopeLabel = rl.scope === "admin" ? "per admin key" : "per IP";
    return `<span class="pill">⏱ ${rl.limit}/${rl.windowSeconds}s ${scopeLabel}</span>`;
  }

  function paramsTable(spec, params, kind) {
    const filtered = params.filter((p) => p.in === kind);
    if (!filtered.length) return null;
    const rows = filtered
      .map((p) => {
        const schema = SpecLoader.deref(spec, p.schema) || {};
        const type = schema.enum ? schema.enum.join(" | ") : schema.type || "string";
        return `
          <tr>
            <td><code>${escapeHtml(p.name)}</code>${p.required ? '<span class="param-required">required</span>' : ""}</td>
            <td class="param-loc">${escapeHtml(type)}</td>
            <td class="param-desc-cell">${escapeHtml(p.description || "")}${schema.default !== undefined ? ` <span class="field__hint">(default: ${escapeHtml(String(schema.default))})</span>` : ""}</td>
          </tr>`;
      })
      .join("");
    return el(`
      <table class="param-table">
        <thead><tr><th>Name</th><th>Type</th><th>Description</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `);
  }

  function statusClass(code) {
    if (code.startsWith("2")) return "status-code--2xx";
    if (code.startsWith("4")) return "status-code--4xx";
    return "status-code--5xx";
  }

  function responsesSection(spec, endpoint) {
    const wrap = el(`<div class="status-list"></div>`);
    const entries = Object.entries(endpoint.responses);
    if (!entries.length) return wrap;

    for (const [code, respRef] of entries) {
      const resp = SpecLoader.deref(spec, respRef);
      const row = el(`
        <div class="status-row">
          <span class="status-code ${statusClass(code)}">${code}</span>
          <div class="status-body">
            <div class="status-desc"></div>
          </div>
        </div>
      `);
      row.querySelector(".status-desc").textContent = resp?.description || "";
      const example = SchemaExample.forResponse(spec, respRef, code);
      if (example !== null && example !== undefined) {
        row.querySelector(".status-body").appendChild(codeBlock("Example response", example));
      }
      wrap.appendChild(row);
    }
    return wrap;
  }

  function render(endpoint, container) {
    const spec = AppState.state.spec;
    container.innerHTML = "";

    const head = el(`
      <div class="endpoint-head">
        <p class="eyebrow">${escapeHtml(endpoint.tags[0])}</p>
        <div class="endpoint-head__row">
          <span class="badge-method badge-method--lg badge-method--${endpoint.method}">${endpoint.method}</span>
          <span class="endpoint-path"></span>
          <button class="copy-btn" type="button" data-copy="path">Copy path</button>
        </div>
        <h1 class="endpoint-title"></h1>
        <p class="endpoint-desc"></p>
        <div class="pill-row">
          ${authPill(endpoint)}
          ${rateLimitPill(endpoint)}
          ${endpoint.deprecated ? '<span class="pill pill--deprecated">Deprecated</span>' : ""}
        </div>
      </div>
    `);
    head.querySelector(".endpoint-path").textContent = endpoint.path;
    head.querySelector(".endpoint-title").textContent = endpoint.summary;
    head.querySelector(".endpoint-desc").textContent = endpoint.description || "";
    CopyModule.bind(head.querySelector('[data-copy="path"]'), endpoint.path);
    container.appendChild(head);

    if (endpoint.meta?.note) {
      container.appendChild(el(`<div class="callout"><strong>Note —</strong> ${escapeHtml(endpoint.meta.note)}</div>`));
    }

    // Parameters
    const pathParams = paramsTable(spec, endpoint.parameters, "path");
    const queryParams = paramsTable(spec, endpoint.parameters, "query");
    if (pathParams || queryParams) {
      const section = el(`<div class="section"><h2 class="section__title">Parameters</h2></div>`);
      if (pathParams) {
        section.appendChild(el(`<p class="section__note">Path parameters</p>`));
        section.appendChild(pathParams);
      }
      if (queryParams) {
        section.appendChild(el(`<p class="section__note" style="margin-top:16px">Query parameters</p>`));
        section.appendChild(queryParams);
      }
      container.appendChild(section);
    }

    // Request body
    if (endpoint.requestBody) {
      const section = el(`<div class="section"><h2 class="section__title">Request body</h2></div>`);
      const content = endpoint.requestBody.content?.["application/json"];
      const schema = content ? SpecLoader.deref(spec, content.schema) : null;
      const required = schema?.required || [];
      if (schema?.properties) {
        const rows = Object.entries(schema.properties)
          .map(([name, propSchemaRef]) => {
            const propSchema = SpecLoader.deref(spec, propSchemaRef) || {};
            const type = propSchema.enum ? propSchema.enum.join(" | ") : propSchema.type || "string";
            return `
              <tr>
                <td><code>${escapeHtml(name)}</code>${required.includes(name) ? '<span class="param-required">required</span>' : ""}</td>
                <td class="param-loc">${escapeHtml(type)}</td>
                <td class="param-desc-cell">${escapeHtml(propSchema.description || "")}</td>
              </tr>`;
          })
          .join("");
        section.appendChild(el(`
          <table class="param-table">
            <thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        `));
      }
      const example = SchemaExample.forRequestBody(spec, endpoint.requestBody);
      if (example !== null && example !== undefined) {
        section.appendChild(codeBlock("Example request body", example));
      }
      container.appendChild(section);
    }

    // Example request (curl)
    const curlSection = el(`<div class="section"><h2 class="section__title">Example request</h2></div>`);
    curlSection.appendChild(buildCurlBlock(endpoint));
    container.appendChild(curlSection);

    // Responses
    const respSection = el(`<div class="section"><h2 class="section__title">Responses</h2></div>`);
    respSection.appendChild(responsesSection(spec, endpoint));
    container.appendChild(respSection);

    // Try it
    const tryItSection = el(`<div class="section"><h2 class="section__title">Try it</h2></div>`);
    TryIt.mount(endpoint, tryItSection);
    container.appendChild(tryItSection);
  }

  function buildCurlBlock(endpoint) {
    const spec = AppState.state.spec;
    const base = AppState.state.baseUrl || "https://your-worker.workers.dev";
    let path = endpoint.path;
    endpoint.parameters.filter((p) => p.in === "path").forEach((p) => {
      path = path.replace(`{${p.name}}`, `<${p.name}>`);
    });
    const queryEx = endpoint.parameters
      .filter((p) => p.in === "query" && p.required)
      .map((p) => `${p.name}=<${p.name}>`)
      .join("&");
    const url = base.replace(/\/$/, "") + path + (queryEx ? `?${queryEx}` : "");

    const lines = [`curl -X ${endpoint.method} "${url}"`];
    if (endpoint.authMode !== "public") lines.push(`  -H "Authorization: Bearer <API_KEY>"`);
    const body = SchemaExample.forRequestBody(spec, endpoint.requestBody);
    if (body !== null && body !== undefined) {
      lines.push(`  -H "Content-Type: application/json"`);
      lines.push(`  -d '${JSON.stringify(body)}'`);
    }
    const curl = lines.join(" \\\n");
    return codeBlock("curl", curl, { lang: "bash" });
  }

  return { render, codeBlock, escapeHtml };
})();
