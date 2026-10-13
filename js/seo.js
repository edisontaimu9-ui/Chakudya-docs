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
  /** set(title, description) - omit both to restore the landing-page defaults. */
  function set(title, desc) {
    const t = title ? `${title} | ${SITE}` : defaults.title;
    const d = clip(desc || defaults.desc, 160);
    document.title = t;
    setMeta('meta[name="description"]', d);
    setMeta('meta[property="og:title"]', t);
    setMeta('meta[property="og:description"]', d);
    setMeta('meta[name="twitter:title"]', t);
    setMeta('meta[name="twitter:description"]', d);
  }
  return { set, reset: () => set() };
})();
