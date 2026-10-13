#!/usr/bin/env node
// Stamp sw.js with a hash of every precached file, and verify the lists match the disk.
// Usage (from the site root): node tools/stamp-sw.mjs        (write)
//                             node tools/stamp-sw.mjs --check (verify only, exit 1 if stale)
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const swPath = join(root, "sw.js");
const sw = readFileSync(swPath, "utf8");

function list(name) {
  const m = sw.match(new RegExp("const " + name + " = \\[([\\s\\S]*?)\\];"));
  if (!m) throw new Error("Cannot find " + name + " in sw.js");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}
const files = [...list("CORE"), ...list("OPTIONAL"), ...list("DATA")];
let bad = 0;
for (const f of files) {
  if (f === "./") continue;
  if (!existsSync(join(root, f))) { console.error("MISSING:", f); bad++; }
}
// Every script/stylesheet referenced by index.html must be precached.
const html = readFileSync(join(root, "index.html"), "utf8");
for (const m of html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)) {
  if (!files.includes(m[1])) { console.error("NOT PRECACHED (used by index.html):", m[1]); bad++; }
}
if (bad) process.exit(1);

const h = createHash("sha256");
for (const f of files.filter((f) => f !== "./").sort()) {
  h.update(f + "\0");
  h.update(readFileSync(join(root, f)));
}
const build = h.digest("hex").slice(0, 12);
const next = sw.replace(/const BUILD = "[^"]*";/, `const BUILD = "${build}";`);
if (process.argv.includes("--check")) {
  if (next !== sw) { console.error("sw.js BUILD is stale. Run: node tools/stamp-sw.mjs"); process.exit(1); }
  console.log("sw.js BUILD is current:", build); process.exit(0);
}
if (next !== sw) writeFileSync(swPath, next);
console.log(`Stamped sw.js BUILD=${build} (${files.length} files checked)`);
