#!/usr/bin/env node
// One-time export of all icon variants from web/public/icon-source.png.
// Re-run if the brand mark changes.
//
// Usage: cd web && npm install --save-dev sharp
//        node ../scripts/gen-icons.mjs
//
// Outputs:
//   web/public/icon-192.png       — PWA standard
//   web/public/icon-512.png       — PWA standard
//   web/public/apple-touch-icon.png (180×180) — iOS home-screen
//   web/public/favicon-32.png     — browser-tab favicon (PNG)
//   web/src/app/favicon.ico       — Next 16 picks this up automatically

import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../web/public/icon-source.png");

const requireFromWeb = createRequire(resolve(__dirname, "../web/package.json"));
const sharp = requireFromWeb("sharp");
const pngToIcoMod = requireFromWeb("png-to-ico");
const pngToIco = pngToIcoMod.default || pngToIcoMod;

async function renderPng(size, out) {
  const png = await sharp(SRC).resize(size, size, { fit: "cover" }).png().toBuffer();
  await writeFile(out, png);
  console.log("wrote", out, `(${size}×${size})`);
}

await renderPng(192, resolve(__dirname, "../web/public/icon-192.png"));
await renderPng(512, resolve(__dirname, "../web/public/icon-512.png"));
await renderPng(180, resolve(__dirname, "../web/public/apple-touch-icon.png"));
await renderPng(32, resolve(__dirname, "../web/public/favicon-32.png"));

// favicon.ico — multi-size 16+32+48 inside one .ico container.
const sizes = [16, 32, 48];
const buffers = await Promise.all(
  sizes.map((s) => sharp(SRC).resize(s, s, { fit: "cover" }).png().toBuffer()),
);
const ico = await pngToIco(buffers);
const icoOut = resolve(__dirname, "../web/src/app/favicon.ico");
await writeFile(icoOut, ico);
console.log("wrote", icoOut, "(16+32+48 multi-size .ico)");
