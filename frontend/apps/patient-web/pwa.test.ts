import { describe, expect, it } from "vitest";

import { pwaOptions } from "./pwa.config";

/** Security 06 §6 + contract F11: installable manifest; the service worker never caches /api/. */

describe("PWA configuration", () => {
  const manifest = pwaOptions.manifest === false ? undefined : pwaOptions.manifest;
  const workbox = pwaOptions.workbox ?? {};

  it("has an installable manifest (name, start_url, standalone, 192 + 512 + maskable icons)", () => {
    expect(manifest?.name).toBe("MediLink Rwanda");
    expect(manifest?.short_name).toBe("MediLink");
    expect(manifest?.start_url).toBe("/");
    expect(manifest?.display).toBe("standalone");
    expect(manifest?.lang).toBe("rw");
    const icons = manifest?.icons ?? [];
    expect(icons).toContainEqual(expect.objectContaining({ sizes: "192x192", purpose: "any" }));
    expect(icons).toContainEqual(expect.objectContaining({ sizes: "512x512", purpose: "any" }));
    expect(icons).toContainEqual(
      expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
    );
  });

  it("uses token colours", () => {
    expect(manifest?.theme_color).toBe("#047857");
    expect(manifest?.background_color).toBe("#F6F8F7");
  });

  it("never caches /api/ responses", () => {
    expect(
      workbox.navigateFallbackDenylist?.some((pattern) => pattern.test("/api/v1/patient/auth/me/")),
    ).toBe(true);
    for (const rule of workbox.runtimeCaching ?? []) {
      const matchesApi =
        typeof rule.urlPattern === "function"
          ? Boolean(
              rule.urlPattern({
                url: new URL("https://medilink.rw/api/v1/patient/auth/me/"),
                request: new Request("https://medilink.rw/api/v1/patient/auth/me/"),
                event: {} as never,
                sameOrigin: true,
              }),
            )
          : false;
      if (matchesApi) expect(rule.handler).toBe("NetworkOnly");
    }
    expect(workbox.globPatterns?.join(" ")).not.toMatch(/api/);
  });

  it("does not precache the MSW worker", () => {
    expect(workbox.globIgnores).toContain("**/mockServiceWorker.js");
  });
});
