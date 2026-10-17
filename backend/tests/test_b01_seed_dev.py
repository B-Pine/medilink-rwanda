"""B1 (partly): seed_dev refuses unless DEBUG, and creates the demo data idempotently.
The rest of B1 (docker compose, migrate, runserver from a clean clone) is verified manually and in CI."""

from __future__ import annotations

from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings

from medilink.accounts.models import User
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import Facility, FacilityMembership

pytestmark = [pytest.mark.acceptance("B1"), pytest.mark.django_db]


def test_b1_seed_dev_refuses_without_debug() -> None:
    with pytest.raises(CommandError, match="DEBUG"):
        call_command("seed_dev", stdout=StringIO())


@override_settings(DEBUG=True)
def test_b1_seed_dev_creates_demo_data_and_is_idempotent() -> None:
    out = StringIO()
    call_command("seed_dev", stdout=out)
    call_command("seed_dev", "--password", "a fixed dev-only passphrase", stdout=out)
    kigali = Facility.objects.get(slug="kigali-demo-clinic")
    assert kigali.name == "Kigali Demo Clinic" and kigali.status == "live"
    assert User.objects.filter(email__endswith="@demo.medilink.test").count() == 6
    assert User.objects.get(email="platform.admin@demo.medilink.test").is_platform_admin
    with rls_context(facility_id=kigali.pk):
        roles = sorted(
            FacilityMembership.objects.filter(facility=kigali).values_list("roles__code", flat=True)
        )
    assert roles == ["doctor", "facility_admin", "pharmacist", "receptionist"]
    patient = User.objects.get(email="patient@demo.medilink.test")
    assert patient.check_password("a fixed dev-only passphrase")
    assert "a fixed dev-only passphrase" in out.getvalue()


@override_settings(DEBUG=True)
def test_b1_seed_dev_rejects_weak_password() -> None:
    with pytest.raises(CommandError, match="rejected"):
        call_command("seed_dev", "--password", "short", stdout=StringIO())
