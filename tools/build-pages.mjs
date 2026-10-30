#!/usr/bin/env node
// Generates one real, crawlable HTML file per page of the docs site, plus sitemap.xml and 404.html.
//
//   node tools/build-pages.mjs            write everything
//   node tools/build-pages.mjs --check    list what would change, exit 1 if the files are stale
//
// Why: the app used "#/docs/..." URLs and Google ignores everything after the "#", so only the home
// page could ever be indexed. Now every page has a path (/docs/errors/, /api/get-foods/, ...). Each file
// below is index.html with its own <title>, description, canonical URL, Open Graph tags, breadcrumb
// JSON-LD and a small static article (heading, summary, parameters, links). js/main.js then renders
// the full interactive page on top, exactly as before.
//
// Run it after ANY change to openapi.json, index.html, or the guide / legal page lists:
//   node tools/build-pages.mjs && node tools/stamp-sw.mjs
//
// No dependencies. It runs the real js/ modules (spec-loader, render-docs, render-legal) in a sandbox so
// the page list, titles and descriptions can never drift from what the app shows.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");
const read = (f) => readFileSync(join(root, f), "utf8");

const template = read("index.html");
const SITE = (template.match(/<link rel="canonical" href="(https?:\/\/[^/"]+)\/?"/) || [])[1];
if (!SITE) throw new Error("Cannot find the canonical site URL in index.html");
const SITE_NAME = "Chakudya Nutrition Registry";
const TODAY = new Date().toISOString().slice(0, 10);

// Directories that contain ONLY generated pages (wiped and rewritten each run).
const GENERATED_DIRS = ["docs", "api", "legal", "nutrimind", "submit", "support", "account"];

/* ───────────────────────── load the app's own modules ───────────────────────── */

const noop = () => {};
const deep = () => new Proxy(function () {}, {
  get: (_, k) => (k === Symbol.toPrimitive ? () => "" : deep()),
  apply: () => deep(),
  construct: () => deep(),
});
const store = { getItem: () => null, setItem: noop, removeItem: noop };
const sandbox = {
  console, URL, URLSearchParams, setTimeout, clearTimeout, setInterval: noop, clearInterval: noop,
  fetch: async (p) => {
    const f = join(root, String(p).replace(/^\//, ""));
    if (!existsSync(f)) return { ok: false, status: 404 };
    const text = readFileSync(f, "utf8");
    return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
  },
  document: deep(), localStorage: store, sessionStorage: store,
  navigator: { onLine: true, userAgent: "build-pages" },
  location: { hash: "", pathname: "/", search: "", origin: SITE, href: SITE + "/" },
  history: { replaceState: noop, pushState: noop },
  matchMedia: () => ({ matches: false, addEventListener: noop }),
  addEventListener: noop,
};
const ctx = vm.createContext(sandbox);
sandbox.window = sandbox;
for (const f of ["config", "state", "spec-loader", "render-endpoint", "render-docs", "render-legal"]) {
  vm.runInContext(read(`js/${f}.js`), ctx, { filename: `js/${f}.js` });
}
const ev = (code) => vm.runInContext(code, ctx);
await ev("SpecLoader.load()");
const endpoints = ev("AppState.state.endpoints");
const groups = ev("AppState.state.groups");
const SECTIONS = ev("RenderDocs.SECTIONS");
const docsMeta = (id, sub) => ev(`RenderDocs.meta(${JSON.stringify(id)}, ${JSON.stringify(sub || null)})`);
const subpages = (id) => ev(`RenderDocs.subpages(${JSON.stringify(id)})`);
const refCategoryFor = (tag) => ev(`RenderDocs.refCategoryFor(${JSON.stringify(tag)})`);
const legalPages = ev("RenderLegal.PAGES");

/* ───────────────────────── helpers ───────────────────────── */

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s, n) => {
  s = String(s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s;
};
const url = (path) => SITE + path;
const paragraphs = (text) => String(text || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  .map((p) => `<p>${esc(p).replace(/\n/g, "<br />")}</p>`).join("\n");

/* ───────────────────────── the page list ───────────────────────── */

/** Each page: { path, title, desc, crumbs: [[label, path]...], body, noindex?, priority, freq } */
const pages = [];
const pageTitle = (t) => `${t} | ${SITE_NAME}`;

const guideLinks = (id) => subpages(id).map((s) =>
  `<li><a href="/docs/${id}/${s.id}/">${esc(s.title)}</a> - ${esc(s.blurb)}</li>`).join("\n");
const otherGuides = SECTIONS.map((s) => `<li><a href="/docs/${s.id}/">${esc(s.title)}</a> - ${esc(s.blurb)}</li>`).join("\n");
const endpointItem = (e) =>
  `<li><a href="/api/${e.slug}/"><code>${e.method} ${esc(e.path)}</code></a> - ${esc(e.summary)}</li>`;

for (const g of SECTIONS) {
  const m = docsMeta(g.id);
  const subs = subpages(g.id);
  let extra = "";
  if (g.id === "api-reference") {
    extra = groups.map((grp) =>
      `<h2>${esc(grp.tag)}</h2>\n<ul>\n${grp.endpoints.map(endpointItem).join("\n")}\n</ul>`).join("\n");
  } else if (subs.length) {
    extra = `<h2>In this guide</h2>\n<ul>\n${guideLinks(g.id)}\n</ul>`;
  }
  pages.push({
    path: `/docs/${g.id}/`,
    title: `${m.title} - API Documentation`,
    desc: m.blurb,
    crumbs: [["Documentation", "/docs/getting-started/"], [m.title, null]],
    heading: m.title,
    body: `<p>${esc(m.blurb)}</p>\n${extra}\n<h2>All guides</h2>\n<ul>\n${otherGuides}\n</ul>`,
    priority: g.id === "getting-started" || g.id === "api-reference" ? "0.9" : "0.8",
    freq: "weekly",
  });
  for (const s of subs) {
    const sm = docsMeta(g.id, s.id);
    let list = "";
    if (g.id === "api-reference") {
      const eps = endpoints.filter((e) => refCategoryFor(e.tags[0])?.id === s.id);
      if (eps.length) list = `<h2>Routes in this category</h2>\n<ul>\n${eps.map(endpointItem).join("\n")}\n</ul>`;
    }
    pages.push({
      path: `/docs/${g.id}/${s.id}/`,
      title: `${sm.title} - API Documentation`,
      desc: sm.blurb,
      crumbs: [["Documentation", "/docs/getting-started/"], [m.title, `/docs/${g.id}/`], [s.title, null]],
      heading: s.title,
      body: `<p>${esc(sm.blurb)}</p>\n${list}\n<h2>More in ${esc(m.title)}</h2>\n<ul>\n${guideLinks(g.id)}\n</ul>`,
      priority: "0.7",
      freq: "weekly",
    });
  }
}

// Keep these strings in step with the Seo.set(...) calls in js/main.js.
pages.push({
  path: "/nutrimind/",
  title: "Chakudya NutriMind - Nutrition assistant",
  desc: "Ask Chakudya NutriMind about Malawian foods, nutrients and nutrition guidance. Answers come with sources from the Chakudya Nutrition Registry.",
  crumbs: [["NutriMind", null]],
  heading: "Chakudya NutriMind",
  body: "<p>Ask about Malawian foods, nutrients and nutrition guidance. Answers come with sources from the Chakudya Nutrition Registry.</p>",
  priority: "0.8", freq: "monthly",
});
pages.push({
  path: "/submit/",
  title: "Submit a packaged food",
  desc: "Add a missing packaged food to the Chakudya Nutrition Registry by photographing its label or typing in the details. Every submission is reviewed before it is published.",
  crumbs: [["Submit a packaged food", null]],
  heading: "Submit a packaged food",
  body: "<p>Add a missing packaged food to the Chakudya Nutrition Registry by photographing its label or typing in the details. Every submission is reviewed before it is published.</p>",
  priority: "0.6", freq: "monthly",
});
pages.push({
  path: "/support/",
  title: "Support Chakudya",
  desc: "Help keep the Chakudya Nutrition Registry free and online. Contribute by mobile money, bank transfer or card through PayChangu.",
  crumbs: [["Support", null]],
  heading: "Support Chakudya",
  body: "<p>Chakudya is a free nutrition data registry for Malawi. If it is useful to you, a contribution helps keep the API online and the food data growing. Payments are handled securely by PayChangu: mobile money, bank transfer or card.</p>",
  priority: "0.4", freq: "monthly",
});
pages.push({
  path: "/account/",
  title: "Developer account and API keys",
  desc: "Sign in to create and manage Chakudya API keys for higher rate limits.",
  crumbs: [["Developer account", null]],
  heading: "Developer account and API keys",
  body: "<p>Sign in to create and manage Chakudya API keys for higher rate limits.</p>",
  noindex: true,
});
for (const p of legalPages) {
  pages.push({
    path: `/legal/${p.id}/`,
    title: p.title,
    desc: p.lead,
    crumbs: [["Legal", null], [p.title, null]],
    heading: p.title,
    body: `<p>${esc(p.lead)}</p>`,
    priority: "0.3", freq: "yearly",
  });
}

for (const e of endpoints) {
  const params = e.parameters || [];
  const responses = Object.entries(e.responses || {});
  const auth = { public: "No API key needed", key: "API key required", admin: "Admin API key required" }[e.authMode] || "";
  const bodyTypes = e.requestBody && e.requestBody.content ? Object.keys(e.requestBody.content) : [];
  const parts = [
    `<p><code>${e.method} ${esc(e.path)}</code>${auth ? ` &middot; ${esc(auth)}` : ""}${e.deprecated ? " &middot; Deprecated" : ""}</p>`,
    paragraphs(e.description),
  ];
  if (params.length) {
    parts.push(`<h2>Parameters</h2>\n<ul>\n${params.map((p) =>
      `<li><code>${esc(p.name)}</code> (${esc(p.in)}${p.required ? ", required" : ""})${p.description ? " - " + esc(clip(p.description, 240)) : ""}</li>`).join("\n")}\n</ul>`);
  }
  if (bodyTypes.length) parts.push(`<h2>Request body</h2>\n<p>Content type: ${bodyTypes.map((t) => `<code>${esc(t)}</code>`).join(", ")}</p>`);
  if (responses.length) {
    parts.push(`<h2>Responses</h2>\n<ul>\n${responses.map(([code, r]) =>
      `<li><code>${esc(code)}</code>${r && r.description ? " - " + esc(clip(r.description, 200)) : ""}</li>`).join("\n")}\n</ul>`);
  }
  parts.push(`<p><a href="/docs/api-reference/">Back to the API reference</a></p>`);
  pages.push({
    path: `/api/${e.slug}/`,
    title: `${e.summary} - API Reference`,
    desc: `${e.method} ${e.path}. ${e.description || e.summary}`,
    crumbs: [["API Reference", "/docs/api-reference/"], [e.tags[0], null], [e.summary, null]],
    heading: e.summary,
    body: parts.filter(Boolean).join("\n"),
    priority: "0.6", freq: "monthly",
  });
}

/* ───────────────────────── render one page from index.html ───────────────────────── */

const sub = (html, re, to, what) => {
  if (!re.test(html)) throw new Error(`index.html template: cannot find ${what}`);
  return html.replace(re, () => to);
};

function render(page) {
  const full = pageTitle(page.title);
  const desc = clip(page.desc, 160);
  const canonical = url(page.path);
  let h = template;

  h = sub(h, /<title>[\s\S]*?<\/title>/, `<title>${esc(full)}</title>`, "<title>");
  h = sub(h, /<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${esc(desc)}" />`, "meta description");
  h = sub(h, /<meta name="robots" content="[^"]*"\s*\/?>/,
    `<meta name="robots" content="${page.noindex ? "noindex, follow" : "index, follow, max-image-preview:large"}" />`, "meta robots");
  h = sub(h, /<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${canonical}" />`, "canonical");
  h = sub(h, /<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${canonical}" />`, "og:url");
  h = sub(h, /<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${esc(full)}" />`, "og:title");
  h = sub(h, /<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${esc(desc)}" />`, "og:description");
  h = sub(h, /<meta name="twitter:title" content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${esc(full)}" />`, "twitter:title");
  h = sub(h, /<meta name="twitter:description" content="[^"]*"\s*\/?>/, `<meta name="twitter:description" content="${esc(desc)}" />`, "twitter:description");

  // Structured data: breadcrumbs for this page (the WebSite / Organization graph stays on the home page).
  // Middle crumbs without a page of their own (a tag name, "Legal") are left out; the last crumb is this page.
  const trail = [["Home", "/"], ...page.crumbs.filter(([, path], i, all) => path || i === all.length - 1)];
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map(([name, path], i) => ({
      "@type": "ListItem", position: i + 1, name,
      item: url(path || page.path),
    })),
  };
  h = sub(h, /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n</script>`, "JSON-LD");

  // Inner pages link the four first-paint stylesheets instead of repeating ~40 KB of inline CSS in every file.
  h = sub(h, /<!-- critical-css:start -->[\s\S]*?<!-- critical-css:end -->/,
    ["theme", "layout", "components", "landing"].map((n) => `<link rel="stylesheet" href="/css/${n}.css" />`).join("\n"), "critical-css markers");

  // Static article in place of the loading spinner + landing hero; js/main.js replaces it on load.
  const crumbHtml = trail.map(([name, path], i) => {
    const last = i === trail.length - 1;
    return last ? `<span aria-current="page">${esc(name)}</span>` : `<a href="${path}">${esc(name)}</a>`;
  }).join(" &rsaquo; ");
  const article = `<!-- content:start -->
      <article class="static-page">
        <nav aria-label="Breadcrumb" class="field__hint">${crumbHtml}</nav>
        <h1>${esc(page.heading)}</h1>
        ${page.body}
      </article>
      <!-- content:end -->`;
  h = sub(h, /<!-- content:start -->[\s\S]*?<!-- content:end -->/, article, "content markers");

  return h.replace("<!doctype html>", "<!doctype html>\n<!-- Generated by tools/build-pages.mjs from index.html. Edit index.html, then re-run the tool. -->");
}

/* ───────────────────────── 404 page ───────────────────────── */

pages.push({
  path: "/404.html", file: "404.html",
  title: "Page not found",
  desc: "This page does not exist. Browse the Chakudya API documentation instead.",
  crumbs: [["Page not found", null]],
  heading: "Page not found",
  body: `<p>There is nothing at this address. Try one of these:</p>
<ul>
<li><a href="/">Home</a></li>
<li><a href="/docs/getting-started/">Getting started</a></li>
<li><a href="/docs/api-reference/">API reference</a></li>
<li><a href="/nutrimind/">NutriMind</a></li>
</ul>`,
  noindex: true, special: true,
});

/* ───────────────────────── sitemap ───────────────────────── */

const sitemap = () => {
  const rows = [
    { loc: "/", priority: "1.0", freq: "weekly" },
    ...pages.filter((p) => !p.noindex).map((p) => ({ loc: p.path, priority: p.priority, freq: p.freq })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows.map((r) => `  <url>
    <loc>${url(r.loc)}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${r.freq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`).join("\n")}
</urlset>
`;
};

/* ───────────────────────── write ───────────────────────── */

const outputs = new Map();
for (const p of pages) {
  const file = p.file || join(p.path.replace(/^\//, ""), "index.html");
  outputs.set(file, render(p));
}
outputs.set("sitemap.xml", sitemap());

if (CHECK) {
  // lastmod changes daily, so compare everything except sitemap dates.
  const strip = (s) => s.replace(/<lastmod>[^<]*<\/lastmod>/g, "");
  let stale = 0;
  for (const [file, content] of outputs) {
    const f = join(root, file);
    if (!existsSync(f) || strip(readFileSync(f, "utf8")) !== strip(content)) { console.error("STALE:", file); stale++; }
  }
  if (stale) { console.error(`${stale} generated file(s) out of date. Run: node tools/build-pages.mjs`); process.exit(1); }
  console.log(`OK: ${outputs.size} generated files are up to date.`);
} else {
  for (const d of GENERATED_DIRS) rmSync(join(root, d), { recursive: true, force: true });
  for (const [file, content] of outputs) {
    const f = join(root, file);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, content);
  }
  const indexable = pages.filter((p) => !p.noindex).length + 1;
  console.log(`Wrote ${outputs.size} files: ${pages.length - 1} pages + 404.html + sitemap.xml (${indexable} URLs).`);
}
