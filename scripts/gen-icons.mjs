#!/usr/bin/env node
// One-time export of all icon variants. Two sources:
//   web/public/icon-source.svg → app/PWA icons (192, 512, apple-touch 180)
//   web/public/icon-source.png → favicons (32 + multi-size .ico)
//
// Re-run if either source changes:
//   cd web && npm install --save-dev sharp png-to-ico
//   node ../scripts/gen-icons.mjs

import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SVG_SRC = resolve(__dirname, "../web/public/icon-source.svg");
const PNG_SRC = resolve(__dirname, "../web/public/icon-source.png");

const requireFromWeb = createRequire(resolve(__dirname, "../web/package.json"));
const sharp = requireFromWeb("sharp");
const pngToIcoMod = requireFromWeb("png-to-ico");
const pngToIco = pngToIcoMod.default || pngToIcoMod;

async function renderFromSvg(size, out) {
  const png = await sharp(SVG_SRC, { density: 1024 })
    .resize(size, size, { fit: "cover" })
    .png()
    .toBuffer();
  await writeFile(out, png);
  console.log("wrote", out, `(${size}×${size})  [from svg]`);
}

async function renderFromPng(size, out) {
  const png = await sharp(PNG_SRC).resize(size, size, { fit: "cover" }).png().toBuffer();
  await writeFile(out, png);
  console.log("wrote", out, `(${size}×${size})  [from png]`);
}

// PWA + app icons → mountain/sun SVG
await renderFromSvg(192, resolve(__dirname, "../web/public/icon-192.png"));
await renderFromSvg(512, resolve(__dirname, "../web/public/icon-512.png"));
await renderFromSvg(180, resolve(__dirname, "../web/public/apple-touch-icon.png"));

// Favicons → keep the earth-globe PNG as source
await renderFromPng(32, resolve(__dirname, "../web/public/favicon-32.png"));

const sizes = [16, 32, 48];
const buffers = await Promise.all(
  sizes.map((s) => sharp(PNG_SRC).resize(s, s, { fit: "cover" }).png().toBuffer()),
);
const ico = await pngToIco(buffers);
const icoOut = resolve(__dirname, "../web/src/app/favicon.ico");
await writeFile(icoOut, ico);
console.log("wrote", icoOut, "(16+32+48 multi-size .ico) [from png]");
