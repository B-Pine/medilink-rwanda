import { describe, expect, it } from "vitest";

import {
  createI18n,
  DEFAULT_LANGUAGE,
  flattenKeys,
  uiResources,
  withFeatureResources,
} from "./index";

describe("ui i18n", () => {
  it("defaults to Kinyarwanda and sets <html lang>", () => {
    const i18n = createI18n({ rw: {}, en: {}, fr: {} }, { persist: false });
    expect(DEFAULT_LANGUAGE).toBe("rw");
    expect(i18n.language).toBe("rw");
    expect(document.documentElement.lang).toBe("rw");
  });

  it("restores the stored language choice", () => {
    window.localStorage.setItem("medilink.language", "fr");
    const i18n = createI18n({ rw: {}, en: {}, fr: {} });
    expect(i18n.language).toBe("fr");
  });

  it("has the same keys in rw, en and fr", () => {
    const en = Object.keys(flattenKeys(uiResources.en)).sort();
    expect(Object.keys(flattenKeys(uiResources.rw)).sort()).toEqual(en);
    expect(Object.keys(flattenKeys(uiResources.fr)).sort()).toEqual(en);
  });

  it("has no empty strings", () => {
    for (const language of ["rw", "en", "fr"] as const) {
      for (const [key, value] of Object.entries(flattenKeys(uiResources[language]))) {
        expect(value.trim(), `${language}:${key}`).not.toBe("");
      }
    }
  });
});

describe("withFeatureResources (shared-file protocol)", () => {
  const base = { rw: { app: "MediLink" }, en: { app: "MediLink" }, fr: { app: "MediLink" } };

  it("adds each feature under its own namespace key", () => {
    const merged = withFeatureResources(base, {
      onboarding: {
        rw: { title: "Iyandikisha" },
        en: { title: "Registration" },
        fr: { title: "Inscription" },
      },
    });
    expect(merged.en).toEqual({ app: "MediLink", onboarding: { title: "Registration" } });
    expect(merged.rw.onboarding).toEqual({ title: "Iyandikisha" });
    expect(base.en).toEqual({ app: "MediLink" }); // input untouched
  });

  it("refuses a feature key that collides with app strings", () => {
    expect(() => withFeatureResources(base, { app: { rw: {}, en: {}, fr: {} } })).toThrow(
      /already used/,
    );
  });
});
