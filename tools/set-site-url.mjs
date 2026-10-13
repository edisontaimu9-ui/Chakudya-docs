#!/usr/bin/env node
// Replace the https://SITE_URL placeholder with your real site address.
// Usage: node tools/set-site-url.mjs https://docs.example.com
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = (process.argv[2] || "").replace(/\/+$/, "");
if (!/^https:\/\/[^/\s]+(\/[^\s]*)?$/.test(url)) { console.error("Usage: node tools/set-site-url.mjs https://your-site.example"); process.exit(1); }
for (const f of ["index.html", "robots.txt", "sitemap.xml"]) {
  const p = join(root, f);
  const s = readFileSync(p, "utf8");
  writeFileSync(p, s.split("https://SITE_URL").join(url));
  console.log("updated", f);
}
