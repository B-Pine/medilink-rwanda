"""S3-B6: key checks. E001 without keys, E002 for invalid keys, W001 only with DEBUG."""

from __future__ import annotations

from django.test import override_settings

from medilink.patients.checks import check_dev_keys, check_field_keys

NO_KEYS = {"field_keys": "", "field_active": "", "index_keys": "", "index_active": ""}


def _ids(messages: list) -> list[str]:
    return [m.id for m in messages]


def test_missing_keys_fail_the_deploy_check(monkeypatch) -> None:
    monkeypatch.delenv("MEDILINK_FIELD_KEYS", raising=False)
    monkeypatch.delenv("MEDILINK_BLIND_INDEX_KEYS", raising=False)
    with override_settings(PATIENT_KEYS=None, DEBUG=False):
        assert _ids(check_field_keys()) == ["patients.E001"]
        assert check_dev_keys() == []
    with override_settings(PATIENT_KEYS=None, DEBUG=True):
        assert _ids(check_dev_keys()) == ["patients.W001"]


def test_short_key_is_refused() -> None:
    import base64

    short = base64.urlsafe_b64encode(b"x" * 16).decode()
    long = base64.urlsafe_b64encode(b"y" * 32).decode()
    with override_settings(
        PATIENT_KEYS={
            "field_keys": f"1:{short}",
            "field_active": "1",
            "index_keys": f"1:{long}",
            "index_active": "1",
        },
        DEBUG=False,
    ):
        assert _ids(check_field_keys()) == ["patients.E002"]
