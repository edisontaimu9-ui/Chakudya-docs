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

  /** true = requires a bearer token, false = public, per this operation's `security`. */
  function isAdminAuth(security) {
    if (!Array.isArray(security)) return false;
    return security.some((req) => req && Object.prototype.hasOwnProperty.call(req, "bearerAuth"));
  }
  function isPublicAllowed(security) {
    if (!Array.isArray(security)) return true;
    return security.some((req) => req && Object.keys(req).length === 0);
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
        const admin = isAdminAuth(security);
        const publicOk = isPublicAllowed(security);
        const authMode = admin && !publicOk ? "admin" : admin && publicOk ? "optional" : "public";

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
          meta: findMetadata(metadata, method.toUpperCase(), path),
        });
      }
    }

    // Public docs only ship public, unauthenticated routes - admin-gated
    // and bearer-optional operations are dropped here so they never show
    // up in the sidebar, search, routing, or the endpoint list below.
    const publicEndpoints = endpoints.filter((e) => e.authMode === "public");

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
      fetch("openapi.json").then((r) => {
        if (!r.ok) throw new Error(`openapi.json: HTTP ${r.status}`);
        return r.json();
      }),
      fetch("data/endpoint-metadata.json")
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
