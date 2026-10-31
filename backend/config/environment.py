"""Settings-module selection shared by manage.py, ASGI, WSGI and Celery.

There is no silent fallback to `config.settings.dev`: a container or worker that forgets
DJANGO_SETTINGS_MODULE must fail at start, not run with DEBUG and dev secrets. Local development
keeps working because backend/.env (from .env.example) sets the variable explicitly.
"""

from __future__ import annotations

import os
from pathlib import Path

DOT_ENV = Path(__file__).resolve().parent.parent / ".env"
VARIABLE = "DJANGO_SETTINGS_MODULE"


class SettingsModuleMissing(RuntimeError):
    pass


def _from_dot_env(path: Path) -> str | None:
    if os.environ.get("DJANGO_READ_DOT_ENV", "true").lower() in {"0", "false", "no", "off"}:
        return None
    if not path.is_file():
        return None
    for line in path.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.strip().partition("=")
        if sep and key.strip() == VARIABLE:
            return value.strip().strip("'\"") or None
    return None


def require_settings_module(dot_env: Path = DOT_ENV) -> str:
    """Return DJANGO_SETTINGS_MODULE from the environment or backend/.env, or fail loudly."""
    module = os.environ.get(VARIABLE) or _from_dot_env(dot_env)
    if not module:
        raise SettingsModuleMissing(
            f"{VARIABLE} is not set. Export it (config.settings.dev | test | prod) or copy "
            "backend/.env.example to backend/.env."
        )
    os.environ[VARIABLE] = module
    return module
