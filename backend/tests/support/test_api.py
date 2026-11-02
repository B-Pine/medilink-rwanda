"""S10 part 1 endpoints (contract sprint-10 §3.2): authorisation matrix, help articles, support
requests, state machine, content and limit rules, notifications and audit (S10-B1..B10)."""

from __future__ import annotations

from typing import Any
from unittest import mock

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import transaction
from django.test import override_settings
from rest_framework.test import APIClient

from medilink.audit.models import AuditEntry
from medilink.authz import catalogue
from medilink.notifications.models import Notification
from medilink.support import services
from medilink.support.models import (
    AppendOnlyError,
    ArticleStatus,
    HelpArticle,
    SupportMessage,
    SupportRequest,
)
from medilink.support.throttling import SupportWriteThrottle
from medilink.tenancy.models import Permission, Role
from tests.conftest import error_code, login_patient, login_staff
from tests.factories import make_patient_user, make_staff

pytestmark = pytest.mark.django_db

ALL = {"rw": "x", "en": "x", "fr": "x"}


def _client(user: Any, staff: bool) -> APIClient:
    client = APIClient()
    (login_staff if staff else login_patient)(client, user)
    return client


@pytest.fixture
def world(facility: Any, other_facility: Any) -> dict[str, Any]:
    users = {
        "admin": make_staff(facility, roles=("facility_admin",)),
        "reception": make_staff(facility, roles=("receptionist",)),
        "doctor": make_staff(facility, roles=("doctor",)),
        "other_admin": make_staff(other_facility, roles=("facility_admin",)),
        "other_reception": make_staff(other_facility, roles=("receptionist",)),
        "platform": make_staff(None, email="plat.s10@example.test", is_platform_admin=True),
        "patient": make_patient_user(preferred_language="en"),
        "stranger": make_patient_user(),
    }
    return {"facility": facility, "other": other_facility, **users}


@pytest.fixture
def clients(world: dict[str, Any]) -> dict[str, APIClient]:
    staff = ("admin", "reception", "doctor", "other_admin", "other_reception", "platform")
    out = {name: _client(world[name], staff=True) for name in staff}
    out["patient"] = _client(world["patient"], staff=False)
    out["stranger"] = _client(world["stranger"], staff=False)
    out["anon"] = APIClient()
    return out


def _article(author: Any, **kw: Any) -> HelpArticle:
    data = {
        "slug": "add-a-child",
        "audience": "patient",
        "category": "family_profile",
        "title_i18n": {"rw": "Kongeraho umwana", "en": "Add your child", "fr": "Ajouter"},
        "summary_i18n": {"rw": "Umuryango", "en": "Family profiles", "fr": "Famille"},
        "body_i18n": {"rw": "Fungura", "en": "Open Family", "fr": "Ouvrez Famille"},
        "status": ArticleStatus.PUBLISHED,
        "published_at": "2026-11-01T08:00:00Z",
        "created_by": author,
        "updated_by": author,
    }
    data.update(kw)
    return HelpArticle.objects.create(**data)


NEW = {"topic": "booking_visits", "subject": "Cancel booking", "body": "I can't cancel my booking."}


def _open(client: APIClient, base: str, **kw: Any) -> dict[str, Any]:
    response = client.post(f"/api/v1/{base}/support-requests/", {**NEW, **kw}, format="json")
    assert response.status_code == 201, response.content
    return dict(response.json())


# ---------------------------------------------------------------------------------------------
# Help articles
# ---------------------------------------------------------------------------------------------


def test_public_and_staff_articles_by_audience(
    world: dict[str, Any], clients: dict[str, APIClient]
) -> None:
    author = world["platform"]
    _article(author)
    _article(author, slug="draft-one", status=ArticleStatus.DRAFT, published_at=None)
    _article(author, slug="check-in", audience="staff", category="facility_work")
    anon = clients["anon"]
    body = anon.get("/api/v1/public/help-articles/").json()
    assert [a["slug"] for a in body["results"]] == ["add-a-child"]
    assert "body_i18n" not in body["results"][0]
    detail = anon.get("/api/v1/public/help-articles/add-a-child/").json()
    assert detail["body_i18n"]["en"] == "Open Family"
    for slug in ("draft-one", "check-in", "unknown"):
        assert anon.get(f"/api/v1/public/help-articles/{slug}/").status_code == 404
    staff = clients["reception"]
    rows = staff.get("/api/v1/staff/help-articles/").json()["results"]
    assert [a["slug"] for a in rows] == ["check-in"]
    assert staff.get("/api/v1/staff/help-articles/check-in/").status_code == 200
    assert staff.get("/api/v1/staff/help-articles/add-a-child/").status_code == 404
    # staff articles need a staff session with a facility
    assert anon.get("/api/v1/staff/help-articles/").status_code in (401, 403)
    assert clients["patient"].get("/api/v1/staff/help-articles/").status_code in (401, 403)
    assert clients["platform"].get("/api/v1/staff/help-articles/").status_code == 403


def test_article_search_and_filters(world: dict[str, Any], clients: dict[str, APIClient]) -> None:
    author = world["platform"]
    _article(author, sort_order=50)
    _article(
        author,
        slug="sign-in",
        category="account_security",
        sort_order=10,
        title_i18n={"en": "I can't sign in"},
        summary_i18n={"en": "Passwords"},
        body_i18n={"en": "Ask about your child at reception"},
    )
    anon = clients["anon"]
    found = anon.get("/api/v1/public/help-articles/?q=child").json()["results"]
    assert [a["slug"] for a in found] == ["add-a-child", "sign-in"]  # title match first
    assert [
        a["slug"] for a in anon.get("/api/v1/public/help-articles/?q=umwana").json()["results"]
    ] == ["add-a-child"]
    assert [
        a["slug"] for a in anon.get("/api/v1/public/help-articles/?q=FAMILLE").json()["results"]
    ] == ["add-a-child"]
    by_cat = anon.get("/api/v1/public/help-articles/?category=account_security").json()
    assert [a["slug"] for a in by_cat["results"]] == ["sign-in"]
    unfiltered = anon.get("/api/v1/public/help-articles/").json()["results"]
    assert [a["slug"] for a in unfiltered] == ["sign-in", "add-a-child"]  # sort_order
    for bad in ("?q=a", "?q=" + "x" * 101, "?category=nope"):
        response = anon.get("/api/v1/public/help-articles/" + bad)
        assert response.status_code == 400, bad
        assert error_code(response) == "validation_error"


def test_platform_article_lifecycle(world: dict[str, Any], clients: dict[str, APIClient]) -> None:
    platform = clients["platform"]
    payload = {
        "slug": "follow-your-turn",
        "audience": "patient",
        "category": "booking_visits",
        "title_i18n": {"rw": "Igihe cyawe", "en": "Follow your turn"},
        "summary_i18n": {"en": "Your ticket"},
        "body_i18n": {"en": "Open My visits.\n\n- One\n- Two"},
    }
    created = platform.post("/api/v1/platform/help-articles/", payload, format="json")
    assert created.status_code == 201, created.content
    article = created.json()
    assert article["status"] == "draft" and article["version"] == 1
    assert article["missing_languages"] == ["rw", "fr"]
    url = f"/api/v1/platform/help-articles/{article['id']}/"
    # the draft is invisible to the public
    assert clients["anon"].get("/api/v1/public/help-articles/follow-your-turn/").status_code == 404
    # publishing needs every language
    response = platform.post(url + "publish/")
    assert response.status_code == 422 and "rw, fr" in response.json()["error"]["message"]
    # stale version
    stale = platform.patch(url, {"version": 9, "sort_order": 5}, format="json")
    assert stale.status_code == 409
    complete = {
        "version": 1,
        "title_i18n": {"rw": "Igihe cyawe", "en": "Follow your turn", "fr": "Votre tour"},
        "summary_i18n": ALL,
        "body_i18n": ALL,
    }
    updated = platform.patch(url, complete, format="json")
    assert updated.status_code == 200, updated.content
    assert updated.json()["version"] == 2 and updated.json()["missing_languages"] == []
    # same values again: no new version
    assert platform.patch(url, {**complete, "version": 2}, format="json").json()["version"] == 2
    published = platform.post(url + "publish/")
    assert published.status_code == 200 and published.json()["status"] == "published"
    assert platform.post(url + "publish/").status_code == 409
    assert clients["anon"].get("/api/v1/public/help-articles/follow-your-turn/").status_code == 200
    unpublished = platform.post(url + "unpublish/")
    assert unpublished.json()["status"] == "draft" and unpublished.json()["published_at"] is None
    assert platform.post(url + "unpublish/").status_code == 409
    assert platform.get(url).json()["body_i18n"]["fr"] == "x"
    listing = platform.get("/api/v1/platform/help-articles/?status=draft&audience=patient").json()
    assert [a["slug"] for a in listing["results"]] == ["follow-your-turn"]
    assert platform.get("/api/v1/platform/help-articles/?q=turn").json()["count"] == 1
    assert platform.get("/api/v1/platform/help-articles/?status=nope").status_code == 400
    assert (
        platform.get(
            "/api/v1/platform/help-articles/00000000-0000-0000-0000-000000000000/"
        ).status_code
        == 404
    )
    actions = list(
        AuditEntry.objects.filter(object_id=article["id"]).values_list("action", flat=True)
    )
    assert actions == [
        "help.article.created",
        "help.article.updated",
        "help.article.published",
        "help.article.unpublished",
    ]
    entry = AuditEntry.objects.get(object_id=article["id"], action="help.article.updated")
    assert entry.metadata["fields"] == ["body_i18n", "summary_i18n", "title_i18n"]


def test_article_validation(world: dict[str, Any], clients: dict[str, APIClient]) -> None:
    platform = clients["platform"]
    _article(world["platform"])
    base = {"audience": "patient", "category": "other", "title_i18n": {"en": "T"}}
    cases = [
        ({**base, "slug": "Bad Slug"}, "slug"),
        ({**base, "slug": "double--hyphen"}, "slug"),
        ({**base, "slug": "add-a-child"}, "slug"),  # taken
        ({**base, "slug": "ok", "title_i18n": {"de": "Titel"}}, "title_i18n"),
        ({**base, "slug": "ok", "title_i18n": {"en": "x" * 121}}, "title_i18n"),
        ({**base, "slug": "ok", "title_i18n": {"en": "  "}}, "title_i18n"),
        ({**base, "slug": "ok", "sort_order": 1000}, "sort_order"),
        ({**base, "slug": "ok", "audience": "doctor"}, "audience"),
    ]
    for payload, field in cases:
        response = platform.post("/api/v1/platform/help-articles/", payload, format="json")
        assert response.status_code == 400, payload
        fields = response.json()["error"]["fields"]
        assert any(key.startswith(field) for key in fields), (payload, fields)
    article = HelpArticle.objects.get(slug="add-a-child")
    url = f"/api/v1/platform/help-articles/{article.pk}/"
    assert (
        "version" in platform.patch(url, {"sort_order": 3}, format="json").json()["error"]["fields"]
    )
    response = platform.patch(url, {"version": 1, "title_i18n": {}}, format="json")
    assert response.status_code == 400
    # renaming to its own slug is fine
    response = platform.patch(url, {"version": 1, "slug": "add-a-child"}, format="json")
    assert response.status_code == 200


def test_publish_needs_recent_step_up(world: dict[str, Any], clients: dict[str, APIClient]) -> None:
    article = _article(world["platform"], status=ArticleStatus.DRAFT, published_at=None)
    with mock.patch("medilink.authz.stepup.has_recent_auth", return_value=False):
        response = clients["platform"].post(f"/api/v1/platform/help-articles/{article.pk}/publish/")
    assert response.status_code == 403 and error_code(response) == "step_up_required"


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/platform/help-articles/",
        "/api/v1/platform/support-requests/",
    ],
)
def test_platform_endpoints_refuse_others(clients: dict[str, APIClient], path: str) -> None:
    for name in ("anon", "patient", "admin", "reception"):
        assert clients[name].get(path).status_code in (401, 403), name
    assert clients["platform"].get(path).status_code == 200
    with override_settings(PLATFORM_ALLOWED_NETWORKS="10.9.0.0/16"):
        assert clients["platform"].get(path).status_code == 403


# ---------------------------------------------------------------------------------------------
# Support requests: requesters
# ---------------------------------------------------------------------------------------------


def test_patient_request_lifecycle(world: dict[str, Any], clients: dict[str, APIClient]) -> None:
    patient = clients["patient"]
    created = _open(patient, "patient", client_path="/visits")
    assert created["reference"].startswith("SR-") and len(created["reference"]) == 9
    assert created["status"] == "open" and created["facility"] is None
    assert [m["author_kind"] for m in created["messages"]] == ["requester"]
    for hidden in ("priority", "assigned_to", "client_label", "client_path"):
        assert hidden not in created
    row = SupportRequest.objects.get(pk=created["id"])
    assert row.requester_audience == "patient" and row.language == "en"
    assert row.client_path == "/visits"
    # platform admins are told
    assert Notification.objects.filter(
        recipient_user=world["platform"], event_type="support.request.created"
    ).exists()
    url = f"/api/v1/patient/support-requests/{created['id']}/"
    # support replies -> answered, the patient is notified in their own inbox
    reply = clients["platform"].post(
        f"/api/v1/platform/support-requests/{created['id']}/replies/",
        {"body": "Open My visits and choose Cancel."},
        format="json",
    )
    assert reply.status_code == 201 and reply.json()["status"] == "answered"
    note = Notification.objects.get(
        recipient_user=world["patient"], event_type="support.request.answered"
    )
    assert note.audience == "patient" and note.action_path == f"/support/requests/{created['id']}"
    seen = patient.get(url).json()
    assert seen["messages"][-1]["author_name"] == "MediLink support"
    assert world["platform"].full_name not in str(seen)
    # requester follows up -> open; platform admins (no assignee) are told
    followed = patient.post(url + "messages/", {"body": "Thanks, it worked."}, format="json")
    assert followed.status_code == 201 and followed.json()["status"] == "open"
    assert Notification.objects.filter(event_type="support.request.followed_up").count() == 1
    listing = patient.get("/api/v1/patient/support-requests/?status=active").json()
    assert listing["count"] == 1 and listing["results"][0]["message_count"] == 3
    # requester closes -> withdrawn; twice -> 409; messages refused
    closed = patient.post(url + "close/", {}, format="json")
    assert closed.status_code == 200
    assert closed.json()["status"] == "closed" and closed.json()["close_reason"] == "withdrawn"
    assert patient.post(url + "close/", {}, format="json").status_code == 409
    refused = patient.post(url + "messages/", {"body": "Hello again"}, format="json")
    assert refused.status_code == 422 and error_code(refused) == "business_rule_violation"
    assert patient.get("/api/v1/patient/support-requests/?status=active").json()["count"] == 0
    assert patient.get("/api/v1/patient/support-requests/?status=closed").json()["count"] == 1
    assert patient.get("/api/v1/patient/support-requests/?status=nope").status_code == 400
    # requester close does not notify; audit trail has IDs and codes only
    assert not Notification.objects.filter(event_type="support.request.closed").exists()
    entries = AuditEntry.objects.filter(object_id=created["id"]).order_by("sequence")
    assert [e.action for e in entries] == [
        "support.request.created",
        "support.request.replied",
        "support.request.message_added",
        "support.request.closed",
    ]
    assert entries.last().metadata == {  # type: ignore[union-attr]
        "request_id": created["id"],
        "close_reason": "withdrawn",
        "by": "requester",
    }
    for entry in entries:
        assert "cancel" not in str(entry.metadata).lower()


def test_requests_are_own_only(world: dict[str, Any], clients: dict[str, APIClient]) -> None:
    mine = _open(clients["patient"], "patient")
    stranger = clients["stranger"]
    url = f"/api/v1/patient/support-requests/{mine['id']}/"
    assert stranger.get(url).status_code == 404
    assert stranger.post(url + "messages/", {"body": "x"}, format="json").status_code == 404
    assert stranger.post(url + "close/", {}, format="json").status_code == 404
    assert stranger.get("/api/v1/patient/support-requests/").json()["count"] == 0
    # audiences don't mix
    assert clients["reception"].get("/api/v1/patient/support-requests/").status_code in (401, 403)
    assert clients["patient"].get("/api/v1/staff/support-requests/").status_code in (401, 403)
    assert clients["anon"].get("/api/v1/patient/support-requests/").status_code in (401, 403)
    assert clients["anon"].post("/api/v1/patient/support-requests/", NEW).status_code in (401, 403)
    # staff never see a patient's request, even with the facility permission
    assert clients["admin"].get(f"/api/v1/staff/support-requests/{mine['id']}/").status_code == 404


def test_staff_requests_and_facility_view(
    world: dict[str, Any], clients: dict[str, APIClient]
) -> None:
    created = _open(clients["reception"], "staff", topic="technical")
    assert created["facility"]["id"] == str(world["facility"].pk)
    url = f"/api/v1/staff/support-requests/{created['id']}/"
    reception, admin, doctor = clients["reception"], clients["admin"], clients["doctor"]
    assert reception.get("/api/v1/staff/support-requests/").json()["count"] == 1
    # a colleague without the permission can't see it, nor ask for the facility scope
    assert doctor.get(url).status_code == 404
    assert doctor.get("/api/v1/staff/support-requests/?scope=facility").status_code == 403
    assert doctor.get("/api/v1/staff/support-requests/").json()["count"] == 0
    # the facility admin sees it read-only
    facility_rows = admin.get("/api/v1/staff/support-requests/?scope=facility").json()
    assert [r["id"] for r in facility_rows["results"]] == [created["id"]]
    assert facility_rows["results"][0]["requester"]["full_name"] == world["reception"].full_name
    assert admin.get("/api/v1/staff/support-requests/").json()["count"] == 0  # mine
    assert admin.get(url).status_code == 200
    write = admin.post(url + "messages/", {"body": "Me too"}, format="json")
    assert write.status_code == 403
    assert admin.post(url + "close/", {}, format="json").status_code == 403
    # another facility's admin sees nothing
    other = clients["other_admin"]
    assert other.get(url).status_code == 404
    assert other.get("/api/v1/staff/support-requests/?scope=facility").json()["count"] == 0
    assert admin.get("/api/v1/staff/support-requests/?scope=everything").status_code == 400
    # a reply reaches the receptionist's staff inbox in that facility
    clients["platform"].post(
        f"/api/v1/platform/support-requests/{created['id']}/replies/",
        {"body": "Please reload the page."},
        format="json",
    )
    note = Notification.objects.get(
        recipient_user=world["reception"], event_type="support.request.answered"
    )
    assert note.audience == "staff" and note.facility_id == world["facility"].pk
    # staff close their own
    assert reception.post(url + "close/", {}, format="json").status_code == 200


def test_clinical_words_and_text_rules(clients: dict[str, APIClient]) -> None:
    patient = clients["patient"]
    for field, text in (
        ("body", "I want my HIV test results please"),
        ("body", "Résultats du test VIH, s'il vous plaît"),
        ("subject", "Ibijyanye n'igituntu"),
    ):
        response = patient.post(
            "/api/v1/patient/support-requests/", {**NEW, field: text}, format="json"
        )
        assert response.status_code == 400, text
        fields = response.json()["error"]["fields"]
        assert "health details" in fields[field][0]
        assert "hiv" not in str(response.json()).lower()
    assert SupportRequest.objects.count() == 0
    for payload in (
        {**NEW, "body": "short"},
        {**NEW, "subject": "x"},
        {**NEW, "topic": "health"},
        {**NEW, "body": "Ten characters \x07 with a bell"},
        {**NEW, "client_path": "https://evil.example"},
    ):
        assert (
            patient.post("/api/v1/patient/support-requests/", payload, format="json").status_code
            == 400
        ), payload
    created = _open(patient, "patient")
    url = f"/api/v1/patient/support-requests/{created['id']}/messages/"
    assert patient.post(url, {"body": "It is about tuberculosis"}, format="json").status_code == 400
    assert patient.post(url, {"body": ""}, format="json").status_code == 400
    reply = clients["platform"].post(
        f"/api/v1/platform/support-requests/{created['id']}/replies/",
        {"body": "Tell us your diagnosis"},
        format="json",
    )
    assert reply.status_code == 400


def test_open_request_limit_and_throttle(clients: dict[str, APIClient]) -> None:
    patient = clients["patient"]
    first = _open(patient, "patient")
    for _ in range(4):
        _open(patient, "patient")
    sixth = patient.post("/api/v1/patient/support-requests/", NEW, format="json")
    assert sixth.status_code == 422 and error_code(sixth) == "business_rule_violation"
    patient.post(f"/api/v1/patient/support-requests/{first['id']}/close/", {}, format="json")
    _open(patient, "patient")  # a closed request frees a place
    with mock.patch.object(SupportWriteThrottle, "default_rate", "1/hour"):
        client = clients["stranger"]
        _open(client, "patient")
        again = client.post("/api/v1/patient/support-requests/", NEW, format="json")
        assert again.status_code == 429


# ---------------------------------------------------------------------------------------------
# Support requests: platform
# ---------------------------------------------------------------------------------------------


def test_platform_queue_triage_and_close(
    world: dict[str, Any], clients: dict[str, APIClient]
) -> None:
    platform = clients["platform"]
    patient_req = _open(clients["patient"], "patient", subject="Booking problem")
    staff_req = _open(clients["reception"], "staff", topic="technical", subject="Board frozen")
    url = f"/api/v1/platform/support-requests/{staff_req['id']}/"
    detail = platform.get(url).json()
    assert detail["requester_audience"] == "staff" and detail["priority"] == "normal"
    assert detail["messages"][0]["author_name"] == world["reception"].full_name
    # triage: high priority, assigned to me
    response = platform.patch(
        url,
        {"priority": "high", "assigned_to_id": str(world["platform"].pk), "version": 1},
        format="json",
    )
    assert response.status_code == 200, response.content
    assert response.json()["assigned_to"]["id"] == str(world["platform"].pk)
    assert response.json()["version"] == 2
    assert (
        platform.patch(url, {"priority": "normal", "version": 1}, format="json").status_code == 409
    )
    not_admin = platform.patch(
        url, {"assigned_to_id": str(world["admin"].pk), "version": 2}, format="json"
    )
    assert not_admin.status_code == 400 and "assigned_to_id" in not_admin.json()["error"]["fields"]
    assert platform.patch(url, {"version": 2}, format="json").json()["version"] == 2  # no change
    triaged = AuditEntry.objects.get(action="support.request.triaged")
    assert triaged.metadata["fields"] == ["assigned_to", "priority"]
    # queue: high first, filters
    queue = platform.get("/api/v1/platform/support-requests/").json()["results"]
    assert [r["id"] for r in queue] == [staff_req["id"], patient_req["id"]]
    assert "messages" not in queue[0]
    flt = "/api/v1/platform/support-requests/?"
    assert platform.get(flt + "audience=patient").json()["count"] == 1
    assert platform.get(flt + "assigned=me").json()["count"] == 1
    assert platform.get(flt + "assigned=none").json()["count"] == 1
    assert platform.get(flt + "topic=technical").json()["count"] == 1
    assert platform.get(flt + "priority=high").json()["count"] == 1
    assert platform.get(flt + f"facility_id={world['facility'].pk}").json()["count"] == 1
    assert platform.get(flt + f"q={patient_req['reference'].lower()}").json()["count"] == 1
    assert platform.get(flt + "q=frozen").json()["count"] == 1
    assert platform.get(flt + "status=active").json()["count"] == 2
    assert platform.get(flt + "status=answered").json()["count"] == 0
    for bad in ("facility_id=nope", "assigned=them", "status=x", "q=a"):
        assert platform.get(flt + bad).status_code == 400, bad
    assert (
        platform.get(
            "/api/v1/platform/support-requests/00000000-0000-0000-0000-000000000000/"
        ).status_code
        == 404
    )
    # follow-up goes to the assignee only
    clients["reception"].post(
        f"/api/v1/staff/support-requests/{staff_req['id']}/messages/",
        {"body": "Still frozen"},
        format="json",
    )
    assert list(
        Notification.objects.filter(event_type="support.request.followed_up").values_list(
            "recipient_user_id", flat=True
        )
    ) == [world["platform"].pk]
    # close with a reason and a closing message; requester is told
    assert platform.post(url + "close/", {"reason": "withdrawn"}, format="json").status_code == 400
    closed = platform.post(
        url + "close/", {"reason": "resolved", "body": "Fixed in the last update."}, format="json"
    )
    assert closed.status_code == 200
    assert closed.json()["close_reason"] == "resolved"
    assert closed.json()["closed_by"]["id"] == str(world["platform"].pk)
    assert closed.json()["messages"][-1]["author_kind"] == "support"
    assert Notification.objects.filter(
        recipient_user=world["reception"], event_type="support.request.closed"
    ).exists()
    assert platform.post(url + "close/", {"reason": "resolved"}, format="json").status_code == 409
    assert platform.post(url + "replies/", {"body": "Hi"}, format="json").status_code == 422
    version = closed.json()["version"]
    assert (
        platform.patch(url, {"priority": "normal", "version": version}, format="json").status_code
        == 422
    )
    assert platform.get(flt + "status=closed").json()["count"] == 1


def test_rolled_back_action_notifies_no_one(world: dict[str, Any]) -> None:
    def open_then_fail() -> None:
        with transaction.atomic():
            _open_directly(world["patient"])
            raise RuntimeError("caller fails")

    with pytest.raises(RuntimeError):
        open_then_fail()
    assert not SupportRequest.objects.exists()
    assert not Notification.objects.filter(event_type__startswith="support.").exists()


def _open_directly(user: Any) -> None:
    services.open_request(
        http_request=None,
        user=user,
        audience="patient",
        facility_id=None,
        topic="other",
        subject="Subject",
        body="Body text long enough",
        client_label="",
        client_path="",
    )


def test_messages_are_append_only(world: dict[str, Any], clients: dict[str, APIClient]) -> None:
    created = _open(clients["patient"], "patient")
    message = SupportMessage.objects.get(request_id=created["id"])
    message.body = "changed"
    with pytest.raises(AppendOnlyError):
        message.save()


def test_permission_seeded_and_registered() -> None:
    assert "support.view_facility" in catalogue.PERMISSIONS
    assert "support.view_facility" in catalogue.ROLE_GRANTS["facility_admin"]
    assert Permission.objects.filter(code="support.view_facility").exists()
    assert (
        Role.objects.get(code="facility_admin")
        .permissions.filter(code="support.view_facility")
        .exists()
    )


def test_seed_support_dev(world: dict[str, Any]) -> None:
    with pytest.raises(CommandError):
        call_command("seed_support_dev")
    with override_settings(DEBUG=True):
        call_command("seed_support_dev")
        call_command("seed_support_dev")  # idempotent
    assert HelpArticle.objects.filter(status="published").count() == 4
    assert all(not a.missing_languages() for a in HelpArticle.objects.all())


def test_seed_support_dev_without_platform_admin(db: Any) -> None:
    with override_settings(DEBUG=True):
        call_command("seed_support_dev")
    assert not HelpArticle.objects.exists()
