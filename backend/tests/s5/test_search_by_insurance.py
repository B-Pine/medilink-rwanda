"""Search by insurance (2026-11-18): an insurer chosen or typed ("rama", "mutuelle"), only the
places that take it on request, those first otherwise, and free text over name, place, service."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from medilink.facilities.models import PublicListing
from medilink.scheduling import listing

pytestmark = pytest.mark.django_db
SEARCH = "/api/v1/public/facilities/search/"


def _row(
    name: str, slug: str, insurers: dict[str, Any], service: str = "General consultation"
) -> None:
    PublicListing.objects.create(
        facility_id=uuid.uuid4(),
        facility_slug=slug,
        facility_name=name,
        facility_type="health_center",
        ownership="public",
        sector="Remera",
        district="Gasabo",
        service_id=uuid.uuid4(),
        service_code="general_consultation",
        service_name_i18n={"en": service, "rw": "Isuzumwa rusange"},
        insurers=insurers,
        updated_at=timezone.now(),
    )


@pytest.fixture
def places() -> None:
    _row("Remera Health Centre", "remera", {"mutuelle": {}, "rama": {}})
    _row("Kibagabaga Hospital", "kibagabaga", {"rama": {}, "mmi": {}})
    _row("Nyamata Clinic", "nyamata", {}, service="Dental care")


def search(**body: Any) -> dict[str, Any]:
    response = APIClient().post(SEARCH, body, format="json")
    assert response.status_code == 200, response.content
    return dict(response.json())


def slugs(data: dict[str, Any]) -> list[str]:
    return [r["slug"] for r in data["results"]]


def test_typing_an_insurer_finds_the_places_that_take_it(places: None) -> None:
    data = search(q="RAMA")
    assert sorted(slugs(data)) == ["kibagabaga", "remera"]
    assert data["insurer_code"] == "rama"
    assert all(r["accepts_insurance"] == "yes" for r in data["results"])
    assert slugs(search(q="mutuelle")) == ["remera"]
    assert slugs(search(q="cbhi remera")) == ["remera"]  # insurer and a place together


def test_a_chosen_insurer_puts_those_who_take_it_first_or_only(places: None) -> None:
    ranked = search(insurer_code="mmi")
    assert slugs(ranked)[0] == "kibagabaga"
    assert len(ranked["results"]) == 3  # the others still show, marked "no"
    assert {r["accepts_insurance"] for r in ranked["results"][1:]} == {"no"}
    assert slugs(search(insurer_code="mmi", insured_only=True)) == ["kibagabaga"]


def test_free_text_matches_name_place_and_service(places: None) -> None:
    assert slugs(search(q="kibagabaga")) == ["kibagabaga"]
    assert slugs(search(q="dental")) == ["nyamata"]
    assert len(search(q="gasabo")["results"]) == 3
    assert search(q="nowhere")["results"] == []


def test_parse_text() -> None:
    assert listing.parse_text("RSSB dental") == ("rama", "dental")
    assert listing.parse_text("") == (None, "")
