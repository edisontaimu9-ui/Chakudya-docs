const SpecLoader = (() => {
  const METHODS = ["get", "post", "put", "patch", "delete"];

  /** Resolve a local "#/a/b/c" $ref against the root spec document. */
  function resolveRef(spec, ref) {
    if (!ref || !ref.startsWith("#/")) return null;
    return ref
      .slice(2)
      .split("/")
      .reduce((node, key) => (node ? node[key] : undefined), spec);
  }

  /** Follow $ref one or more levels until a concrete (non-$ref) node is reached. */
  function deref(spec, node) {
    let seen = 0;
    while (node && node.$ref && seen < 20) {
      node = resolveRef(spec, node.$ref);
      seen++;
    }
    return node;
  }

  function resolveParams(spec, params) {
    return (params || []).map((p) => deref(spec, p));
  }

  /**
   * How a route is authenticated, from its `security` list (op-level, else the spec default):
   *  public   - no credential (security: [] or no security at all)
   *  optional - works without a key, a bearer key is also accepted
   *  login    - developer login token (/developer/keys)
   *  secret   - shared webhook secret (POST /rag/webhook)
   *  key      - any valid API key (consumer, reviewer or admin)
   *  admin    - needs an admin/reviewer/root key (set by the caller from metadata or the summary)
   */
  function authModeFor(security) {
    if (!Array.isArray(security) || !security.length) return "public";
    const open = security.some((req) => req && Object.keys(req).length === 0);
    const has = (name) => security.some((req) => req && Object.prototype.hasOwnProperty.call(req, name));
    if (has("bearerAuth")) return open ? "optional" : "key";
    if (has("loginToken")) return "login";
    if (has("webhookSecret")) return "secret";
    return open ? "public" : "key";
  }

  /** Routes the spec marks "(admin)" or "(root key only)" refuse consumer keys. */
  function isAdminOnly(op, meta) {
    if (meta && meta.requiredRole) return true;
    return /\((admin|root key only)[^)]*\)/i.test(op.summary || "");
  }

  function findMetadata(metadata, method, path) {
    const hit = metadata?.rules?.find((r) => r.method === method && r.path === path);
    return hit || metadata?.default || null;
  }

  function slugFor(method, path) {
    return (method + path)
      .toLowerCase()
      .replace(/[{}]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function buildEndpoints(spec, metadata) {
    const endpoints = [];

    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      for (const method of METHODS) {
        const op = pathItem[method];
        if (!op) continue;

        const security = op.security !== undefined ? op.security : spec.security;
        const meta = findMetadata(metadata, method.toUpperCase(), path);
        let authMode = authModeFor(security);
        if (authMode === "key" && isAdminOnly(op, meta)) authMode = "admin";

        endpoints.push({
          id: `${method.toUpperCase()} ${path}`,
          slug: slugFor(method, path),
          method: method.toUpperCase(),
          path,
          tags: op.tags && op.tags.length ? op.tags : ["Other"],
          summary: op.summary || path,
          description: op.description || "",
          deprecated: !!op.deprecated,
          authMode,
          parameters: resolveParams(spec, op.parameters),
          requestBody: op.requestBody ? deref(spec, op.requestBody) : null,
          responses: op.responses || {},
          meta,
        });
      }
    }

    // Every operation in the spec is documented - key-gated and admin routes included.
    // Each one carries an `authMode` so the UI can label what credential it needs.
    const publicEndpoints = endpoints;

    // Stable order: as declared in the spec's tags list, "Other" last.
    const tagOrder = (spec.tags || []).map((t) => t.name);
    publicEndpoints.sort((a, b) => {
      const ta = tagOrder.indexOf(a.tags[0]);
      const tb = tagOrder.indexOf(b.tags[0]);
      if (ta !== tb) return (ta === -1 ? 999 : ta) - (tb === -1 ? 999 : tb);
      if (a.path !== b.path) return a.path.localeCompare(b.path);
      return METHODS.indexOf(a.method.toLowerCase()) - METHODS.indexOf(b.method.toLowerCase());
    });

    return publicEndpoints;
  }

  function buildGroups(spec, endpoints) {
    const tagDefs = spec.tags || [];
    const order = tagDefs.map((t) => t.name);
    const byTag = new Map();

    for (const ep of endpoints) {
      const tag = ep.tags[0];
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(ep);
    }

    const tags = [...byTag.keys()].sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    return tags.map((tag) => ({
      tag,
      description: tagDefs.find((t) => t.name === tag)?.description || "",
      endpoints: byTag.get(tag),
    }));
  }

  async function load() {
    const [spec, metadata] = await Promise.all([
      fetch("/openapi.json").then((r) => {
        if (!r.ok) throw new Error(`openapi.json: HTTP ${r.status}`);
        return r.json();
      }),
      fetch("/data/endpoint-metadata.json")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);

    const endpoints = buildEndpoints(spec, metadata);
    const groups = buildGroups(spec, endpoints);

    AppState.set({ spec, metadata, endpoints, groups });
    return { spec, metadata, endpoints, groups };
  }

  return { load, resolveRef, deref, resolveParams };
})();
