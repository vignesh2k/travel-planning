#!/usr/bin/env node
// One-time PNG export from web/public/icon-source.svg.
// Re-run if the brand mark changes.
//
// Usage: cd web && npm install --save-dev sharp
//        node ../scripts/gen-icons.mjs

import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../web/public/icon-source.svg");

// sharp lives in web/node_modules — load it from there explicitly.
const requireFromWeb = createRequire(resolve(__dirname, "../web/package.json"));
const sharp = requireFromWeb("sharp");

async function render(size) {
  const svg = await readFile(SRC);
  const png = await sharp(svg, { density: 320 })
    .resize(size, size, { fit: "contain", background: { r: 254, g: 249, b: 241, alpha: 1 } })
    .png()
    .toBuffer();
  const out = resolve(__dirname, `../web/public/icon-${size}.png`);
  await writeFile(out, png);
  console.log("wrote", out);
}

await render(192);
await render(512);
