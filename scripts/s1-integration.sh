#!/usr/bin/env bash
# Sprint 1 integration checks (contract §9, S1-I1..I3) against a running local backend.
#
# Needs: docker compose services up (postgres, redis, mailpit), the backend on :8000 with
# DEBUG (manage.py runserver), CELERY_TASK_ALWAYS_EAGER=true, EMAIL_URL=smtp://127.0.0.1:1025,
# and sample locations (manage.py seed_dev or seed_masterdata_dev).
#
#   scripts/s1-integration.sh            # API at http://127.0.0.1:8000, Mailpit at :8025
#
# Each run creates a fresh platform admin (synthetic, DEBUG only) without a second factor;
# the test enrols TOTP through the API.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="${MEDILINK_IT_BASE_URL:-http://127.0.0.1:8000}"
MAILPIT="${MEDILINK_IT_MAILPIT:-http://127.0.0.1:8025}"
PYTHON="${PYTHON:-$ROOT/backend/.venv/Scripts/python}"
[ -x "$PYTHON" ] || PYTHON="$ROOT/backend/.venv/bin/python"

curl -fsS "$API/api/v1/health/" >/dev/null || { echo "Backend not reachable at $API" >&2; exit 1; }

EMAIL="it-admin-$(date +%s)@example.test"
PASSWORD="it-$(openssl rand -hex 12 2>/dev/null || date +%s%N)-Passphrase"

(cd "$ROOT/backend" && MEDILINK_DB_ROLE=owner "$PYTHON" manage.py shell -c "
from django.conf import settings
assert settings.DEBUG, 'integration admins are for DEBUG environments only'
from medilink.accounts.models import User
User.objects.create_user(email='$EMAIL', password='$PASSWORD', full_name='Integration Admin', is_platform_admin=True)
" < /dev/null)

cd "$ROOT/frontend"
MEDILINK_IT_BASE_URL="$API" MEDILINK_IT_MAILPIT="$MAILPIT" \
MEDILINK_IT_ADMIN_EMAIL="$EMAIL" MEDILINK_IT_ADMIN_PASSWORD="$PASSWORD" \
  npx vitest run packages/api-client/src/integration
