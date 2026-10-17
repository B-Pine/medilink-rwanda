"""Production (and staging) settings. Everything sensitive comes from the environment.

CI gate (with prod settings):  python manage.py check --deploy --fail-level WARNING
"""

from django.core.exceptions import ImproperlyConfigured

from .base import *
from .base import DATABASES, env, origin_settings

DEBUG = False

# Web requests: persistent connections and a 5 s statement timeout (security 06 §3, API4).
# Migrations (owner role) are exempt from the timeout.
DATABASES["default"]["CONN_MAX_AGE"] = env.int("DATABASE_CONN_MAX_AGE", default=60)
if env("MEDILINK_DB_ROLE", default="app") != "owner":
    _timeout_ms = env.int("DATABASE_STATEMENT_TIMEOUT_MS", default=5000)
    DATABASES["default"].setdefault("OPTIONS", {})["options"] = (
        f"-c statement_timeout={_timeout_ms}"
    )

SECRET_KEY = env("DJANGO_SECRET_KEY")  # required, no default
SECRET_KEY_FALLBACKS = env.list("DJANGO_SECRET_KEY_FALLBACKS", default=[])
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS")  # required, e.g. api.medilink.rw

CORS_ALLOWED_ORIGINS, CSRF_TRUSTED_ORIGINS, WS_ALLOWED_ORIGINS = origin_settings(
    [], require_https=True
)
if not CORS_ALLOWED_ORIGINS:
    raise ImproperlyConfigured("CORS_ALLOWED_ORIGINS must list the frontend origins.")

# HTTPS everywhere (TLS terminates at the proxy, which overwrites X-Forwarded-Proto).
SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = 31_536_000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# Admin and OpenAPI are off in production unless explicitly enabled (and then VPN-only).
ADMIN_ENABLED = env.bool("ADMIN_ENABLED", default=False)
SCHEMA_ENABLED = env.bool("SCHEMA_ENABLED", default=False)

CELERY_TASK_ALWAYS_EAGER = False
