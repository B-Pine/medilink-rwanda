# Deploying the API on Railway

Status: v0.1 · How the backend runs on Railway (staging). Config as code lives in `backend/`:
[`railway.json`](../../backend/railway.json) (API), [`railway.worker.json`](../../backend/railway.worker.json)
(Celery worker), [`railway.beat.json`](../../backend/railway.beat.json) (Celery beat). Never put
secret values in this file or in git; they go in Railway's variables only.

## 1. Services

| Service | Root directory | Config file path | Notes |
|---|---|---|---|
| Postgres | (Railway template) | | Its admin user is `postgres`; never the app's runtime role |
| Redis | (Railway template) | | Cache, channel layer (WebSockets) and Celery broker |
| `api` | `/backend` | `/backend/railway.json` | Public domain; target port `8000` or `$PORT` |
| `worker` | `/backend` | `/backend/railway.worker.json` | No public domain |
| `beat` | `/backend` | `/backend/railway.beat.json` | No public domain; exactly one replica |

All three app services build the same `backend/Dockerfile` (hash-checked `requirements/prod.txt`,
non-root). There is no top-level `requirements.txt` on purpose: Railway must use the Dockerfile,
not Railpack.

## 2. First deploy: database roles

The app must not connect as `postgres` (a superuser bypasses row-level security, so every
facility could read every other facility's patients). Two roles, as in
`backend/docker/postgres/init/01-roles.sh`:

- `medilink_owner`: owns the schema, runs `migrate` (`DATABASE_OWNER_URL`)
- `medilink_app`: runtime, `NOSUPERUSER NOBYPASSRLS` (`DATABASE_URL`)

On the `api` service:

1. Set `DATABASE_URL=postgresql://medilink_app:<new password>@<postgres private host>:5432/medilink`
   and `DATABASE_OWNER_URL=postgresql://medilink_owner:<new password>@<same host>:5432/medilink`.
   Generate two new passwords; reuse neither the admin password nor each other.
2. Set `BOOTSTRAP_DATABASE_URL` to the Postgres service's admin URL (`${{Postgres.DATABASE_URL}}`).
3. Deploy. The pre-deploy step runs `scripts/railway_bootstrap_db.py` (creates the roles and the
   `medilink` database; refuses if either URL uses the admin user), then
   `MEDILINK_DB_ROLE=owner python manage.py migrate`.
4. **Delete `BOOTSTRAP_DATABASE_URL`** once the log says "MediLink database roles ready". The
   running app must not hold the admin password (`check --deploy` warns: `medilink.W005`).

The `worker` and `beat` services get `DATABASE_URL` only (the app role), never the owner or
bootstrap URLs.

## 3. Variables

Shared by `api`, `worker` and `beat` (use Railway shared variables). Generate every key with
`python -c "import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())"`.

| Variable | Value |
|---|---|
| `DJANGO_SECRET_KEY` | 50+ random characters |
| `DJANGO_ALLOWED_HOSTS` | the API domain, e.g. `medilink-api.up.railway.app` (Railway's healthcheck host is added automatically) |
| `CORS_ALLOWED_ORIGINS` | the staff and patient app origins, `https://` only, comma-separated |
| `STAFF_APP_URL`, `PATIENT_APP_URL` | the two frontend URLs (links in emails) |
| `DATABASE_URL` | the `medilink_app` URL (section 2) |
| `CACHE_URL` | `${{Redis.REDIS_URL}}/1` |
| `CHANNEL_LAYER_URL` | `${{Redis.REDIS_URL}}/2` |
| `CELERY_BROKER_URL` | `${{Redis.REDIS_URL}}/0` |
| `MEDILINK_KEYSTORE` | `env` |
| `MEDILINK_FIELD_KEYS`, `MEDILINK_FIELD_ACTIVE_KEY_ID` | `1:<key>` and `1` |
| `MEDILINK_BLIND_INDEX_KEYS`, `MEDILINK_BLIND_INDEX_ACTIVE_KEY_ID` | `1:<another key>` and `1` (must differ from every field key) |
| `MFA_SECRET_KEYS`, `MFA_SECRET_ACTIVE_KEY_ID` | `1:<another key>` and `1` |
| `EMAIL_URL`, `DEFAULT_FROM_EMAIL` | the SMTP provider |
| `NUM_PROXIES` | `1` (Railway's edge proxy; client IPs for throttling) |
| `UPLOADS_SCANNER`, `UPLOADS_STORAGE` | `clamd` and `s3` for real documents (see `.env.example` [S1]) |

`api` only: `DATABASE_OWNER_URL` (pre-deploy `migrate`). Losing the field or blind-index keys
makes encrypted patient data unreadable: keep a copy in the key store, not only in Railway.

## 4. Checks after a deploy

- `GET https://<api domain>/api/v1/health/` returns `{"status": "ok", ...}`.
- The deploy log shows the migrations applied as `medilink_owner`, not `postgres`.
- `BOOTSTRAP_DATABASE_URL` is no longer in the `api` variables.
- The `worker` log shows `ready`; the `beat` log shows the schedule loading.
