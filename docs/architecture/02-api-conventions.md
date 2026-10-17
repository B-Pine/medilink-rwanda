# 02 · API conventions

Status: v0.1 · Applies to every endpoint. The OpenAPI schema generated from code is the source of truth for what exists; this document defines how endpoints must look.

## 1. URLs and audiences

```
/api/v1/health/                 public
/api/v1/csrf/                   public: returns a CSRF token (JSON) and sets the CSRF cookie
/api/v1/auth/...                audience-neutral account flows (password reset)
/api/v1/public/...              no login: facility search, profiles, document verification
/api/v1/patient/...             patient session (cookie __Host-ml_patient)
/api/v1/staff/...               staff session (cookie __Host-ml_staff), scoped to the active facility
/api/v1/platform/...            super admin (staff session + is_platform_admin + step-up where required)
/ws/v1/...                      WebSockets (same session cookies)
```

- Plural nouns, kebab-case path segments, trailing slash (Django default): `/api/v1/staff/visits/{id}/check-in/`.
- **Actions** that aren't plain CRUD are sub-resources with POST: `/tickets/{id}/call/`, `/bills/{id}/void-requests/`.
- An endpoint lives under **one** audience. Patient and staff never share an endpoint.

## 2. Request and response format

| Rule | Detail |
|---|---|
| Content type | `application/json; charset=utf-8` (uploads: `multipart/form-data`) |
| Field names | `snake_case` |
| IDs | UUID strings |
| Timestamps | ISO 8601 UTC with `Z` (`2026-10-17T07:42:00Z`); the client displays Africa/Kigali |
| Dates | `YYYY-MM-DD` |
| Money | Integer RWF, field suffix `_rwf` (`amount_rwf: 2000`) |
| Enums | lowercase snake strings (`"in_consultation"`) |
| Booleans | `is_`/`has_` prefixes for flags |
| Nulls | Explicit `null` for unknown values; fields are not omitted |
| Language | `Accept-Language: rw | en | fr`; messages are localised, codes are stable |

## 3. Lists

- Page-number pagination: `?page=2&page_size=50` (default 25, max 100).
- Response: `{ "count": 128, "next": "…", "previous": "…", "results": [ … ] }`.
- Filters as query parameters (documented per endpoint); search `?q=`; ordering `?ordering=-created_at`, only on allowlisted fields.

## 4. Errors

Always this shape, with the matching HTTP status:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Some fields need attention.",
    "fields": { "email": ["Enter a valid email address."] },
    "request_id": "01JAB…"
  }
}
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `validation_error` | Invalid input (`fields` filled) |
| 400 | `bad_request` | Malformed request |
| 401 | `not_authenticated` | No valid session for this audience |
| 401 | `mfa_required` | Password OK, second factor pending |
| 403 | `permission_denied` | Authenticated but not allowed (only when the object's existence may be known; otherwise 404) |
| 403 | `step_up_required` | Recent re-authentication needed |
| 403 | `csrf_failed` | Missing or invalid CSRF token |
| 404 | `not_found` | Missing **or not visible** (no existence leaks across facilities) |
| 409 | `conflict` | Version mismatch, slot taken, duplicate action |
| 422 | `business_rule_violation` | Valid input but not allowed by a rule (e.g. void own receipt) |
| 429 | `rate_limited` | With `Retry-After` |
| 500 | `server_error` | Generic message only; details in logs |

## 5. Security conventions

- **Auth:** audience session cookie + `X-CSRFToken` header for POST/PUT/PATCH/DELETE. Clients send `credentials: "include"`.
- **Deny by default:** every view declares a policy ([security 04](../security/04-authorization-and-tenant-isolation.md)).
- **Request ID:** every response has `X-Request-ID` (echoed if the client sent a valid one).
- **Idempotency:** POST actions with side effects (check-in, call next, record payment, dispense) accept `Idempotency-Key` (UUID). A repeat within 24 h returns the original result.
- **Optimistic concurrency:** mutable resources expose `version` (integer). Updates send it back; a mismatch returns `409 conflict` with the current resource.
- **No sensitive data in URLs** (no national IDs, names or tokens in query strings, except one-time tokens in emailed links).
- **Rate limits** per account and endpoint class (auth, search, verification) ([security 03](../security/03-identity-authentication-sessions.md) §6).

## 6. WebSockets

- URL: `/ws/v1/staff/facilities/{facility_id}/queue/`, `/ws/v1/patient/tickets/{ticket_id}/`, `/ws/v1/display/{token}/`.
- Envelope: `{ "type": "ticket.updated", "data": { "id": "…", "version": 7 }, "sent_at": "…" }`.
- **Notify-then-fetch:** messages carry IDs and versions. Clients fetch details through REST, which applies authorisation.
- The server closes the socket on logout, deactivation or loss of permission.

## 7. Versioning and documentation

- `/api/v1` stays backward compatible: adding fields and endpoints is allowed; removing or renaming is not. A breaking change needs `/api/v2` or a 3-month deprecation (`Deprecation` and `Sunset` headers).
- OpenAPI: `GET /api/v1/schema/` (non-production, or staff-only in production) and Swagger/Redoc UI in development.
- The frontend generates types from the schema (`openapi-typescript`). CI fails if the committed types drift from the schema.
- Every endpoint documents: audience, permission, request/response schema, errors, rate-limit class, and the requirement IDs it implements.
