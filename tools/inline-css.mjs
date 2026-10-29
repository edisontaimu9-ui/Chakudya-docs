#!/usr/bin/env node
// Inlines the first-paint stylesheets into index.html so the page paints without 4 extra requests.
// Sources stay in css/ (edit those). Run after ANY change to theme/layout/components/landing.css:
//   node tools/inline-css.mjs && node tools/stamp-sw.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = ["theme", "layout", "components", "landing"];

const minify = (css) => css
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s+/g, " ")
  .replace(/\s*([{};,>])\s*/g, "$1")
  .replace(/;}/g, "}")
  .trim();

const css = FILES.map((n) => minify(readFileSync(join(root, "css", n + ".css"), "utf8"))).join("");
const htmlPath = join(root, "index.html");
const html = readFileSync(htmlPath, "utf8");
const re = /<!-- critical-css:start -->[\s\S]*?<!-- critical-css:end -->/;
if (!re.test(html)) throw new Error("critical-css markers not found in index.html");
writeFileSync(htmlPath, html.replace(re, () => `<!-- critical-css:start -->\n<style>${css}</style>\n<!-- critical-css:end -->`));
console.log(`Inlined ${FILES.length} stylesheets (${(css.length / 1024).toFixed(1)} KB) into index.html`);
