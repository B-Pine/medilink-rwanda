"""The permission catalogue extension used by parallel sprints (shared-file protocol)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from medilink.authz import catalogue


@pytest.fixture
def restore_catalogue() -> Iterator[None]:
    permissions = dict(catalogue.PERMISSIONS)
    grants = dict(catalogue.ROLE_GRANTS)
    yield
    catalogue.PERMISSIONS.clear()
    catalogue.PERMISSIONS.update(permissions)
    catalogue.ROLE_GRANTS.clear()
    catalogue.ROLE_GRANTS.update(grants)


def test_extend_adds_codes_and_grants(restore_catalogue: None) -> None:
    catalogue.extend(
        {"example.read": "Read examples"}, {"receptionist": frozenset({"example.read"})}
    )
    assert catalogue.PERMISSIONS["example.read"] == "Read examples"
    assert "example.read" in catalogue.ROLE_GRANTS["receptionist"]
    assert "queue.operate" in catalogue.ROLE_GRANTS["receptionist"]  # existing grants kept


@pytest.mark.parametrize(
    ("permissions", "grants", "message"),
    [
        ({"facility.configure": "dup"}, {}, "already defined"),
        ({"example.read": "x"}, {"nurse": frozenset({"example.read"})}, "Unknown role"),
        ({"example.read": "x"}, {"doctor": frozenset({"missing.code"})}, "unknown permissions"),
    ],
)
def test_extend_rejects_invalid_input_without_side_effects(
    restore_catalogue: None,
    permissions: dict[str, str],
    grants: dict[str, frozenset[str]],
    message: str,
) -> None:
    before = (dict(catalogue.PERMISSIONS), dict(catalogue.ROLE_GRANTS))
    with pytest.raises(ValueError, match=message):
        catalogue.extend(permissions, grants)
    assert (dict(catalogue.PERMISSIONS), dict(catalogue.ROLE_GRANTS)) == before
