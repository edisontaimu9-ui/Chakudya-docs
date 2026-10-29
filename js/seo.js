/** Keeps <title>, description and social tags in step with the current route. */
const Seo = (() => {
  const SITE = "Chakudya Nutrition Registry";
  const q = (sel) => document.head.querySelector(sel);
  const setMeta = (sel, value) => { const n = q(sel); if (n && value) n.setAttribute("content", value); };
  const defaults = {
    title: q("title")?.textContent || SITE,
    desc: q('meta[name="description"]')?.getAttribute("content") || "",
  };
  function clip(s, n) {
    s = String(s || "").replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s;
  }
  /** Point canonical + og:url at the current path (keeps the site origin from the static HTML). */
  function syncUrl() {
    const link = q('link[rel="canonical"]');
    if (!link) return;
    let origin;
    try { origin = new URL(link.href).origin; } catch (_) { return; }
    const path = location.pathname.replace(/index\.html$/, "");
    const url = origin + (path.endsWith("/") ? path : path + "/");
    link.setAttribute("href", url);
    setMeta('meta[property="og:url"]', url);
  }
  /** Mark the current view as not indexable (login page, not-found states) or restore normal indexing. */
  function noindex(on) {
    setMeta('meta[name="robots"]', on ? "noindex, follow" : "index, follow, max-image-preview:large");
  }
  /** set(title, description) - omit both to restore the landing-page defaults. */
  function set(title, desc) {
    syncUrl();
    noindex(false);
    const t = title ? `${title} | ${SITE}` : defaults.title;
    const d = clip(desc || defaults.desc, 160);
    document.title = t;
    setMeta('meta[name="description"]', d);
    setMeta('meta[property="og:title"]', t);
    setMeta('meta[property="og:description"]', d);
    setMeta('meta[name="twitter:title"]', t);
    setMeta('meta[name="twitter:description"]', d);
  }
  return { set, noindex, reset: () => set() };
})();
