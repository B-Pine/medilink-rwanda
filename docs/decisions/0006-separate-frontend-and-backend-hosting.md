# ADR 0006 — Frontend and backend are developed, versioned and hosted separately

Status: Accepted (2026-10-17)

## Context
The team wants the frontend and the backend to be hosted separately. Static web apps scale cheaply and can be served from a simple static host. The API and its real-time and background services need application servers, a database and stricter network controls. Separation also lets each part be released on its own schedule.

## Decision

### Repository
- `backend/`: the Django API (REST + WebSockets + background workers). Its own README, CHANGELOG, version, CI workflow and Docker image.
- `frontend/`: a pnpm workspace with `apps/staff-web`, `apps/patient-web` (later `apps/patient-mobile`) and shared `packages/` (UI kit, API client, config). Its own README, CHANGELOG, version, CI workflow and static build output.
- They communicate **only through the versioned HTTP/WebSocket API** (`/api/v1`, `/ws/v1`). No shared code. TypeScript types are generated from the backend's OpenAPI schema.

### Hosting (production)
| Host | Serves |
|---|---|
| `medilink.rw` | `patient-web` static build: public pages (pre-rendered for search engines) + the patient app |
| `staff.medilink.rw` | `staff-web` static build (staff workspaces, waiting-room display) |
| `api.medilink.rw` | Django API `/api/v1/...` and WebSockets `/ws/v1/...` |
| `files.medilink.rw` | Document and upload downloads (signed URLs) |

All hosts are in Rwanda ([ADR 0002](0002-web-first-paid-channels-later.md), [security 02](../security/02-security-architecture.md)).

### Authentication across hosts
- **Session cookies stay on the API host** (`__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Lax`). The frontend hosts never hold auth cookies. All `*.medilink.rw` hosts are the same *site*, so the browser sends the API cookie with `fetch(..., { credentials: "include" })`.
- **Audience-scoped sessions:** staff and patients get **separate session cookies** (`__Host-ml_staff`, `__Host-ml_patient`), selected by API path (`/api/v1/staff/*`, `/api/v1/platform/*` vs `/api/v1/patient/*`). Each has its own timeouts ([security 03](../security/03-identity-authentication-sessions.md) §5). A doctor who is also a patient can be logged into both apps in one browser.
- **CORS:** explicit allowlist of the frontend origins, `credentials` allowed, no wildcard.
- **CSRF:** the frontend can't read the API host's cookies, so it fetches the token from `GET /api/v1/csrf/` (JSON) and sends `X-CSRFToken`. `CSRF_TRUSTED_ORIGINS` lists the frontend origins.
- **WebSockets:** `wss://api.medilink.rw/ws/v1/...`, origin checked against the same frontend allowlist.

### Versioning and releases
- Semantic versioning, separately: tags `backend-vX.Y.Z` and `frontend-vX.Y.Z`; `backend/CHANGELOG.md` and `frontend/CHANGELOG.md`. The root `CHANGELOG.md` covers documentation and repository-wide changes.
- The API is backward compatible within `/api/v1`. Breaking changes need `/api/v2` or a deprecation period ([architecture 02](../architecture/02-api-conventions.md)).
- Each frontend build declares the minimum API version it needs; `/api/v1/health/` reports the API version.

## Consequences
- Frontend and backend teams (or agents) work in parallel against a **contract** (OpenAPI + sprint contract docs), with frontend mocks (MSW) until the endpoint exists.
- Public patient pages need **pre-rendering** at build time for search engines, since there is no server-side rendering on the static host.
- Cross-origin settings (CORS, CSRF trusted origins, WebSocket origins) must be configured per environment, and are tested in CI and staging.
- Two deployment pipelines to maintain.
