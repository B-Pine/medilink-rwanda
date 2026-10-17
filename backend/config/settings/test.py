"""Test settings (pytest). Requires PostgreSQL (RLS and triggers are part of what is tested).

The test database is created and migrated by the owner role (DATABASE_OWNER_URL, needs CREATEDB);
tests/conftest.py then switches every connection to the runtime role (DATABASE_APP_ROLE) so the
whole suite runs with the same privileges and row-level security as production.
"""

from .base import *
from .base import SPECTACULAR_SETTINGS, database_config, origin_settings, session_audiences

DEBUG = False
SECRET_KEY = "test-only-secret-key-not-used-anywhere-else-0123456789abcdef"  # noqa: S105
ALLOWED_HOSTS = ["testserver", "localhost", "127.0.0.1"]

DATABASES = {"default": database_config(role="owner")}

SESSION_AUDIENCES = session_audiences(cookie_prefix="")
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
CSRF_COOKIE_NAME = "ml_csrf"

CORS_ALLOWED_ORIGINS, CSRF_TRUSTED_ORIGINS, WS_ALLOWED_ORIGINS = origin_settings(
    ["http://localhost:5173", "http://localhost:5174"]
)

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
MAILERS = {"default": {"BACKEND": "django.core.mail.backends.locmem.EmailBackend"}}
CELERY_TASK_ALWAYS_EAGER = True
CELERY_BROKER_URL = "memory://"

# Still Argon2id (asserted by tests), with low cost parameters to keep the suite fast.
PASSWORD_HASHERS = [
    "tests.hashers.FastArgon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]

ADMIN_ENABLED = True
SCHEMA_ENABLED = True
SPECTACULAR_SETTINGS = {**SPECTACULAR_SETTINGS}
