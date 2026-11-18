"""A listing the background jobs have not rebuilt never shows a time that has passed
(2026-11-18: cards said "Next time Fri, Nov 6" on Nov 18), and the deploy command rebuilds it."""

from __future__ import annotations

import datetime as dt
import uuid
from io import StringIO

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from medilink.facilities.models import PublicListing

pytestmark = pytest.mark.django_db
SEARCH = "/api/v1/public/facilities/search/"


def _row(slug: str, next_slot: dt.datetime | None) -> None:
    PublicListing.objects.create(
        facility_id=uuid.uuid4(),
        facility_slug=slug,
        facility_name=slug.title(),
        facility_type="health_center",
        ownership="public",
        service_id=uuid.uuid4(),
        service_code="general_consultation",
        service_name_i18n={"en": "General consultation"},
        insurers={},
        next_slot_at=next_slot,
        allows_walk_in=False,
        allows_remote_join=False,
        updated_at=timezone.now(),
    )


def test_a_past_time_is_never_shown_or_counted_as_today() -> None:
    now = timezone.now()
    _row("stale", now - dt.timedelta(days=12))
    _row("fresh", now + dt.timedelta(hours=1))
    results = {r["slug"]: r for r in APIClient().post(SEARCH, {}, format="json").json()["results"]}
    assert results["stale"]["next_slot_at"] is None
    assert results["fresh"]["next_slot_at"] is not None
    today = APIClient().post(SEARCH, {"available_today": True}, format="json").json()
    assert "stale" not in [r["slug"] for r in today["results"]]


def test_the_deploy_command_adds_times_and_rebuilds_the_listing() -> None:
    out = StringIO()
    call_command("refresh_listing", stdout=out)
    assert "Appointment times added" in out.getvalue()
    assert "Public listing rebuilt" in out.getvalue()
