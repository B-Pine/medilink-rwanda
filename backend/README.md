# MediLink API (backend)

Django API for all MediLink channels: REST (`/api/v1`) and WebSockets (`/ws/v1`), deployed to
`api.medilink.rw`. Owns facilities, users and roles, patients, the live queue, clinical records,
billing, documents, notifications, disputes and the audit log.

- Architecture: [docs/architecture/01-system-architecture.md](../docs/architecture/01-system-architecture.md)
- API conventions: [docs/architecture/02-api-conventions.md](../docs/architecture/02-api-conventions.md)
- Current contract: [Sprint 0](../docs/architecture/03-sprint-0-contract.md) · Changes: [CHANGELOG.md](CHANGELOG.md)

**Stack:** Python 3.14 (3.12+), Django 6.1, Django REST framework, drf-spectacular, Channels +
channels-redis, Celery, PostgreSQL 17 (psycopg 3, row-level security), Redis 7, django-otp,
Argon2id, django-environ, pip-tools.

## Quick start

Prerequisites: Python 3.14 (3.12+ works), Docker with Compose, Git. Commands run from the
repository root unless noted. Use `127.0.0.1`/`localhost` consistently (see "Frontend
integration").

### 1. Infrastructure

```bash
docker compose up -d        # PostgreSQL 17 on 127.0.0.1:5433, Redis 7 on :6379, Mailpit on :1025 / UI :8025
```

The first start runs `backend/docker/postgres/init/01-roles.sh`, which creates the `medilink`
database and two roles (see [Database roles and RLS](#database-roles-and-row-level-security)).

### 2. Python environment

Linux / macOS:

```bash
cd backend
python3.14 -m venv .venv
source .venv/bin/activate
pip install --require-hashes --no-deps -r requirements/dev.txt
cp .env.example .env
```

Windows (PowerShell):

```powershell
cd backend
py -3.14 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install --require-hashes --no-deps -r requirements\dev.txt
Copy-Item .env.example .env
```

### 3. Database, demo data, server

```bash
python manage.py migrate        # runs as the owner role (DATABASE_OWNER_URL)
python manage.py seed_dev       # demo facility + one user per role; prints dev-only passwords
python manage.py runserver      # http://localhost:8000 (HTTP only)
```

`seed_dev` refuses to run unless `DEBUG` is on. It creates "Kigali Demo Clinic" (plus a second
facility so the facility picker can be tried), a platform admin, a facility admin, a receptionist,
a doctor (member of both facilities), a pharmacist and a patient, all `@demo.medilink.test`.
Passwords are random and printed (new ones on every run); use `--password "<15+ chars>"` for a
fixed one. Staff set up TOTP at their first sign-in (any authenticator app). It also runs the sprint
seeders: `seed_masterdata_dev` (sample sectors, cells and villages) and `seed_patients_dev` (six
synthetic patients at Kigali Demo Clinic, some with a national ID).

WebSockets need an ASGI server: `uvicorn config.asgi:application --reload --port 8000` serves
HTTP and `/ws/v1/...`.

Emails (password reset) go to Mailpit: <http://localhost:8025>. In dev, Celery tasks run inline
(`CELERY_TASK_ALWAYS_EAGER=true`); to use a worker set it to `false` and run
`celery -A config worker -l info` (Windows: add `--pool=solo`).

**Testing without an authenticator app (dev only):** add `DEV_SKIP_STAFF_MFA=true` to `backend/.env`
and restart the server. Staff then log in with email and password only; the audit log records
`mfa_method: dev_skip`. It works only with `DEBUG` on: `manage.py check` refuses it otherwise
(`medilink.E003`) and `check --deploy` always refuses it (`medilink.E004`). Never set it in staging
or production, where staff MFA is mandatory.

### Useful URLs (dev)

| What | URL |
|---|---|
| Health | <http://localhost:8000/api/v1/health/> |
| OpenAPI schema (YAML) | <http://localhost:8000/api/v1/schema/> (committed copy: [openapi/openapi.yaml](openapi/openapi.yaml)) |
| Swagger UI | <http://localhost:8000/api/v1/schema/swagger/> |
| Ops admin (platform admins with TOTP) | <http://localhost:8000/ops-admin/> |
| Mailpit | <http://localhost:8025> |

## Tests and quality gates

Tests need the docker compose PostgreSQL (RLS, triggers and role privileges are part of what is
tested). The test database is created and migrated by the owner role; then **every test runs as
the restricted app role** (`SET ROLE medilink_app`), exactly like production.

```bash
pytest                                     # all tests
pytest --cov --cov-report=term-missing     # with coverage
pytest -m "acceptance"                     # tests linked to the Sprint 0 checks (names: test_b5_..., marker acceptance("B5"))
ruff check . && ruff format --check .      # lint (incl. bandit security rules) and format
mypy .                                     # type check (non-blocking in Sprint 0)
python manage.py makemigrations --check --dry-run
python manage.py spectacular --validate --fail-on-warn --file openapi/openapi.yaml   # refresh the committed schema (test settings)
pip-audit --strict --require-hashes --disable-pip -r requirements/prod.txt -r requirements/dev.txt
python manage.py verify_audit_chain        # recompute the audit hash chain
```

Production settings check (dummy values; the same command runs in CI):

```bash
DJANGO_SETTINGS_MODULE=config.settings.prod DJANGO_READ_DOT_ENV=false \
DJANGO_SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(64))')" \
DJANGO_ALLOWED_HOSTS=api.medilink.rw DATABASE_URL=postgres://u:p@db.invalid/medilink \
CORS_ALLOWED_ORIGINS=https://staff.medilink.rw,https://medilink.rw \
python manage.py check --deploy --fail-level WARNING
```

CI: [.github/workflows/ci-backend.yml](../.github/workflows/ci-backend.yml) runs all of the above
against PostgreSQL 17 + Redis service containers and builds the Docker image.

Avoid `@pytest.mark.django_db(transaction=True)`: flushing needs `TRUNCATE`, which the app role
doesn't have and the audit trigger forbids.

## Configuration

All configuration comes from environment variables (12-factor); [.env.example](.env.example)
documents every variable and is checked by a test. Settings modules: `config.settings.dev`
(default for `manage.py`), `config.settings.test` (pytest), `config.settings.prod`
(staging/production). `backend/.env` is read only for local convenience (`DJANGO_READ_DOT_ENV=false`
disables it); real environment variables always win.

Key variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Runtime role (`medilink_app`): NOSUPERUSER, NOBYPASSRLS, owns nothing |
| `DATABASE_OWNER_URL` | Owner role, used only by schema commands (`migrate`, `makemigrations`, ...) and the test runner |
| `CORS_ALLOWED_ORIGINS` | Frontend origins (exact, no wildcards). `CSRF_TRUSTED_ORIGINS` and `WS_ALLOWED_ORIGINS` default to it |
| `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS` | Required in production |
| `CACHE_URL`, `CHANNEL_LAYER_URL`, `CELERY_BROKER_URL` | Redis databases 1, 2 and 0 |
| `EMAIL_URL` | `smtp://`, `smtp+tls://`, `smtp+ssl://`, `console://` (Django 6.1 `MAILERS`) |
| `STAFF_SESSION_*`, `PATIENT_SESSION_*` | Cookie names and idle/absolute timeouts |
| `THROTTLE_RATE_*`, `NUM_PROXIES` | Rate limits and trusted proxy count |
| `MEDILINK_FIELD_KEYS`, `MEDILINK_BLIND_INDEX_KEYS` (+ `_ACTIVE_KEY_ID`) | Patient identifier encryption and blind-index keys, `"<id>:<base64url 32 bytes>"`. Empty in development (derived from `SECRET_KEY`, check `patients.W001`); required in production (`patients.E001`). Rotate with `manage.py patients_rotate_keys --data` / `--index` |
| `ADMIN_ENABLED`, `ADMIN_URL`, `SCHEMA_ENABLED` | Dev tools (off by default in production) |

## Frontend integration

The frontends are separate sites (ADR 0006) and call this API with `fetch(..., { credentials: "include" })`.

**Session cookies** (server-side sessions, `HttpOnly`, `SameSite=Lax`, `Path=/`, host-only):

| Audience | Paths | Production cookie | Dev cookie | Idle / absolute |
|---|---|---|---|---|
| Staff | `/api/v1/staff/*`, `/api/v1/platform/*`, `/ws/v1/staff/*` | `__Host-ml_staff` | `ml_staff` | 15 min / 12 h |
| Patient | `/api/v1/patient/*`, `/ws/v1/patient/*` | `__Host-ml_patient` | `ml_patient` | 12 h / 30 days |

A staff session never authenticates a patient endpoint and vice versa; one browser can hold both.

**CSRF:** call `GET /api/v1/csrf/` → `{"csrf_token": "..."}` (it also sets the CSRF cookie,
`__Host-ml_csrf` in production, `ml_csrf` in dev). Send it as `X-CSRFToken` on every
POST/PUT/PATCH/DELETE, including login, register and password reset. **Fetch a new token after
every successful sign-in step** (MFA confirm/verify, patient login/register): signing in rotates
the CSRF secret. A missing/stale token gives `403 {"error": {"code": "csrf_failed"}}`; refetch
and retry once.

**CORS (dev):** `http://localhost:5173` (staff-web) and `http://localhost:5174` (patient-web),
credentials allowed. Exposed headers: `X-Request-ID`, `Retry-After`. Run the frontends on
`localhost` (not `127.0.0.1`) so they're same-site with `http://localhost:8000` and cookies flow.

**Staff sign-in:**

```
POST /staff/auth/login/ {email,password}
  -> {"status":"mfa_setup_required"}  POST /staff/auth/mfa/setup/   -> {otpauth_uri, secret}
                                      POST /staff/auth/mfa/confirm/ {code} -> {status:"authenticated", user, recovery_codes[10]}
  -> {"status":"mfa_required"}        POST /staff/auth/mfa/verify/  {code} | {recovery_code} -> {status:"authenticated", user}
then  GET /staff/auth/me/   POST /staff/auth/active-facility/ {facility_id}
```

Until the second factor succeeds, every staff endpoint returns `401 mfa_required`. With exactly
one membership the facility is selected automatically; with several, `active_facility_id` is
`null` and `permissions` is `[]` until `active-facility` is called.

**Errors** always use `{"error": {"code", "message", "fields", "request_id"}}`; `fields` is `{}`
unless `code` is `validation_error`. Codes: see API conventions §4. `429` responses carry
`Retry-After`. Every response carries `X-Request-ID`.

## Database roles and row-level security

| Role | Used by | Rights |
|---|---|---|
| `medilink_owner` | `manage.py migrate` and other schema commands (`DATABASE_OWNER_URL`), test DB creation | Owns the schema |
| `medilink_app` | The running app, Celery, management commands (`DATABASE_URL`) | DML on app tables; `SELECT, INSERT` only on the audit log; no DDL; `NOBYPASSRLS` |

- Facility-owned tables use `medilink.tenancy.rls.EnableFacilityRLS("<model>")` in their migration:
  `ENABLE` + `FORCE ROW LEVEL SECURITY` and a `facility_isolation` policy with `USING` and
  `WITH CHECK` on `NULLIF(current_setting('app.facility_id', true), '')::uuid`.
  Sprint 0 applies it to `FacilityMembership` (plus a self-read policy on `app.user_id`) and the
  demo table `FacilityNote`; S1 to uploads; S3 to `patients_facility_patient`. Two SECURITY
  DEFINER helpers (`patients_known_elsewhere`, `patients_facilities_of`) count a patient's other
  facilities through an owner-only read policy ([database design](../docs/architecture/04-database-design.md) §5.5).
- `TenantContextMiddleware` opens the request transaction and sets `app.user_id` /
  `app.facility_id` with `set_config(..., true)` from the verified session. No session or no
  active membership → empty context → no rows (fails closed).
- Scripts, tasks and seeds use `with rls_context(facility_id=..., user_id=...):`.
- Table privileges for the app role are (re)applied after every `migrate` (`medilink/core/db.py`).

## Dependencies

`requirements/*.in` are compiled with pip-tools into hash-pinned `requirements/*.txt`
(`base` → `prod` → `dev`). Compile on Linux, like CI and the image (one lock works on Windows too,
because `tzdata` and `colorama` are listed explicitly):

```bash
docker run --rm -v "$PWD:/src" -w /src python:3.14-slim sh -c "pip install pip-tools==7.6.2 && \
  python requirements/pip_compile.py --generate-hashes --allow-unsafe --strip-extras -o requirements/base.txt requirements/base.in && \
  python requirements/pip_compile.py --generate-hashes --allow-unsafe --strip-extras -o requirements/prod.txt requirements/prod.in && \
  python requirements/pip_compile.py --generate-hashes --allow-unsafe --strip-extras -o requirements/dev.txt requirements/dev.in"
```

`requirements/pip_compile.py` runs the normal `pip-compile` CLI with one fix: pip-tools 7.6.x builds
a wrong PyPI JSON URL and then downloads every wheel of every pinned version to hash it (hours for
ruff/mypy). With the fix the same SHA-256 hashes come from PyPI's JSON API in seconds. Plain
`pip-compile` produces identical files, just slowly.

## Container image

`docker build -t medilink-api backend/` builds a slim, multi-stage, non-root (uid 10001) image
running `uvicorn config.asgi:application` with production settings. Migrations run as a separate
job with `DATABASE_OWNER_URL` set.

## Layout

```
config/            settings (base, dev, test, prod), urls, asgi, wsgi, celery
medilink/core/     base models, errors, request ID, CSRF, logging, realtime (Channels), seed_dev
medilink/accounts/ users, audience sessions, login, MFA, password reset
medilink/tenancy/  organisations, facilities, roles, permissions, memberships, RLS helpers + context
medilink/authz/    permission catalogue, DRF permission classes, policy layer (deny by default)
medilink/audit/    append-only hash-chained audit log, verify_audit_chain
medilink/uploads/  upload pipeline (S1): sniffing, scanning, storage, signed links
medilink/masterdata/ master data (S1): locations, insurers, drugs, ICD-10, imports
medilink/onboarding/ facility applications, verification, facility status, licences, flags (S1)
medilink/patients/ patients and identity (S3): identifiers (encrypted), facility records, merges,
                   claims, delegations, insurance, health profile, access history
docker/postgres/   database role init script (docker compose and CI)
openapi/           committed OpenAPI schema (frontend types are generated from it)
tests/             pytest (test_bN_* map to the Sprint 0 acceptance checks; sprint folders)
```
