"""Base settings shared by every environment.

Environment-specific modules (dev, test, prod) import everything from here and override.
All configuration comes from environment variables (12-factor, django-environ); see .env.example.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit

import environ
from corsheaders.defaults import default_headers
from django.core.exceptions import ImproperlyConfigured
from django.utils.csp import CSP

from medilink import __version__

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # backend/

env = environ.Env()
if env.bool("DJANGO_READ_DOT_ENV", default=True) and (BASE_DIR / ".env").is_file():
    # Local development convenience. Real environment variables always win over the file.
    environ.Env.read_env(str(BASE_DIR / ".env"), overwrite=False)

API_VERSION = __version__

# --------------------------------------------------------------------------------------------
# Core
# --------------------------------------------------------------------------------------------
DEBUG = False
SECRET_KEY = env("DJANGO_SECRET_KEY", default="")
SECRET_KEY_FALLBACKS = env.list("DJANGO_SECRET_KEY_FALLBACKS", default=[])
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=[])

INSTALLED_APPS = [
    "medilink.core.admin_apps.MedilinkAdminConfig",  # django.contrib.admin, OTP-enforcing site
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "corsheaders",
    "channels",
    "django_otp",
    "django_otp.plugins.otp_totp",
    "medilink.core",
    "medilink.accounts",
    "medilink.tenancy",
    "medilink.authz",
    "medilink.audit",
    "medilink.patients",
    # ---- Wave 1 apps: each sprint adds lines ONLY between its own markers -----------------
    # (shared-file protocol: docs/architecture/contracts/README.md)
    # [S1] platform onboarding, master data, uploads
    # [/S1]
    # [S3] patients and identity (extends medilink.patients)
    # [/S3]
    # [S9] notifications
    # [/S9]
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "medilink.core.middleware.RequestIDMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "medilink.accounts.middleware.AudienceSessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "medilink.core.csrf.ApiCsrfEnforcementMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django_otp.middleware.OTPMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "medilink.tenancy.middleware.TenantContextMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "django.middleware.csp.ContentSecurityPolicyMiddleware",
    "medilink.core.middleware.SecurityHeadersMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.template.context_processors.csp",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]


# --------------------------------------------------------------------------------------------
# Database (PostgreSQL 17, psycopg 3). Two roles:
#   DATABASE_URL        runtime role (medilink_app): NOSUPERUSER NOBYPASSRLS, owns nothing
#   DATABASE_OWNER_URL  owner role (medilink_owner): used only by migrations (manage.py sets
#                       MEDILINK_DB_ROLE=owner for schema commands)
# --------------------------------------------------------------------------------------------
def database_config(role: str | None = None) -> dict[str, Any]:
    use_owner = (role or env("MEDILINK_DB_ROLE", default="app")) == "owner"
    url_var = (
        "DATABASE_OWNER_URL"
        if use_owner and env("DATABASE_OWNER_URL", default="")
        else "DATABASE_URL"
    )
    config: dict[str, Any] = env.db_url(url_var)
    # The request transaction is opened by TenantContextMiddleware (it must wrap the RLS context).
    config["ATOMIC_REQUESTS"] = False
    config["CONN_MAX_AGE"] = env.int("DATABASE_CONN_MAX_AGE", default=0)
    config["CONN_HEALTH_CHECKS"] = True
    config.setdefault("OPTIONS", {}).setdefault("connect_timeout", 10)
    timeout_ms = env.int("DATABASE_STATEMENT_TIMEOUT_MS", default=0)
    if timeout_ms:
        config.setdefault("OPTIONS", {})["options"] = f"-c statement_timeout={timeout_ms}"
    return config


DATABASES = {"default": database_config()}
DATABASE_APP_ROLE = env("DATABASE_APP_ROLE", default="medilink_app")
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --------------------------------------------------------------------------------------------
# Cache, channels, Celery (Redis)
# --------------------------------------------------------------------------------------------
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env("CACHE_URL", default="redis://127.0.0.1:6379/1"),
        "KEY_PREFIX": "medilink",
    }
}

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [env("CHANNEL_LAYER_URL", default="redis://127.0.0.1:6379/2")],
            "capacity": 1500,
            "expiry": 10,
        },
    }
}

# Celery: JSON only (never pickle), no result backend, time limits on every task (security 06 §8).
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://127.0.0.1:6379/0")
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_EVENT_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_RESULT_ACCEPT_CONTENT = ["json"]
CELERY_RESULT_BACKEND = None
CELERY_TASK_IGNORE_RESULT = True
CELERY_TASK_TIME_LIMIT = 60
CELERY_TASK_SOFT_TIME_LIMIT = 45
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=False)
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_WORKER_HIJACK_ROOT_LOGGER = False
CELERY_TIMEZONE = "UTC"

# --------------------------------------------------------------------------------------------
# Authentication, passwords, MFA
# --------------------------------------------------------------------------------------------
AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = ["medilink.accounts.backends.EmailBackend"]

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",  # Argon2id
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",  # only to upgrade legacy hashes
]
# NIST SP 800-63B-4: length + blocklists, no composition rules (security 03 §2).
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "medilink.accounts.validators.ContextualMinimumLengthValidator",
        "OPTIONS": {"staff_min_length": 12, "patient_min_length": 15},
    },
    {"NAME": "medilink.accounts.validators.MaximumLengthValidator", "OPTIONS": {"max_length": 256}},
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
        "OPTIONS": {"user_attributes": ("email", "full_name")},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "medilink.accounts.validators.BreachedPasswordValidator"},
    {"NAME": "medilink.accounts.validators.ContextWordsValidator"},
]
# Optional offline breached-password list: SHA-1 hashes, one per line (HIBP "HASH:count" format ok).
PASSWORD_BREACHED_HASHES_FILE = env("PASSWORD_BREACHED_HASHES_FILE", default="")
PASSWORD_RESET_TIMEOUT = 30 * 60  # 30 minutes, single use (security 03 §6)

OTP_TOTP_ISSUER = env("MFA_TOTP_ISSUER", default="MediLink Rwanda")
MFA_PENDING_TIMEOUT = 10 * 60  # password OK -> second factor must follow within 10 minutes
MFA_MAX_FAILURES = 5
MFA_LOCK_SECONDS = 15 * 60
# Development only: staff log in without the second factor. Refused unless DEBUG (medilink.E003)
# and reported by `check --deploy` (medilink.E004). Never set in staging or production.
DEV_SKIP_STAFF_MFA = False
MFA_RECOVERY_CODE_COUNT = 10

# Login protection (security 03 §6): progressive delay after 5 failures, 15 min lock after 10.
AUTH_LOCKOUT = {
    "DELAY_AFTER": 5,
    "LOCK_AFTER": 10,
    "LOCK_SECONDS": 15 * 60,
    "MAX_DELAY_SECONDS": 60,
    "WINDOW_SECONDS": 15 * 60,
}


# --------------------------------------------------------------------------------------------
# Sessions: one server-side session per audience, selected by URL prefix (ADR 0006).
# --------------------------------------------------------------------------------------------
def session_audiences(cookie_prefix: str) -> dict[str, dict[str, Any]]:
    return {
        "staff": {
            "COOKIE_NAME": env("STAFF_SESSION_COOKIE_NAME", default=f"{cookie_prefix}ml_staff"),
            "IDLE_TIMEOUT": env.int("STAFF_SESSION_IDLE_TIMEOUT", default=15 * 60),
            "ABSOLUTE_TIMEOUT": env.int("STAFF_SESSION_ABSOLUTE_TIMEOUT", default=12 * 3600),
            "PATH_PREFIXES": ["/api/v1/staff/", "/api/v1/platform/", "/ws/v1/staff/"],
        },
        "patient": {
            "COOKIE_NAME": env("PATIENT_SESSION_COOKIE_NAME", default=f"{cookie_prefix}ml_patient"),
            "IDLE_TIMEOUT": env.int("PATIENT_SESSION_IDLE_TIMEOUT", default=12 * 3600),
            "ABSOLUTE_TIMEOUT": env.int("PATIENT_SESSION_ABSOLUTE_TIMEOUT", default=30 * 86400),
            "PATH_PREFIXES": ["/api/v1/patient/", "/ws/v1/patient/"],
        },
        "admin": {
            "COOKIE_NAME": env("ADMIN_SESSION_COOKIE_NAME", default=f"{cookie_prefix}ml_admin"),
            "IDLE_TIMEOUT": 15 * 60,
            "ABSOLUTE_TIMEOUT": 12 * 3600,
            "PATH_PREFIXES": [f"/{ADMIN_URL}"],
        },
    }


ADMIN_ENABLED = env.bool("ADMIN_ENABLED", default=False)
ADMIN_URL = env("ADMIN_URL", default="ops-admin/")
SESSION_ENGINE = "medilink.accounts.session_store"
SESSION_AUDIENCES = session_audiences(cookie_prefix="__Host-")
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_PATH = "/"
SESSION_COOKIE_DOMAIN = None  # host-only
SESSION_COOKIE_NAME = SESSION_AUDIENCES["admin"]["COOKIE_NAME"]  # unused fallback

# CSRF: the SPA fetches the token from GET /api/v1/csrf/ and sends X-CSRFToken (ADR 0006).
CSRF_COOKIE_NAME = env("CSRF_COOKIE_NAME", default="__Host-ml_csrf")
CSRF_COOKIE_SECURE = True
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_USE_SESSIONS = False  # cookie-based, so the token works for every audience
CSRF_FAILURE_VIEW = "medilink.core.views.csrf_failure"


# --------------------------------------------------------------------------------------------
# Cross-origin: frontends are hosted separately (ADR 0006). Explicit allowlists, no wildcard.
# --------------------------------------------------------------------------------------------
def origin_settings(
    default_origins: list[str], *, require_https: bool = False
) -> tuple[list[str], list[str], list[str]]:
    cors = env.list("CORS_ALLOWED_ORIGINS", default=default_origins)
    csrf = env.list("CSRF_TRUSTED_ORIGINS", default=cors)
    ws = env.list("WS_ALLOWED_ORIGINS", default=cors)
    for origin in (*cors, *csrf, *ws):
        if "*" in origin or not origin.startswith(("http://", "https://")):
            raise ImproperlyConfigured(f"Invalid origin {origin!r}: explicit origins only.")
        if require_https and not origin.startswith("https://"):
            raise ImproperlyConfigured(f"Origin {origin!r} must use https in production.")
    return cors, csrf, ws


CORS_ALLOWED_ORIGINS, CSRF_TRUSTED_ORIGINS, WS_ALLOWED_ORIGINS = origin_settings([])
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOW_CREDENTIALS = True
CORS_URLS_REGEX = r"^/api/.*$"
CORS_ALLOW_HEADERS = (*default_headers, "accept-language", "x-request-id", "idempotency-key")
CORS_EXPOSE_HEADERS = ["X-Request-ID", "Retry-After"]
CORS_PREFLIGHT_MAX_AGE = 600

# Links in emails point at the frontends.
STAFF_APP_URL = env("STAFF_APP_URL", default="http://localhost:5173")
PATIENT_APP_URL = env("PATIENT_APP_URL", default="http://localhost:5174")

# --------------------------------------------------------------------------------------------
# Security headers (security 06 §2). Production adds HTTPS/HSTS in prod.py.
# --------------------------------------------------------------------------------------------
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
SECURE_CSP = {
    "default-src": [CSP.SELF],
    "script-src": [CSP.SELF, CSP.NONCE],
    "style-src": [CSP.SELF, CSP.NONCE],
    "img-src": [CSP.SELF, "data:"],
    "font-src": [CSP.SELF],
    "connect-src": [CSP.SELF],
    "frame-ancestors": [CSP.NONE],
    "base-uri": [CSP.SELF],
    "form-action": [CSP.SELF],
    "object-src": [CSP.NONE],
}
PERMISSIONS_POLICY = "camera=(), geolocation=(), microphone=(), payment=(), usb=()"

DATA_UPLOAD_MAX_MEMORY_SIZE = 2_621_440
FILE_UPLOAD_MAX_MEMORY_SIZE = 2_621_440
DATA_UPLOAD_MAX_NUMBER_FIELDS = 500

# Paths that never touch the database (no request transaction / RLS context needed).
TENANT_CONTEXT_EXEMPT_PATHS = ("/api/v1/health/", "/api/v1/csrf/", "/static/")

# --------------------------------------------------------------------------------------------
# Django REST framework + OpenAPI
# --------------------------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "medilink.accounts.authentication.StaffSessionAuthentication",
        "medilink.accounts.authentication.PatientSessionAuthentication",
    ],
    # Deny by default: every view must declare its own permission policy (security 04 §2).
    "DEFAULT_PERMISSION_CLASSES": ["medilink.authz.permissions.DenyAll"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_PAGINATION_CLASS": "medilink.core.pagination.DefaultPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "medilink.core.exceptions.api_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": ["medilink.core.throttling.BurstRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {
        "burst": env("THROTTLE_RATE_BURST", default="600/min"),
        "auth": env("THROTTLE_RATE_AUTH", default="60/min"),
        "mfa": env("THROTTLE_RATE_MFA", default="30/min"),
        "register": env("THROTTLE_RATE_REGISTER", default="20/hour"),
        "password_reset": env("THROTTLE_RATE_PASSWORD_RESET", default="10/hour"),
    },
    # Number of trusted reverse proxies in front of the app (X-Forwarded-For handling).
    "NUM_PROXIES": env.int("NUM_PROXIES", default=0),
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
    "DATETIME_FORMAT": "iso-8601",
}

SCHEMA_ENABLED = env.bool("SCHEMA_ENABLED", default=False)
SPECTACULAR_SETTINGS = {
    "TITLE": "MediLink Rwanda API",
    "DESCRIPTION": (
        "REST API for MediLink Rwanda. Audiences: /api/v1/staff (staff session cookie), "
        "/api/v1/patient (patient session cookie), /api/v1/auth (audience-neutral). "
        "Errors use the envelope {error: {code, message, fields, request_id}}."
    ),
    "VERSION": API_VERSION,
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": r"/api/v1",
    "COMPONENT_SPLIT_REQUEST": True,
    "SERVE_PERMISSIONS": ["medilink.authz.permissions.PublicEndpoint"],
    "SERVE_AUTHENTICATION": [],
    "ENUM_NAME_OVERRIDES": {
        "LanguageEnum": "medilink.accounts.models.Language",
        "LoginStatusEnum": "medilink.accounts.serializers.LOGIN_STATUS_CHOICES",
        "RoleCodeEnum": "medilink.tenancy.models.RoleCode",
    },
}

# --------------------------------------------------------------------------------------------
# Internationalisation: messages are localised, codes stable. Timestamps are UTC with Z.
# --------------------------------------------------------------------------------------------
LANGUAGE_CODE = "en"
LANGUAGES = [("rw", "Kinyarwanda"), ("en", "English"), ("fr", "Français")]
LOCALE_PATHS = [BASE_DIR / "locale"]
USE_I18N = True
USE_TZ = True
TIME_ZONE = "UTC"

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"


# --------------------------------------------------------------------------------------------
# Email
# --------------------------------------------------------------------------------------------
def mailers_config(email_url: str) -> dict[str, dict[str, Any]]:
    """Django 6.1 MAILERS from one URL: smtp://, smtp+tls://, smtp+ssl://, console://, locmem://."""
    url = urlsplit(email_url)
    if url.scheme in {"console", "locmem"}:
        return {"default": {"BACKEND": f"django.core.mail.backends.{url.scheme}.EmailBackend"}}
    if url.scheme not in {"smtp", "smtp+tls", "smtp+ssl"}:
        raise ImproperlyConfigured(f"Unsupported EMAIL_URL scheme {url.scheme!r}.")
    return {
        "default": {
            "BACKEND": "django.core.mail.backends.smtp.EmailBackend",
            "OPTIONS": {
                "host": url.hostname or "localhost",
                "port": url.port or (465 if url.scheme == "smtp+ssl" else 25),
                "username": unquote(url.username or ""),
                "password": unquote(url.password or ""),
                "use_tls": url.scheme == "smtp+tls",
                "use_ssl": url.scheme == "smtp+ssl",
                "timeout": 10,
            },
        }
    }


MAILERS = mailers_config(env("EMAIL_URL", default="smtp://127.0.0.1:1025"))
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="MediLink Rwanda <no-reply@medilink.test>")

# --------------------------------------------------------------------------------------------
# Logging: structured, request ID on every line, personal data scrubbed (security 08 §1).
# --------------------------------------------------------------------------------------------
LOG_LEVEL = env("LOG_LEVEL", default="INFO")
LOG_FORMAT = env("LOG_FORMAT", default="json")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "request_id": {"()": "medilink.core.logging.RequestIDFilter"},
        "redact": {"()": "medilink.core.logging.RedactPersonalDataFilter"},
    },
    "formatters": {
        "json": {"()": "medilink.core.logging.JSONFormatter"},
        "text": {"()": "medilink.core.logging.TextFormatter"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "filters": ["request_id", "redact"],
            "formatter": LOG_FORMAT,
        }
    },
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
    "loggers": {
        "django.db.backends": {"level": "WARNING"},
        "celery": {"level": "INFO"},
    },
}
