/**
 * Path-based routing (History API) so every page has its own crawlable URL.
 *
 * A "route" is the same string the old hash router used (without "#/"):
 *   ""                       landing page                   ->  /
 *   "docs/errors"            a guide                        ->  /docs/errors/
 *   "docs/examples/foods"    a guide sub-page               ->  /docs/examples/foods/
 *   "nutrimind" | "submit" | "support" | "account" | "legal/privacy"    ->  /<route>/
 *   "get-foods"              an endpoint slug               ->  /api/get-foods/
 *
 * Old links like  /#/docs/errors  still work: they are rewritten to the real path on load.
 * Links written as  href="#/..."  in the render modules are turned into real hrefs by fixLinks().
 */
const Router = (() => {
  const SECTION_ROOTS = new Set(["docs", "nutrimind", "submit", "support", "account", "legal", "reference"]);
  let handler = () => {};

  const clean = (s) => String(s || "").replace(/^\/+|\/+$/g, "");

  /** "/docs/errors/" -> "docs/errors";  "/api/get-foods/" -> "get-foods";  "/" -> "" */
  function pathToRoute(pathname) {
    let p = clean(String(pathname || "").replace(/index\.html$/, ""));
    if (p.startsWith("api/")) p = p.slice(4);
    return p;
  }

  /** "docs/errors" -> "/docs/errors/";  "get-foods" -> "/api/get-foods/";  "" -> "/" */
  function routeToPath(route) {
    const r = clean(route);
    if (!r) return "/";
    const first = r.split("/")[0];
    return SECTION_ROOTS.has(first) ? `/${r}/` : `/api/${r}/`;
  }

  /** A legacy "#/docs/errors" hash (but never an auth token hash) -> route, else null. */
  function legacyHashRoute() {
    const h = location.hash;
    if (!/^#\/./.test(h) && h !== "#/") return null;
    if (/access_token=|error_description=|type=recovery/.test(h)) return null;
    return clean(h.slice(2));
  }

  /** The current route. Converts a legacy hash URL to its real path first. */
  function current() {
    const legacy = legacyHashRoute();
    if (legacy !== null) {
      history.replaceState(null, "", routeToPath(legacy));
    }
    return pathToRoute(location.pathname);
  }

  function go(route, opt = {}) {
    const target = routeToPath(route);
    if (opt.replace) history.replaceState(null, "", target);
    else if (target !== location.pathname + location.hash) history.pushState(null, "", target);
    handler();
  }

  /** Rewrite href="#/x" links under root into real, crawlable paths. */
  function fixLinks(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const list = [...scope.querySelectorAll('a[href^="#/"]')];
    if (root && root.matches && root.matches('a[href^="#/"]')) list.push(root);
    list.forEach((a) => a.setAttribute("href", routeToPath(a.getAttribute("href").slice(2))));
  }

  const FILE_EXT = /\.[a-z0-9]{1,8}$/i;

  function init(onRoute) {
    handler = onRoute;

    window.addEventListener("popstate", () => handler());

    // Internal links navigate without a reload.
    document.addEventListener("click", (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const raw = a.getAttribute("href");
      let route = null;
      if (raw.startsWith("#/")) {
        route = clean(raw.slice(2));
      } else if (raw.startsWith("/") && !raw.startsWith("//")) {
        const u = new URL(a.href);
        if (u.origin !== location.origin || FILE_EXT.test(u.pathname)) return;
        const r = pathToRoute(u.pathname);
        const first = r.split("/")[0];
        const isApp = r === "" || SECTION_ROOTS.has(first) || u.pathname.startsWith("/api/");
        if (!isApp) return;
        route = r;
      }
      if (route === null) return;
      e.preventDefault();
      go(route);
    });

    // Keep any real hrefs written as "#/..." crawlable, including nodes added later.
    fixLinks(document);
    if ("MutationObserver" in window) {
      new MutationObserver((muts) => {
        for (const m of muts) m.addedNodes.forEach((n) => { if (n.nodeType === 1) fixLinks(n); });
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  return { init, go, current, pathToRoute, routeToPath, fixLinks };
})();
