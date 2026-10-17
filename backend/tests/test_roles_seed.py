"""Roles and permissions seeded by data migration match the catalogue (analysis 02 §3, FR-ACC-03)."""

from __future__ import annotations

import pytest

from medilink.authz.catalogue import PERMISSIONS, ROLE_GRANTS, ROLES
from medilink.tenancy.models import Permission, Role

pytestmark = pytest.mark.django_db


def test_seeded_permissions_match_catalogue() -> None:
    assert dict(Permission.objects.values_list("code", "description")) == PERMISSIONS


def test_seeded_roles_match_catalogue() -> None:
    assert dict(Role.objects.values_list("code", "name")) == ROLES
    for role in Role.objects.prefetch_related("permissions"):
        assert {p.code for p in role.permissions.all()} == ROLE_GRANTS[role.code], role.code


def test_contract_permission_codes_exist() -> None:
    contract = {
        "facility.configure",
        "staff.manage",
        "queue.operate",
        "clinical.write",
        "clinical.sign",
        "pharmacy.dispense",
        "billing.record_payment",
        "billing.approve",
        "reports.view",
        "audit.view",
    }
    assert contract <= set(PERMISSIONS)


def test_matrix_boundaries() -> None:
    """Spot checks of analysis 02 §2 boundaries."""
    assert (
        "clinical.write" not in ROLE_GRANTS["facility_admin"]
    )  # admin can't write clinical records
    assert "clinical.view" not in ROLE_GRANTS["receptionist"]  # reception never sees diagnoses
    assert "clinical.view" not in ROLE_GRANTS["pharmacist"]
    assert "pharmacy.dispense" in ROLE_GRANTS["pharmacist"]
    assert "billing.approve" in ROLE_GRANTS["facility_admin"]
    assert "billing.approve" not in ROLE_GRANTS["receptionist"]
    assert "audit.view" in ROLE_GRANTS["facility_admin"]
    for grants in ROLE_GRANTS.values():
        assert grants <= set(PERMISSIONS)
