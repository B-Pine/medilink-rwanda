# Getting started

Status: v0.1 · Local setup from [architecture 01](../architecture/01-system-architecture.md) §4.

> Reconciled with the Sprint 0 code. Details and every command: [backend/README.md](../../backend/README.md) and [frontend/README.md](../../frontend/README.md). If they ever differ, those files win; fix this guide.

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Git | Recent | Line endings are normalised to LF by `.gitattributes` |
| Python | **3.14** (3.12+ works; CI uses 3.14) | For the backend |
| Node.js | **24** | For the frontend |
| pnpm | **12.9** (pinned in `frontend/package.json` → `packageManager`) | Install with Corepack (`corepack enable`) |
| Docker | Docker Desktop (Windows, macOS) or Docker Engine with Compose v2 (Linux) | Runs PostgreSQL, Redis and Mailpit |
| An authenticator app | Any TOTP app | Staff login always asks for a second factor, also in development |

## 2. Clone

```bash
git clone https://github.com/B-Pine/medilink-rwanda.git
cd medilink-rwanda
```

## 3. Start the local infrastructure

From the repository root:

```bash
docker compose up -d
docker compose ps        # all services should be "running" or "healthy"
```

| Service | Address | Notes |
|---|---|---|
| PostgreSQL 17 | `localhost:5433` | Host port 5433 avoids a clash with a local PostgreSQL on 5432 |
| Redis 7 | `localhost:6379` | Channels, Celery broker, cache |
| Mailpit | SMTP `localhost:1025`, web UI http://localhost:8025 | Catches every email (password reset, invitations) |

Stop with `docker compose down`. Add `-v` only if you want to delete the local database.

## 4. Run the backend

```bash
cd backend
python3.14 -m venv .venv               # Windows: py -3.14 -m venv .venv
source .venv/bin/activate              # Windows PowerShell: .\.venv\Scripts\Activate.ps1
pip install --require-hashes --no-deps -r requirements/dev.txt
cp .env.example .env                   # Windows PowerShell: Copy-Item .env.example .env
python manage.py migrate
python manage.py seed_dev
python manage.py runserver             # http://localhost:8000
```

- `seed_dev` creates a demo facility and one user per role, and prints their **development-only** passwords. It refuses to run when `DEBUG` is false.
- `seed_dev` creates "Kigali Demo Clinic" plus a second facility (so the facility picker can be tried); demo emails end in `@demo.medilink.test`.
- Check that the API is up: open http://localhost:8000/api/v1/health/. OpenAPI: http://localhost:8000/api/v1/schema/ · Swagger UI: http://localhost:8000/api/v1/schema/swagger/.
- WebSockets need an ASGI server (runserver is WSGI): `uvicorn config.asgi:application --reload --port 8000`.
- Background jobs (from the sprints that need them): run a Celery worker in a second terminal, e.g. `celery -A config worker -l info` (on Windows add `--pool=solo`).
- Tests: `pytest --cov` (needs the compose PostgreSQL; tests run as the non-superuser `medilink_app` role). Lint and types: `ruff check .`, `ruff format --check .`, `mypy .`. Audit chain: `python manage.py verify_audit_chain`.

## 5. Run the frontends

```bash
cd frontend
pnpm install
pnpm dev:mock                                   # both apps on MSW mocks, no backend needed
pnpm dev                                        # both apps against the real API
# or one app at a time:
pnpm --filter @medilink/staff-web dev           # http://localhost:5173
pnpm --filter @medilink/patient-web dev         # http://localhost:5174
```

| Variable | Default | Meaning |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Where the apps call the API (real CORS and cookies, like production) |
| `VITE_USE_MOCKS` | `false` | `true` runs the apps against MSW mocks of the sprint contract, **without the backend** |

Put local overrides in each app's `.env.local` (copy `.env.example`; git-ignored). Checks: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`. Mock accounts (password, TOTP `123456`) are listed in [frontend/README.md](../../frontend/README.md).

## 6. First login

1. Staff: open http://localhost:5173 and log in with a seeded user. The first login asks you to set up the second factor: scan the QR code with your authenticator app and keep the recovery codes. To test without an authenticator app, add `DEV_SKIP_STAFF_MFA=true` to `backend/.env` and restart the API (development only; see [backend/README.md](../../backend/README.md)).
2. Patients: open http://localhost:5174, sign up with any email address, and accept the terms and privacy notice.
3. Emails (password reset, invitations) appear in Mailpit at http://localhost:8025.

Use only synthetic data. Never enter real patient data, even locally ([SECURITY.md](../../SECURITY.md)).

## 7. Windows notes

| Topic | What to do |
|---|---|
| Shell | PowerShell or Git Bash both work. In PowerShell, activate the virtual environment with `.venv\Scripts\Activate.ps1`. |
| Script execution blocked | Run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| Several Python versions | Create the environment with the launcher: `py -3.14 -m venv .venv` |
| Docker | Install Docker Desktop with the WSL 2 backend and start it before `docker compose up -d` |
| Line endings | `.gitattributes` keeps LF. If your editor converts to CRLF, set `git config core.autocrlf false` for this repository. |
| Long paths | `node_modules` can exceed the Windows path limit: `git config --global core.longpaths true` |
| Celery | The default pool doesn't work on Windows; use `--pool=solo` |
| PDF generation (from S7) | WeasyPrint needs Pango/GTK libraries; run the PDF worker in Docker rather than installing them on Windows |

## 8. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `migrate` can't connect | Docker isn't running or PostgreSQL isn't ready yet: `docker compose ps`, then retry |
| Port 5433, 6379, 8000, 5173 or 5174 already in use | Stop the other process, or change the port in your local `.env` / `.env.local`. For PostgreSQL, copy `docker-compose.override.example.yml` to `docker-compose.override.yml` (git-ignored) and use port 5434 in `DATABASE_URL` |
| CORS error in the browser | Use `http://localhost:…` everywhere (not `127.0.0.1`), so the origin matches the backend's CORS allowlist |
| `403 csrf_failed` | The app must call `GET /api/v1/csrf/` first and send `X-CSRFToken`; check `CSRF_TRUSTED_ORIGINS` in `backend/.env` |
| Logged out right after login | On plain http the `__Host-` cookie prefix can't be used; development settings drop it ([Sprint 0 contract](../architecture/03-sprint-0-contract.md) check B4) |
| `seed_dev` refuses to run | `DEBUG` is false in your `.env` |
| The app works with mocks but not with the backend | Contract drift: regenerate the API types from `/api/v1/schema/` and compare with the MSW handlers ([testing strategy](testing-strategy.md) §5) |
