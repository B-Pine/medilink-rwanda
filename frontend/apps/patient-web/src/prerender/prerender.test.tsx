import type { PublicFacility } from "@medilink/api-client";
import { describe, expect, it, vi } from "vitest";

import { routes } from "../app/routes";
import { prerender } from "./prerender";
import {
  isPrerenderedPath,
  loadLazyMatches,
  PRERENDER_DATA_ID,
  scriptJson,
  takePrerenderData,
  type PrerenderData,
} from "./shared";

/** Design 06 H8: indexable public pages, pre-rendered at build time (issue #91). */

function dataOf(html: string): PrerenderData {
  const match = new RegExp(
    `<script type="application/json" id="${PRERENDER_DATA_ID}">(.*?)</script>`,
  ).exec(html);
  if (!match) throw new Error("no prerender data");
  return JSON.parse(match[1]!) as PrerenderData;
}

describe("prerender (build time)", () => {
  it("renders the landing page in Kinyarwanda, with a title and the pages to crawl next", async () => {
    const result = await prerender({ url: "/" });
    expect(result).not.toBeNull();
    const { html, head, links } = result!;
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('href="/for-facilities"');
    expect(head?.lang).toBe("rw");
    expect(head?.title).toMatch(/ · MediLink Rwanda$/);
    expect([...head!.elements][0]).toMatchObject({ type: "meta", props: { name: "description" } });
    const crawl = [...links!];
    expect(crawl).toContain("/for-facilities");
    expect(crawl.filter((l) => /^\/facilities\/[^/]+$/.test(l)).length).toBeGreaterThan(0);
    expect(dataOf(html)).toMatchObject({ path: "/", language: "rw", hydrate: true });
  });

  it("renders the facilities page", async () => {
    const result = await prerender({ url: "/for-facilities" });
    expect(result!.html.match(/<h1\b/g)).toHaveLength(1);
    expect(dataOf(result!.html)).toMatchObject({ path: "/for-facilities", hydrate: true });
  });

  it("renders a facility profile from the build's data, as a snapshot to replace", async () => {
    const landing = await prerender({ url: "/" });
    const facility = [...landing!.links!].find((l) => l.startsWith("/facilities/"))!;
    const result = await prerender({ url: facility });
    const data = dataOf(result!.html);
    expect(data).toMatchObject({ path: facility, hydrate: false });
    const query = data.queries.queries.find((q) => q.queryKey[1] === "facility");
    const facilityData = query?.state.data as PublicFacility;
    const name = facilityData.name;
    // ADR 0008: no queue load or next free time in a build-time snapshot (U-01: no fees at all)
    for (const service of facilityData.services) {
      expect(service).toMatchObject({ queue_load: null, next_slot_at: null });
    }
    expect(result!.html).not.toMatch(/\d RWF/);
    expect(result!.html).toContain(name);
    expect(result!.head?.title).toContain(name);
    // phase 5: schema.org data for search engines, static facts only (no waits or times)
    const ld = [...result!.head!.elements].find((e) => e.props.type === "application/ld+json");
    const json = JSON.parse(ld!.props.textContent!) as Record<string, unknown>;
    expect(json).toMatchObject({ "@context": "https://schema.org", name });
    expect(JSON.stringify(json)).not.toMatch(/waiting|next_slot|queue/);
  });

  it("gives each reading page its own description, and a canonical address when the site URL is set", async () => {
    vi.stubEnv("VITE_SITE_URL", "https://medilink.example");
    try {
      const how = await prerender({ url: "/how-it-works" });
      const help = await prerender({ url: "/help" });
      const desc = (r: typeof how) =>
        [...r!.head!.elements].find((e) => e.props.name === "description")!.props.content;
      expect(desc(how)).not.toBe(desc(help));
      expect([...how!.head!.elements]).toContainEqual({
        type: "link",
        props: { rel: "canonical", href: "https://medilink.example/how-it-works" },
      });
      expect([...how!.head!.elements].some((e) => e.props.property === "og:title")).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("skips private pages and unknown facilities", async () => {
    expect(await prerender({ url: "/login" })).toBeNull();
    expect(await prerender({ url: "/home" })).toBeNull();
    expect(await prerender({ url: "/facilities/no-such-place" })).toBeNull();
    expect(isPrerenderedPath("/facilities/a/b")).toBe(false);
  });
});

describe("prerender (browser side)", () => {
  it("escapes the data block so facility text can't close the script", () => {
    const json = scriptJson({ text: "</script><script>alert(1)</script>" });
    expect(json).not.toContain("<");
    expect(JSON.parse(json)).toEqual({ text: "</script><script>alert(1)</script>" });
  });

  it("takes the data only when it was rendered for this path", () => {
    const make = () => {
      const root = document.createElement("div");
      const script = document.createElement("script");
      script.type = "application/json";
      script.id = PRERENDER_DATA_ID;
      script.textContent = scriptJson({ path: "/", language: "rw", hydrate: true, queries: {} });
      root.append(document.createElement("main"), script);
      return root;
    };
    const root = make();
    expect(takePrerenderData(root, "/")).toMatchObject({ path: "/" });
    expect(root.querySelector("script")).toBeNull(); // removed before hydration
    // the app shell for /login never carries the landing page's data
    expect(takePrerenderData(make(), "/login")).toBeNull();
  });

  it("loads the lazy route of the current path before hydrating", async () => {
    // The real route table, as main.tsx does (each test file has its own module instance).
    await loadLazyMatches(routes, "/for-facilities");
    const match = routes[0]!.children!.find((r) => r.path === "/for-facilities");
    expect(match?.lazy).toBeUndefined();
    expect(match?.Component).toBeTypeOf("function");
  });
});
