"""Local development settings (plain http on localhost)."""

import importlib.util

from .base import *
from .base import (
    INSTALLED_APPS,
    LOGGING,
    SECURE_CSP,
    SPECTACULAR_SETTINGS,
    env,
    origin_settings,
    session_audiences,
)

DEBUG = True
SECRET_KEY = env("DJANGO_SECRET_KEY", default="django-insecure-dev-only-change-me")
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

# Plain http: no Secure flag, so the __Host- prefix is dropped from cookie names.
SESSION_AUDIENCES = session_audiences(cookie_prefix="")
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
CSRF_COOKIE_NAME = env("CSRF_COOKIE_NAME", default="ml_csrf")

CORS_ALLOWED_ORIGINS, CSRF_TRUSTED_ORIGINS, WS_ALLOWED_ORIGINS = origin_settings(
    ["http://localhost:5173", "http://localhost:5174"]
)

ADMIN_ENABLED = env.bool("ADMIN_ENABLED", default=True)
SCHEMA_ENABLED = env.bool("SCHEMA_ENABLED", default=True)
if importlib.util.find_spec("drf_spectacular_sidecar"):  # dev requirements installed
    INSTALLED_APPS = [*INSTALLED_APPS, "drf_spectacular_sidecar"]
    SPECTACULAR_SETTINGS = {
        **SPECTACULAR_SETTINGS,
        "SWAGGER_UI_DIST": "SIDECAR",
        "SWAGGER_UI_FAVICON_HREF": "SIDECAR",
        "REDOC_DIST": "SIDECAR",
    }

# Report-only CSP in dev so Swagger UI keeps working; violations show in the browser console.
SECURE_CSP_REPORT_ONLY = SECURE_CSP
SECURE_CSP = {}

# Emails go to Mailpit (http://localhost:8025); tasks run inline unless a worker is started.
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=True)

LOGGING = {
    **LOGGING,
    "handlers": {
        "console": {
            **LOGGING["handlers"]["console"],  # type: ignore[index]
            "formatter": env("LOG_FORMAT", default="text"),
        }
    },
}
