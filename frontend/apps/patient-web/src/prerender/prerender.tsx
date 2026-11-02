import type { MediLinkApi, PublicFacility } from "@medilink/api-client";
import { dehydrate } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from "react-router";

import { AppProviders, createServices } from "../app/services";
import { routes } from "../app/routes";
import { FACILITY_PATH, isPrerenderedPath, PRERENDER_DATA_ID, scriptJson } from "./shared";
import type { PrerenderData } from "./shared";

/**
 * Prerender entry, called at build time by vite-prerender-plugin (vite.config.ts) for each public
 * page, in Node. Static pages are hydrated in the browser; facility pages are snapshots of the
 * facility data the API returned at build time (for search engines and a fast first paint).
 */

/** The only query data a pre-rendered page may carry (FacilityPage's public profile). */
export const PUBLIC_QUERY_ROOT = "discovery";
const LANGUAGE = "rw"; // Kinyarwanda by default (design 06 H5)
const MAX_SEARCH_PAGES = 50;

interface PrerenderResult {
  html: string;
  links?: Set<string>;
  head?: {
    lang: string;
    title: string;
    elements: Set<{ type: string; props: Record<string, string> }>;
  };
}

/**
 * ADR 0008: a pre-rendered facility page carries static, public facts only (name, type, services,
 * address, hours). Fees, queue load and next free times change during the day, so they are left
 * out and load in the browser; a stale build never shows a wrong price or time.
 */
export function staticFacility(facility: PublicFacility): PublicFacility {
  return {
    ...facility,
    services: facility.services.map((service) => ({
      ...service,
      queue_load: null,
      waiting: null,
      wait_range: null,
      next_slot_at: null,
    })),
  };
}

type Env = Record<string, string | undefined>;
const processEnv = (): Env => (globalThis as { process?: { env: Env } }).process?.env ?? {};

/**
 * Fetch for build time. A mock build (VITE_USE_MOCKS=true) answers from the contract mocks. A real
 * build calls the API with a small cookie jar: Node's fetch keeps no cookies, and the public
 * search is a POST that needs the CSRF cookie next to its token.
 */
async function buildFetch(): Promise<typeof fetch> {
  if (import.meta.env.VITE_USE_MOCKS === "true") {
    const [{ getResponse, RequestHandler }, { createMockApi }] = await Promise.all([
      import("msw"),
      import("@medilink/api-client/mocks"),
    ]);
    // HTTP handlers only: the WebSocket mocks can't answer a fetch.
    const handlers = createMockApi().handlers.filter((h) => h instanceof RequestHandler);
    return async (input, init) => {
      const request = new Request(input, init);
      return (await getResponse(handlers, request)) ?? new Response(null, { status: 404 });
    };
  }
  const jar = new Map<string, string>();
  return async (input, init) => {
    const request = new Request(input, init);
    if (jar.size) {
      request.headers.set("Cookie", [...jar].map(([name, value]) => `${name}=${value}`).join("; "));
    }
    // Never let an unreachable API hold the build: give up after 15 s.
    const response = await fetch(request, { signal: AbortSignal.timeout(15_000) });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair = ""] = cookie.split(";");
      const at = pair.indexOf("=");
      if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
    }
    return response;
  };
}

/**
 * Every facility the public search returns. Without a reachable API (a CI build) there are none,
 * unless PRERENDER_STRICT=1 asks the build to fail instead (release builds).
 */
export async function facilityPaths(api: MediLinkApi): Promise<string[]> {
  const slugs = new Set<string>();
  try {
    let seen = 0;
    for (let page = 1; page <= MAX_SEARCH_PAGES; page++) {
      const result = await api.booking.search({ page });
      for (const row of result.results) slugs.add(row.slug);
      seen += result.results.length;
      if (result.results.length === 0 || seen >= result.count) break;
    }
  } catch (error) {
    if (processEnv().PRERENDER_STRICT === "1") throw error;
    console.warn(`[prerender] no facility pages: the public search failed (${String(error)})`);
  }
  return [...slugs].sort().map((slug) => `/facilities/${encodeURIComponent(slug)}`);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#x27": "'" };

type Unrefable = { unref?: () => void };

/** Unref after the caller's synchronous setup: in Node, setting `onmessage` refs a port again. */
const unrefSoon = (...ports: unknown[]) =>
  queueMicrotask(() => ports.forEach((port) => (port as Unrefable).unref?.()));

/**
 * Build time only: message ports opened while pre-rendering (React's browser server renderer
 * opens a MessageChannel, the MSW WebSocket mocks a BroadcastChannel) must not keep the build
 * process alive after the last page. Unref them, as Node allows.
 */
function unrefMessagePorts() {
  const g = globalThis as {
    MessageChannel?: typeof MessageChannel;
    BroadcastChannel?: typeof BroadcastChannel;
  };
  const Channel = g.MessageChannel;
  if (Channel && !("unrefd" in Channel)) {
    g.MessageChannel = class extends Channel {
      static unrefd = true;
      constructor() {
        super();
        unrefSoon(this.port1, this.port2);
      }
    };
  }
  const Broadcast = g.BroadcastChannel;
  if (Broadcast && !("unrefd" in Broadcast)) {
    g.BroadcastChannel = class extends Broadcast {
      static unrefd = true;
      constructor(name: string) {
        super(name);
        unrefSoon(this);
      }
    };
  }
}

/** Plain text of rendered markup (the plugin escapes the <title> itself). */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#x27);/g, (_, name: string) => ENTITIES[name]!)
    .replace(/\s+/g, " ")
    .trim();

export async function prerender({ url }: { url: string }): Promise<PrerenderResult | null> {
  const path = new URL(url, "http://localhost").pathname.replace(/\/$/, "") || "/";
  if (!isPrerenderedPath(path)) return null;

  unrefMessagePorts();
  const services = createServices({
    language: LANGUAGE,
    persistLanguage: false,
    fetch: await buildFetch(),
  });
  const { api, queryClient, i18n } = services;

  let description = i18n.t("home.description");
  const facility = FACILITY_PATH.test(path);
  if (facility) {
    const slug = decodeURIComponent(path.split("/")[2]!);
    try {
      // Same key as FacilityPage, so the page renders from this data.
      const data = await queryClient.fetchQuery({
        queryKey: [PUBLIC_QUERY_ROOT, "facility", slug],
        queryFn: async () => staticFacility(await api.booking.facility(slug)),
      });
      const about = data.description_i18n[LANGUAGE] || data.description_i18n.en;
      if (about) description = about;
    } catch {
      console.warn(`[prerender] skipped ${path}: the facility could not be loaded`);
      return null;
    }
  }

  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request(new URL(path, "http://localhost")));
  if (context instanceof Response) return null; // a redirect: nothing to pre-render

  const router = createStaticRouter(handler.dataRoutes, context);
  const { renderToString } = await import("react-dom/server");
  const markup = renderToString(
    <StrictMode>
      <AppProviders services={services}>
        <StaticRouterProvider router={router} context={context} hydrate={false} />
      </AppProviders>
    </StrictMode>,
  );

  const data: PrerenderData = {
    path,
    language: LANGUAGE,
    hydrate: !facility,
    // Public discovery data only: never a session, a patient or anything behind a login.
    queries: dehydrate(queryClient, {
      shouldDehydrateQuery: (query) =>
        query.queryKey[0] === PUBLIC_QUERY_ROOT && query.state.status === "success",
    }),
  };
  const links =
    path === "/"
      ? new Set([
          "/for-facilities",
          // static public pages (upgrade 11 §9: pre-rendering where supported)
          "/how-it-works",
          "/about",
          "/privacy",
          "/terms",
          "/accessibility",
          ...(await facilityPaths(api)),
        ])
      : new Set<string>();
  // Drop the cache: its garbage-collection timers would keep the build process alive.
  queryClient.clear();
  const heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(markup)?.[1];
  const suffix = i18n.t("app.titleSuffix");
  const title = heading ? `${text(heading)} · ${suffix}` : suffix;

  return {
    html: `${markup}<script type="application/json" id="${PRERENDER_DATA_ID}">${scriptJson(data)}</script>`,
    links,
    head: {
      lang: LANGUAGE,
      title,
      elements: new Set([{ type: "meta", props: { name: "description", content: description } }]),
    },
  };
}
