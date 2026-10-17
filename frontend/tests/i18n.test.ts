import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// @ts-expect-error -- plain JS script shared with `pnpm i18n:review`
import { CATALOGS, flatten, renderReview } from "../scripts/i18n-review.mjs";

/** Contract check F3 (resource files complete in rw/en/fr) and the Kinyarwanda review list. */

type Tree = { [key: string]: string | Tree };
const frontend = resolve(import.meta.dirname, "..");
const catalogs = CATALOGS as { name: string; dir: string }[];
const flat = flatten as (tree: Tree) => Record<string, string>;

function load(dir: string, language: string): Record<string, string> {
  return flat(JSON.parse(readFileSync(resolve(frontend, dir, `${language}.json`), "utf8")) as Tree);
}

describe.each(catalogs)("$name", ({ dir }) => {
  const en = load(dir, "en");
  const rw = load(dir, "rw");
  const fr = load(dir, "fr");

  it("rw and fr have exactly the keys of en", () => {
    expect(Object.keys(rw).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  it("has no empty strings", () => {
    for (const [language, strings] of Object.entries({ rw, en, fr })) {
      for (const [key, value] of Object.entries(strings)) {
        expect(value.trim(), `${language}:${key}`).not.toBe("");
      }
    }
  });

  it("keeps interpolation placeholders identical across languages", () => {
    const placeholders = (text: string) => (text.match(/\{\{\s*\w+\s*\}\}/g) ?? []).sort();
    for (const key of Object.keys(en)) {
      expect(placeholders(rw[key] ?? ""), `rw:${key}`).toEqual(placeholders(en[key]!));
      expect(placeholders(fr[key] ?? ""), `fr:${key}`).toEqual(placeholders(en[key]!));
    }
  });
});

describe("i18n-review.md", () => {
  it("lists every Kinyarwanda key as needing native-speaker review and is up to date", () => {
    const committed = readFileSync(resolve(frontend, "i18n-review.md"), "utf8").replace(
      /\r\n/g,
      "\n",
    );
    expect(committed).toBe((renderReview as () => string)());
    for (const { dir } of catalogs) {
      for (const key of Object.keys(load(dir, "en"))) {
        expect(committed).toContain(`| \`${key}\` |`);
      }
    }
    expect(committed).not.toContain("**MISSING**");
  });
});
