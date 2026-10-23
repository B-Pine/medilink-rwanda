"""B13: `manage.py check --deploy --fail-level WARNING` passes on production settings; CSP is set."""

from __future__ import annotations

import json
import os
import secrets
import subprocess
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.acceptance("B13")

BACKEND = Path(__file__).resolve().parent.parent
PASSTHROUGH = (
    "PATH",
    "SYSTEMROOT",
    "SystemRoot",
    "TEMP",
    "TMP",
    "HOME",
    "USERPROFILE",
    "LOCALAPPDATA",
)


def prod_env(**overrides: str) -> dict[str, str]:
    """A hermetic production-like environment with dummy values (nothing real, nothing from .env)."""
    env = {k: v for k, v in os.environ.items() if k in PASSTHROUGH}
    env.update(
        {
            "DJANGO_SETTINGS_MODULE": "config.settings.prod",
            "DJANGO_READ_DOT_ENV": "false",
            "DJANGO_SECRET_KEY": secrets.token_urlsafe(64),
            "DJANGO_ALLOWED_HOSTS": "api.medilink.rw",
            "DATABASE_URL": "postgres://medilink_app:dummy@db.invalid:5432/medilink",
            "CORS_ALLOWED_ORIGINS": "https://staff.medilink.rw,https://medilink.rw",
            "EMAIL_URL": "smtp+tls://mailer:dummy@smtp.invalid:587",
            # S1 upload pipeline: deployments use clamd and S3-compatible storage.
            "UPLOADS_SCANNER": "clamd",
            "UPLOADS_STORAGE": "s3",
            "UPLOADS_DOWNLOAD_BASE_URL": "https://files.medilink.rw",
            "PYTHONDONTWRITEBYTECODE": "1",
        }
    )
    env.update(overrides)
    return env


def _run(args: list[str], env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(  # noqa: S603 - fixed argv, test only
        [sys.executable, *args],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )


def test_b13_check_deploy_passes_on_prod_settings() -> None:
    result = _run(["manage.py", "check", "--deploy", "--fail-level", "WARNING"], prod_env())
    assert result.returncode == 0, result.stdout + result.stderr
    assert "no issues" in result.stdout


def test_b13_prod_security_settings() -> None:
    script = (
        "import json, django; django.setup(); from django.conf import settings as s; "
        "print(json.dumps({'csp': {k: [str(x) for x in v] for k, v in s.SECURE_CSP.items()}, "
        "'hsts': s.SECURE_HSTS_SECONDS, 'ssl': s.SECURE_SSL_REDIRECT, 'debug': s.DEBUG, "
        "'staff': s.SESSION_AUDIENCES['staff']['COOKIE_NAME'], 'patient': s.SESSION_AUDIENCES['patient']['COOKIE_NAME'], "
        "'csrf': s.CSRF_COOKIE_NAME, 'secure': s.SESSION_COOKIE_SECURE, 'schema': s.SCHEMA_ENABLED, "
        "'admin': s.ADMIN_ENABLED, 'eager': s.CELERY_TASK_ALWAYS_EAGER, 'db_options': s.DATABASES['default'].get('OPTIONS', {})}))"
    )
    result = _run(["-c", script], prod_env())
    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout.strip().splitlines()[-1])
    assert data["csp"]["default-src"] == ["'self'"]
    assert data["csp"]["frame-ancestors"] == ["'none'"]
    assert data["csp"]["object-src"] == ["'none'"]
    assert "'unsafe-inline'" not in data["csp"]["script-src"]
    assert data["hsts"] == 31_536_000 and data["ssl"] is True and data["debug"] is False
    assert data["staff"] == "__Host-ml_staff" and data["patient"] == "__Host-ml_patient"
    assert data["csrf"] == "__Host-ml_csrf" and data["secure"] is True
    assert data["schema"] is False and data["admin"] is False and data["eager"] is False
    assert "statement_timeout=5000" in data["db_options"]["options"]


def test_b13_prod_refuses_wildcard_or_http_origins() -> None:
    result = _run(["manage.py", "check"], prod_env(CORS_ALLOWED_ORIGINS="*"))
    assert result.returncode != 0
    assert "explicit origins only" in result.stderr
    result = _run(["manage.py", "check"], prod_env(CORS_ALLOWED_ORIGINS="http://staff.medilink.rw"))
    assert result.returncode != 0


def test_b13_deploy_check_flags_insecure_cookie_names() -> None:
    result = _run(
        ["manage.py", "check", "--deploy", "--fail-level", "WARNING"],
        prod_env(STAFF_SESSION_COOKIE_NAME="ml_staff", CSRF_COOKIE_NAME="csrftoken"),
    )
    assert result.returncode != 0
    assert "medilink.W001" in result.stderr + result.stdout
    assert "medilink.W002" in result.stderr + result.stdout
