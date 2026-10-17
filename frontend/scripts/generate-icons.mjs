#!/usr/bin/env node
/**
 * Generate favicons, PWA icons and web-sized logos for both apps from brand/logo/source/.
 *
 *   pnpm icons        (from frontend/)
 *
 * Sources (read only, never modified): brand/logo/source/
 *   concept-a-pin-cross.png   main symbol (transparent background)
 *   logo-horizontal-raw.png   symbol + "MediLink / RWANDA" lockup (white background)
 *   app-icon-raw.png          white pin on emerald rounded square
 *   app-icon-dark-raw.png     mint pin on deep forest rounded square
 *
 * Output (committed) in apps/{staff-web,patient-web}/public/:
 *   favicon.ico (16/32/48), favicon-16.png, favicon-32.png, apple-touch-icon.png (180, opaque),
 *   icon-192.png, icon-512.png, icon-maskable-512.png (symbol in the central ~60%),
 *   icon-dark-512.png, brand/medilink-{logo-horizontal,symbol}-{color,white}-<size>.{webp,png}
 *
 * The pin shapes are extracted from the raw app icons as masks and redrawn on the exact design
 * tokens (emerald-700 #047857, deep forest #022C22, emerald-400 #34D399), so icons match the UI.
 * Replace with exports from the vector masters once brand/logo/svg/ exists.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pngToIco from "png-to-ico";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, "..");
const source = resolve(frontend, "../brand/logo/source");
const targets = ["apps/staff-web/public", "apps/patient-web/public"].map((p) =>
  resolve(frontend, p),
);

// Design tokens (docs/design/research/02-color-system.md)
const EMERALD_700 = "#047857";
const FOREST = "#022C22";
const MINT = "#34D399";
const WHITE = "#FFFFFF";

const hexToRgb = (hex) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};
const clamp01 = (v) => Math.min(1, Math.max(0, v));

async function readRaw(file) {
  const { data, info } = await sharp(join(source, file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Alpha mask (1 channel) from a function of (r, g, b, a), over an optional crop. */
function buildMask(raw, fn, crop = { left: 0, top: 0, width: raw.width, height: raw.height }) {
  const mask = Buffer.alloc(crop.width * crop.height);
  for (let y = 0; y < crop.height; y++) {
    for (let x = 0; x < crop.width; x++) {
      const i = ((y + crop.top) * raw.width + (x + crop.left)) * 4;
      mask[y * crop.width + x] = Math.round(
        255 * clamp01(fn(raw.data[i], raw.data[i + 1], raw.data[i + 2], raw.data[i + 3])),
      );
    }
  }
  return { mask, width: crop.width, height: crop.height };
}

/** RGBA image of one colour with the given alpha mask, trimmed to its content. */
async function solidFromMask({ mask, width, height }, hex) {
  const { r, g, b } = hexToRgb(hex);
  const rgba = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    rgba[p * 4] = r;
    rgba[p * 4 + 1] = g;
    rgba[p * 4 + 2] = b;
    rgba[p * 4 + 3] = mask[p];
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
    .then((buf) => sharp(buf).trim({ threshold: 1 }).png().toBuffer());
}

function innerCrop(raw, insetRatio) {
  const inset = Math.round(raw.width * insetRatio);
  return { left: inset, top: inset, width: raw.width - 2 * inset, height: raw.height - 2 * inset };
}

/** Square icon: background (rounded or full-bleed) + the pin scaled to `pinRatio` of the height. */
async function icon({ size, background, pin, pinRatio, rounded }) {
  const radius = rounded ? Math.round(size * 0.22) : 0;
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${background}"/></svg>`,
  );
  const pinHeight = Math.round(size * pinRatio);
  const pinImage = await sharp(pin).resize({ height: pinHeight, fit: "inside" }).png().toBuffer();
  const meta = await sharp(pinImage).metadata();
  return sharp(bg)
    .composite([
      {
        input: pinImage,
        left: Math.round((size - meta.width) / 2),
        top: Math.round((size - meta.height) / 2),
      },
    ])
    .png({ compressionLevel: 9, palette: size <= 48 ? false : true, quality: 100 })
    .toBuffer();
}

/** Remove the near-white background of a raster and return straight (un-premultiplied) RGBA. */
function knockOutWhite(raw, { mono = null, dropAccent = false } = {}) {
  const out = Buffer.alloc(raw.width * raw.height * 4);
  const monoRgb = mono ? hexToRgb(mono) : null;
  for (let p = 0; p < raw.width * raw.height; p++) {
    const i = p * 4;
    const [r, g, b, a0] = [raw.data[i], raw.data[i + 1], raw.data[i + 2], raw.data[i + 3]];
    // Coverage against white: darkest channel distance from white, with levels to clean the edges.
    let a = clamp01((255 - Math.min(r, g, b) - 10) / (150 - 10)) * (a0 / 255);
    let [cr, cg, cb] = [r, g, b];
    if (a > 0) {
      cr = Math.round(clamp01((r - (1 - a) * 255) / a / 255) * 255);
      cg = Math.round(clamp01((g - (1 - a) * 255) / a / 255) * 255);
      cb = Math.round(clamp01((b - (1 - a) * 255) / a / 255) * 255);
    }
    const isAccent = cr > 170 && cg > 110 && cb < 120 && cr - cb > 100;
    if (dropAccent && isAccent) a = 0;
    if (monoRgb) [cr, cg, cb] = [monoRgb.r, monoRgb.g, monoRgb.b];
    out[i] = cr;
    out[i + 1] = cg;
    out[i + 2] = cb;
    out[i + 3] = Math.round(a * 255);
  }
  return out;
}

/** Normalise an existing alpha channel (soft, noisy edges → clean), optional mono recolour. */
function cleanAlpha(raw, { mono = null, dropAccent = false } = {}) {
  const out = Buffer.alloc(raw.width * raw.height * 4);
  const monoRgb = mono ? hexToRgb(mono) : null;
  for (let p = 0; p < raw.width * raw.height; p++) {
    const i = p * 4;
    const [r, g, b, a0] = [raw.data[i], raw.data[i + 1], raw.data[i + 2], raw.data[i + 3]];
    let a = clamp01((a0 - 20) / (235 - 20));
    const isAccent = r > 170 && g > 110 && b < 120 && r - b > 100;
    if (dropAccent && isAccent) a = 0;
    const rgb = monoRgb ? [monoRgb.r, monoRgb.g, monoRgb.b] : [r, g, b];
    out[i] = rgb[0];
    out[i + 1] = rgb[1];
    out[i + 2] = rgb[2];
    out[i + 3] = Math.round(a * 255);
  }
  return out;
}

async function rgbaToTrimmed(rgba, width, height) {
  const png = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
  return sharp(png).trim({ threshold: 1 }).png().toBuffer();
}

async function webAssets(name, image, resize) {
  const resized = sharp(image).resize(resize);
  const webp = await resized.clone().webp({ quality: 90, alphaQuality: 100, effort: 6 }).toBuffer();
  const png = await resized
    .clone()
    .png({ compressionLevel: 9, palette: true, quality: 95 })
    .toBuffer();
  const meta = await sharp(png).metadata();
  return [
    { path: `brand/${name}.webp`, data: webp, width: meta.width, height: meta.height },
    { path: `brand/${name}.png`, data: png, width: meta.width, height: meta.height },
  ];
}

async function main() {
  // Pins (masks) from the raw app icons; crop inside the rounded square to avoid its white corners.
  const appIcon = await readRaw("app-icon-raw.png");
  const whitePin = await solidFromMask(
    buildMask(
      appIcon,
      (r, g, b) => (Math.min(r, g, b) - 140) / (235 - 140),
      innerCrop(appIcon, 0.15),
    ),
    WHITE,
  );
  const darkIcon = await readRaw("app-icon-dark-raw.png");
  const mintPin = await solidFromMask(
    buildMask(darkIcon, (_r, g) => (g - 80) / (200 - 80), innerCrop(darkIcon, 0.15)),
    MINT,
  );

  const files = [];
  const favicon16 = await icon({
    size: 16,
    background: EMERALD_700,
    pin: whitePin,
    pinRatio: 0.78,
    rounded: true,
  });
  const favicon32 = await icon({
    size: 32,
    background: EMERALD_700,
    pin: whitePin,
    pinRatio: 0.74,
    rounded: true,
  });
  const favicon48 = await icon({
    size: 48,
    background: EMERALD_700,
    pin: whitePin,
    pinRatio: 0.72,
    rounded: true,
  });
  files.push({ path: "favicon-16.png", data: favicon16 });
  files.push({ path: "favicon-32.png", data: favicon32 });
  files.push({ path: "favicon.ico", data: await pngToIco([favicon16, favicon32, favicon48]) });
  // iOS masks the icon itself: full-bleed and opaque (no transparency).
  files.push({
    path: "apple-touch-icon.png",
    data: await sharp(
      await icon({
        size: 180,
        background: EMERALD_700,
        pin: whitePin,
        pinRatio: 0.6,
        rounded: false,
      }),
    )
      .flatten({ background: EMERALD_700 })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer(),
  });
  files.push({
    path: "icon-192.png",
    data: await icon({
      size: 192,
      background: EMERALD_700,
      pin: whitePin,
      pinRatio: 0.64,
      rounded: true,
    }),
  });
  files.push({
    path: "icon-512.png",
    data: await icon({
      size: 512,
      background: EMERALD_700,
      pin: whitePin,
      pinRatio: 0.64,
      rounded: true,
    }),
  });
  // Maskable: full-bleed background, pin inside the central safe zone (~60%, here 54% high).
  files.push({
    path: "icon-maskable-512.png",
    data: await icon({
      size: 512,
      background: EMERALD_700,
      pin: whitePin,
      pinRatio: 0.54,
      rounded: false,
    }),
  });
  files.push({
    path: "icon-dark-512.png",
    data: await icon({
      size: 512,
      background: FOREST,
      pin: mintPin,
      pinRatio: 0.64,
      rounded: true,
    }),
  });

  // Logos for the UI: colour (light surfaces) and white (deep forest panels, dark theme).
  const lockup = await readRaw("logo-horizontal-raw.png");
  const lockupColor = await rgbaToTrimmed(knockOutWhite(lockup), lockup.width, lockup.height);
  const lockupWhite = await rgbaToTrimmed(
    knockOutWhite(lockup, { mono: WHITE, dropAccent: true }),
    lockup.width,
    lockup.height,
  );
  const symbol = await readRaw("concept-a-pin-cross.png");
  const symbolColor = await rgbaToTrimmed(cleanAlpha(symbol), symbol.width, symbol.height);
  const symbolWhite = await rgbaToTrimmed(
    cleanAlpha(symbol, { mono: WHITE, dropAccent: true }),
    symbol.width,
    symbol.height,
  );

  const sizes = [];
  for (const [name, image, resize] of [
    ["medilink-logo-horizontal-color-120", lockupColor, { height: 120 }],
    ["medilink-logo-horizontal-white-120", lockupWhite, { height: 120 }],
    ["medilink-symbol-color-192", symbolColor, { height: 192 }],
    ["medilink-symbol-white-192", symbolWhite, { height: 192 }],
  ]) {
    const assets = await webAssets(name, image, resize);
    files.push(...assets);
    sizes.push(`${name}: ${assets[0].width}x${assets[0].height}`);
  }

  for (const target of targets) {
    for (const file of files) {
      const out = join(target, file.path);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, file.data);
    }
  }

  const total = files.reduce((sum, f) => sum + f.data.length, 0);
  console.log(`Wrote ${files.length} files to each of:\n  ${targets.join("\n  ")}`);
  for (const f of files)
    console.log(`  ${f.path.padEnd(48)} ${(f.data.length / 1024).toFixed(1)} KB`);
  console.log(`Total per app: ${(total / 1024).toFixed(1)} KB`);
  console.log(sizes.join("\n"));
}

await main();
