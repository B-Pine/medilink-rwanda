"""R1 configuration hardening: no silent dev settings, HSTS preload opt-in, clean throttle rates."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from django.conf import settings

from config import environment
from tests.test_b13_deploy_check import _run, prod_env


def test_settings_module_comes_from_the_environment_first(
    monkeypatch: Any, tmp_path: Path
) -> None:
    dot_env = tmp_path / ".env"
    dot_env.write_text("DJANGO_SETTINGS_MODULE=config.settings.dev\n", encoding="utf-8")
    monkeypatch.setenv("DJANGO_SETTINGS_MODULE", "config.settings.test")
    assert environment.require_settings_module(dot_env) == "config.settings.test"


def test_settings_module_falls_back_to_dot_env_only(monkeypatch: Any, tmp_path: Path) -> None:
    dot_env = tmp_path / ".env"
    dot_env.write_text("# comment\nOTHER=1\nDJANGO_SETTINGS_MODULE='config.settings.dev'\n")
    monkeypatch.delenv("DJANGO_SETTINGS_MODULE", raising=False)
    monkeypatch.delenv("DJANGO_READ_DOT_ENV", raising=False)
    assert environment.require_settings_module(dot_env) == "config.settings.dev"
    monkeypatch.delenv("DJANGO_SETTINGS_MODULE", raising=False)
    monkeypatch.setenv("DJANGO_READ_DOT_ENV", "false")
    with pytest.raises(environment.SettingsModuleMissing):
        environment.require_settings_module(dot_env)
    monkeypatch.delenv("DJANGO_READ_DOT_ENV")
    with pytest.raises(environment.SettingsModuleMissing):
        environment.require_settings_module(tmp_path / "missing.env")
    dot_env.write_text("DJANGO_SETTINGS_MODULE=\n")
    with pytest.raises(environment.SettingsModuleMissing):
        environment.require_settings_module(dot_env)


def test_manage_py_refuses_to_start_without_a_settings_module() -> None:
    env = prod_env()
    del env["DJANGO_SETTINGS_MODULE"]
    result = _run(["manage.py", "check"], env)
    assert result.returncode != 0
    assert "DJANGO_SETTINGS_MODULE is not set" in result.stderr


@pytest.mark.parametrize(("flag", "expected"), [(None, False), ("true", True)])
def test_hsts_preload_is_opt_in(flag: str | None, expected: bool) -> None:
    env = prod_env(**({"SECURE_HSTS_PRELOAD": flag} if flag else {}))
    script = (
        "import json, django; django.setup(); from django.conf import settings as s; "
        "print(json.dumps(s.SECURE_HSTS_PRELOAD))"
    )
    result = _run(["-c", script], env)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout.strip().splitlines()[-1]) is expected
    check = _run(["manage.py", "check", "--deploy", "--fail-level", "WARNING"], env)
    assert check.returncode == 0, check.stdout + check.stderr


def test_throttle_rates_hold_only_rates() -> None:
    rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
    assert not [scope for scope in rates if scope.endswith("Enum")]
    assert all(rate is None or "/" in rate for rate in rates.values())
