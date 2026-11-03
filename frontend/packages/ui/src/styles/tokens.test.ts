import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Contract checks F2 (token values equal design research 02), F7 (patient 18px / >=48px,
 * staff 15px) and F8 (text token contrast as measured), read straight from tokens.css.
 */
const css = readFileSync(resolve(import.meta.dirname, "tokens.css"), "utf8");

function block(selectorPattern: RegExp): string {
  const match = selectorPattern.exec(css);
  if (!match) throw new Error(`Block not found: ${selectorPattern}`);
  const start = css.indexOf("{", match.index) + 1;
  let depth = 1;
  let i = start;
  while (depth > 0 && i < css.length) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") depth--;
    i++;
  }
  return css.slice(start, i - 1);
}

function vars(body: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const m of body.matchAll(/(--ml-[\w-]+)\s*:\s*([^;]+);/g)) result[m[1]!] = m[2]!.trim();
  return result;
}

const light = vars(block(/^:root\s*\{/m));
const patient = vars(block(/^:root\[data-density="patient"\]\s*\{/m));
const darkMedia = vars(block(/:root:not\(\[data-theme="light"\]\)\s*\{/));
const darkExplicit = vars(block(/^:root\[data-theme="dark"\]\s*\{/m));
const dark = { ...light, ...darkMedia };

const hex = (value: string | undefined) => value?.toLowerCase();

// ---- WCAG 2.x contrast ----
type Rgb = [number, number, number];
function parseHex(value: string): Rgb {
  const n = Number.parseInt(value.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Resolve a token value to RGB, including `color-mix(in srgb, #a N%, #b)`. */
function rgb(value: string): Rgb {
  const mix = /color-mix\(in srgb,\s*(#[0-9a-f]{6})\s+(\d+)%,\s*(#[0-9a-f]{6})\)/i.exec(value);
  if (mix) {
    const a = parseHex(mix[1]!);
    const b = parseHex(mix[3]!);
    const p = Number(mix[2]) / 100;
    return [0, 1, 2].map((i) => Math.round(a[i]! * p + b[i]! * (1 - p))) as Rgb;
  }
  return parseHex(value);
}
function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(fg: string, bg: string): number {
  const [l1, l2] = [luminance(rgb(fg)), luminance(rgb(bg))].sort((a, b) => b - a) as [
    number,
    number,
  ];
  return (l1 + 0.05) / (l2 + 0.05);
}
const px = (rem: string | undefined) =>
  Number.parseFloat(rem ?? "0") * (rem?.endsWith("rem") ? 16 : 1);

// Light brand values follow the public website brief (upgrade 11 §2, 2026-11-02).
describe("design tokens (F2): values equal design research 02", () => {
  it("light theme spot checks", () => {
    expect(hex(light["--ml-action-primary"])).toBe("#168451");
    expect(hex(light["--ml-action-primary-hover"])).toBe("#11744a");
    expect(hex(light["--ml-action-primary-text"])).toBe("#ffffff");
    expect(hex(light["--ml-text-muted"])).toBe("#5d6a62");
    expect(hex(light["--ml-border-input"])).toBe("#7b8a83");
    expect(hex(light["--ml-bg-page"])).toBe("#f7f9f7");
    expect(hex(light["--ml-text-primary"])).toBe("#17231d");
    expect(hex(light["--ml-focus-ring"])).toBe("#059669");
    expect(hex(light["--ml-forest"])).toBe("#123d2b");
  });

  it("dark theme spot checks", () => {
    expect(hex(dark["--ml-bg-page"])).toBe("#0a1310");
    expect(hex(dark["--ml-bg-surface"])).toBe("#101c17");
    expect(hex(dark["--ml-action-primary"])).toBe("#34d399");
    expect(hex(dark["--ml-action-primary-text"])).toBe("#022c22");
    expect(hex(dark["--ml-border-input"])).toBe("#5b6e66");
    expect(hex(dark["--ml-text-muted"])).toBe("#8fa198");
  });

  it("system-dark and explicit-dark blocks are identical", () => {
    expect(darkExplicit).toEqual(darkMedia);
  });

  it("status colours match the measured table", () => {
    expect(hex(light["--ml-success-text"])).toBe("#15803d");
    expect(hex(light["--ml-warning-text"])).toBe("#b45309");
    expect(hex(light["--ml-danger-text"])).toBe("#b91c1c");
    expect(hex(light["--ml-info-text"])).toBe("#1d4ed8");
    expect(hex(dark["--ml-success-text"])).toBe("#4ade80");
    expect(hex(dark["--ml-danger-text"])).toBe("#f87171");
  });
});

describe("density (F7)", () => {
  it("staff body text is 15px with 40px controls", () => {
    expect(px(light["--ml-font-size-body"])).toBe(15);
    expect(px(light["--ml-target-min"])).toBeGreaterThanOrEqual(40);
  });

  it("patient body text is 18px, targets >= 48px, primary actions 56px", () => {
    expect(px(patient["--ml-font-size-body"])).toBe(18);
    expect(px(patient["--ml-control-height"])).toBeGreaterThanOrEqual(48);
    expect(px(patient["--ml-target-min"])).toBeGreaterThanOrEqual(48);
    expect(px(patient["--ml-control-height-primary"])).toBe(56);
    expect(px(patient["--ml-font-size-caption"])).toBeGreaterThanOrEqual(14);
  });
});

describe("contrast of text tokens (F8), both themes", () => {
  const themes = { light, dark } as const;

  it.each(Object.entries(themes))("%s: text >= 4.5:1 on page and surface", (_name, t) => {
    for (const text of [
      "--ml-text-primary",
      "--ml-text-secondary",
      "--ml-text-muted",
      "--ml-link",
    ]) {
      for (const bg of ["--ml-bg-page", "--ml-bg-surface", "--ml-bg-raised", "--ml-bg-subtle"]) {
        expect(contrast(t[text]!, t[bg]!), `${text} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each(Object.entries(themes))("%s: controls and focus >= 3:1", (_name, t) => {
    expect(contrast(t["--ml-border-input"]!, t["--ml-bg-surface"]!)).toBeGreaterThanOrEqual(3);
    expect(contrast(t["--ml-focus-ring"]!, t["--ml-bg-surface"]!)).toBeGreaterThanOrEqual(3);
    expect(contrast(t["--ml-focus-ring"]!, t["--ml-bg-page"]!)).toBeGreaterThanOrEqual(3);
  });

  it.each(Object.entries(themes))("%s: button and status text >= 4.5:1", (_name, t) => {
    expect(
      contrast(t["--ml-action-primary-text"]!, t["--ml-action-primary"]!),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(t["--ml-action-primary-text"]!, t["--ml-action-primary-hover"]!),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(t["--ml-brand-subtle-text"]!, t["--ml-brand-subtle-bg"]!),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t["--ml-danger-solid-text"]!, t["--ml-danger-solid"]!)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrast(t["--ml-accent-text"]!, t["--ml-accent"]!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t["--ml-violet-solid-text"]!, t["--ml-violet-solid"]!)).toBeGreaterThanOrEqual(
      4.5,
    );
    for (const tone of ["success", "warning", "danger", "info", "violet"]) {
      expect(contrast(t[`--ml-${tone}-text`]!, t[`--ml-${tone}-bg`]!), tone).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it("matches the measured ratios of design 02 (±0.05)", () => {
    expect(contrast(light["--ml-text-primary"]!, "#ffffff")).toBeCloseTo(16.22, 1);
    expect(contrast(light["--ml-text-muted"]!, "#ffffff")).toBeCloseTo(5.67, 1);
    expect(contrast(light["--ml-action-primary"]!, "#ffffff")).toBeCloseTo(4.72, 1);
    expect(contrast(dark["--ml-action-primary-text"]!, dark["--ml-action-primary"]!)).toBeCloseTo(
      7.88,
      1,
    );
    expect(contrast(light["--ml-border-input"]!, "#ffffff")).toBeCloseTo(3.62, 1);
  });

  it("queue violet (design 02 §4): #6D28D9 on #F5F3FF, priority solid with white text 7.10:1", () => {
    expect(hex(light["--ml-violet-text"])).toBe("#6d28d9");
    expect(hex(light["--ml-violet-bg"])).toBe("#f5f3ff");
    expect(contrast(light["--ml-violet-solid-text"]!, light["--ml-violet-solid"]!)).toBeCloseTo(
      7.1,
      1,
    );
  });

  it.each(Object.entries(themes))("%s: violet and outline badges >= 4.5:1 on surface", (_n, t) => {
    for (const text of ["--ml-violet-text", "--ml-danger-text", "--ml-warning-text"]) {
      expect(contrast(t[text]!, t["--ml-bg-surface"]!), text).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("deep forest text >= 4.5:1", () => {
    expect(contrast(light["--ml-on-forest"]!, light["--ml-forest"]!)).toBeGreaterThanOrEqual(7);
    expect(contrast(light["--ml-on-forest-muted"]!, light["--ml-forest"]!)).toBeGreaterThanOrEqual(
      7,
    );
  });
});

describe("chart palettes (design 02 §6)", () => {
  it("six series colours in the validated order, per theme", () => {
    const series = (t: Record<string, string>) =>
      [1, 2, 3, 4, 5, 6].map((i) => hex(t[`--ml-chart-${i}`]));
    expect(series(light)).toEqual([
      "#059669",
      "#2a78d6",
      "#eb6834",
      "#6250d6",
      "#eda100",
      "#e87ba4",
    ]);
    expect(series(dark)).toEqual([
      "#059669",
      "#3987e5",
      "#d95926",
      "#9085e9",
      "#c98500",
      "#d55181",
    ]);
  });

  it("sequential emerald: 4 steps from the design ramps, ordered by lightness", () => {
    const steps = (t: Record<string, string>) => [1, 2, 3, 4].map((i) => hex(t[`--ml-seq-${i}`]));
    expect(steps(light)).toEqual(["#10b981", "#059669", "#047857", "#065f46"]);
    // Dark ramp #065F46 → #047857 → #059669 → #10B981 → #34D399, 4 of its 5 steps (same legend).
    expect(steps(dark)).toEqual(["#065f46", "#047857", "#10b981", "#34d399"]);
    expect(light["--ml-seq-5"]).toBeUndefined();
    // Magnitude reads as distance from the surface: each step is further from it than the last.
    for (const t of [light, dark]) {
      const c = [1, 2, 3, 4].map((i) => contrast(t[`--ml-seq-${i}`]!, t["--ml-bg-surface"]!));
      expect([...c].sort((a, b) => a - b)).toEqual(c);
    }
  });
});
