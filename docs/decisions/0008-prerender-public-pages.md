# ADR 0008 — Pre-render public patient-web pages at build time

Status: Accepted (2026-10-31) · Built in remediation R8 ([#91](https://github.com/B-Pine/medilink-rwanda/issues/91)) · Resolves [S5 contract](../architecture/contracts/sprint-05-booking.md) D-3

## Context

[ADR 0006](0006-separate-frontend-and-backend-hosting.md) hosts `patient-web` as a static build on `medilink.rw`, with no server-side rendering, and says public pages need pre-rendering for search engines. The S5 contract (D-3) left the tool to a later decision. Design 06 (H8) asks for public pages that load fast on 3G and show content before JavaScript runs.

Options considered:

| Option | For | Against |
|---|---|---|
| Server-side rendering (a Node server in front of `patient-web`) | Always fresh HTML | A new server to run, secure and scale in Rwanda; breaks the static-host model of ADR 0006 |
| Client-side only | Nothing to build | Search engines and link previews see an empty page; slow first paint on 3G |
| **Build-time pre-rendering with a Vite plugin** | Stays static; no new runtime; works with the existing Vite build ([ADR 0007](0007-frontend-toolchain.md)) | Pages are as fresh as the last build; dynamic facility data must load after hydration |

## Decision

- `patient-web` pre-renders these routes at build time with a Vite prerender plugin: `/`, `/for-facilities`, and `/facilities/:slug` for every live facility (the slug list comes from the public API at build time).
- Pre-rendered HTML holds only public (C0) content: page text, the facility's name, type, services and address. Live data (next free slot, queue load, fees) loads on the client after hydration, so a stale build never shows a wrong time or price.
- The patient app behind sign-in is not pre-rendered.
- Built in R8 with [`vite-prerender-plugin`](https://github.com/preactjs/vite-prerender-plugin) **0.5.14** (exact version in `apps/patient-web/package.json`), in the normal `vite build`:
  - `src/prerender/prerender.tsx` renders each route with React Router's static handler in Kinyarwanda, and lists the facility slugs from `POST /api/v1/public/facilities/search/` (none when the API is unreachable; `PRERENDER_STRICT=1` makes that fail a release build). Mock builds use the contract mocks.
  - Facility snapshots drop fees, queue load and next free times; the browser replaces them with live data. Static pages hydrate.
  - `app-shell.html` (the unrendered `index.html`) is the service-worker navigation fallback and must be the host's fallback for paths without a pre-rendered file.
  - `scripts/check-prerender.mjs` runs after `pnpm build`: pages present, one `<h1>`, only public discovery data, no live data, no email address or national ID. A Playwright test checks the HTML without JavaScript and that hydration keeps the content.

## Consequences

- No new server; hosting stays as in ADR 0006.
- A new live facility appears in pre-rendered form only after the next frontend build; until then its profile renders on the client. A scheduled or on-demand rebuild may be added later.
- The build needs read access to the public facility list (no credentials; public endpoints only).
- CI must check that pre-rendered pages contain no personal data and that hydration does not change the visible content.
