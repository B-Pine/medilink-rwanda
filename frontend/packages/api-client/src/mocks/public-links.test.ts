import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApiClient } from "../client";
import { createMediLinkApi, type MediLinkApi } from "../endpoints";
import { stableId } from "./features/s1-common";
import { createMockServer } from "./node";

/**
 * Public site audit 2026-11-07 (A1 #1–2): every doctor and service link on the public pages must
 * open a real page. The mock builds a fresh database on each page load, so ids a visitor can link
 * to must not change between loads, and every service a facility offers needs a catalogue entry.
 */

const BASE = "http://localhost:8000";
const { server, reset } = createMockServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

let api: MediLinkApi;
beforeEach(() => {
  api = createMediLinkApi(createApiClient({ baseUrl: BASE, getLanguage: () => "en" }));
});

async function everyProfile() {
  const page = await api.booking.search({});
  const slugs = [...new Set(page.results.map((r) => r.slug))];
  return Promise.all(slugs.map((slug) => api.booking.facility(slug)));
}

describe("public links in the mocks", () => {
  it("gives the same id for the same seed, in UUID form", () => {
    expect(stableId("kigali/dental")).toBe(stableId("kigali/dental"));
    expect(stableId("kigali/dental")).not.toBe(stableId("kigali/eye"));
    expect(stableId("x")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("keeps every doctor and service id across a reload", async () => {
    reset();
    const first = await everyProfile();
    reset(); // a new page load builds a new mock database
    const second = await everyProfile();
    const ids = (profiles: typeof first) =>
      profiles.flatMap((p) => [
        ...p.doctors.map((d) => `${p.slug}--${d.membership_id}`),
        ...p.services.map((s) => `${p.slug}/${s.id}`),
      ]);
    expect(ids(first).length).toBeGreaterThan(10);
    expect(ids(second)).toEqual(ids(first));
  });

  it("lists every offered service in the public catalogue", async () => {
    reset();
    const profiles = await everyProfile();
    const catalogue = await api.masterData.publicList("service-catalogue-items", {
      page_size: 200,
    });
    const codes = new Set(catalogue.results.map((item) => item.code));
    const offered = new Set(profiles.flatMap((p) => p.services.map((s) => s.code)));
    expect([...offered].filter((code) => !codes.has(code))).toEqual([]);
  });
});
