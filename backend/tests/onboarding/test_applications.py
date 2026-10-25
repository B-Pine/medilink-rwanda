"""Facility applications: S1-B3 (state machine), S1-B4 (applicant access), S1-B5 (gates),
S1-B2 (applicant and platform access), S1-B19 (notifications)."""

from __future__ import annotations

import re
from typing import Any

import pytest
from django.core import mail
from rest_framework.test import APIClient

from medilink.audit.models import AuditEntry
from medilink.onboarding import services
from medilink.onboarding.models import (
    Application,
    ApplicationEvent,
    ApplicationStatus,
    FacilityLicence,
    FacilityStatusEvent,
)
from medilink.tenancy.models import Facility
from tests.conftest import error_code, login_patient, login_staff
from tests.factories import FacilityFactory, make_staff
from tests.masterdata.conftest import age_recent_auth
from tests.onboarding.conftest import (
    PLATFORM,
    PUBLIC,
    accept_all,
    approve_body,
    fill,
    start,
    submitted,
    under_review,
    upload,
)

pytestmark = pytest.mark.django_db


def _resume_token() -> str:
    body = mail.outbox[-1].body
    match = re.search(r"token=([A-Za-z0-9_\-]+)", body)
    assert match, body
    return match.group(1)


# ---- S1-B4: applicant access ----------------------------------------------------------------------


@pytest.mark.acceptance("S1-B4")
def test_start_sets_cookie_and_emails_resume_link(django_capture_on_commit_callbacks: Any) -> None:
    client = APIClient()
    with django_capture_on_commit_callbacks(execute=True):
        app = start(client)
    cookie = client.cookies["ml_applicant"]
    assert cookie["httponly"] and cookie["samesite"] == "Lax"
    assert cookie["path"] == "/api/v1/public/facility-applications/"
    assert app["status"] == "draft" and app["missing_for_submit"]
    subjects = [m.subject for m in mail.outbox]
    assert any(s.startswith("Continue your MediLink application") for s in subjects)
    token = _resume_token()
    row = Application.objects.get(pk=app["id"])
    assert row.resume_token_hash and token not in row.resume_token_hash
    assert AuditEntry.objects.filter(action="facility_application.started").exists()


@pytest.mark.acceptance("S1-B4")
def test_resume_is_single_use_and_replaces_the_session(
    django_capture_on_commit_callbacks: Any,
) -> None:
    first = APIClient()
    with django_capture_on_commit_callbacks(execute=True):
        app = start(first)
    token = _resume_token()
    second = APIClient()
    resumed = second.post(f"{PUBLIC}resume/", {"token": token}, format="json")
    assert resumed.status_code == 200 and resumed.json()["id"] == app["id"]
    assert second.get(f"{PUBLIC}{app['id']}/").status_code == 200
    assert first.get(f"{PUBLIC}{app['id']}/").status_code == 404  # earlier session ended
    again = APIClient().post(f"{PUBLIC}resume/", {"token": token}, format="json")
    assert again.status_code == 400
    assert APIClient().post(f"{PUBLIC}resume/", {"token": "nope"}, format="json").status_code == 400


@pytest.mark.acceptance("S1-B4")
def test_resume_links_never_enumerate(django_capture_on_commit_callbacks: Any) -> None:
    with django_capture_on_commit_callbacks(execute=True):
        start(APIClient(), email="a@example.test")
    mail.outbox.clear()
    with django_capture_on_commit_callbacks(execute=True):
        known = APIClient().post(
            f"{PUBLIC}resume-links/", {"email": "A@example.test"}, format="json"
        )
        unknown = APIClient().post(
            f"{PUBLIC}resume-links/", {"email": "b@example.test"}, format="json"
        )
    assert known.status_code == unknown.status_code == 202
    assert len(mail.outbox) == 1


@pytest.mark.acceptance("S1-B4")
def test_rate_limits(monkeypatch: Any) -> None:
    for _ in range(3):
        start(APIClient(), email="same@example.test")
    response = APIClient().post(
        PUBLIC,
        {"applicant": {"name": "X", "email": "same@example.test"}, "facility_name": "Y"},
        format="json",
    )
    assert response.status_code == 429
    for _ in range(3):
        APIClient().post(f"{PUBLIC}resume-links/", {"email": "c@example.test"}, format="json")
    assert (
        APIClient()
        .post(f"{PUBLIC}resume-links/", {"email": "c@example.test"}, format="json")
        .status_code
        == 429
    )


@pytest.mark.acceptance("S1-B2")
def test_other_applicants_and_anonymous_get_404() -> None:
    owner, other = APIClient(), APIClient()
    app = start(owner)
    start(other, email="other@example.test")
    for client in (other, APIClient()):
        assert client.get(f"{PUBLIC}{app['id']}/").status_code == 404
        assert (
            client.patch(f"{PUBLIC}{app['id']}/", {"version": 1}, format="json").status_code == 404
        )


def test_honeypot_and_unknown_fields() -> None:
    client = APIClient()
    trap = client.post(
        PUBLIC,
        {
            "applicant": {"name": "Bot", "email": "bot@example.test"},
            "facility_name": "X",
            "website": "spam",
        },
        format="json",
    )
    assert trap.status_code == 400
    app = start(client)
    unknown = client.patch(
        f"{PUBLIC}{app['id']}/", {"version": 1, "status": "approved"}, format="json"
    )
    assert unknown.status_code == 400 and "status" in unknown.json()["error"]["fields"]


def test_end_session() -> None:
    client = APIClient()
    app = start(client)
    assert client.post(f"{PUBLIC}{app['id']}/end-session/").status_code == 204
    assert client.get(f"{PUBLIC}{app['id']}/").status_code == 404


# ---- S1-B3, S1-B5: state machine and gates ---------------------------------------------------------


@pytest.mark.acceptance("S1-B5")
def test_submit_gate_reports_missing_items(
    village: str, django_capture_on_commit_callbacks: Any
) -> None:
    client = APIClient()
    app = start(client)
    body = {
        "version": app["version"],
        "accepted_terms_version": "",
        "accepted_dpa_version": "2026-10",
        "ncsa_registration_confirmed": False,
    }
    response = client.post(f"{PUBLIC}{app['id']}/submit/", body, format="json")
    assert response.status_code == 400
    fields = response.json()["error"]["fields"]
    assert {"location.village_code", "documents.moh_licence", "accepted_terms_version"} <= set(
        fields
    )
    # Public facilities don't need RDB or TIN documents.
    app = fill(client, app, village, ownership="public")
    assert (
        upload(
            client, PUBLIC, app["id"], "moh_licence", django_capture_on_commit_callbacks
        ).status_code
        == 201
    )
    missing = client.get(f"{PUBLIC}{app['id']}/").json()["missing_for_submit"]
    assert missing == ["documents.moh_licence"]  # number and expiry still missing


@pytest.mark.acceptance("S1-B5")
def test_unscanned_uploads_block_submit(village: str) -> None:
    from django.core.files.uploadedfile import SimpleUploadedFile

    from tests.uploads.conftest import make_pdf

    client = APIClient()
    app = fill(client, start(client), village, ownership="public")
    client.post(
        f"{PUBLIC}{app['id']}/documents/",
        {
            "file": SimpleUploadedFile("l.pdf", make_pdf()),
            "kind": "moh_licence",
            "number": "N1",
            "expires_on": "2030-01-01",
        },
        format="multipart",
    )  # no commit: still pending
    app = client.get(f"{PUBLIC}{app['id']}/").json()
    response = client.post(
        f"{PUBLIC}{app['id']}/submit/",
        {
            "version": app["version"],
            "accepted_terms_version": "2026-10",
            "accepted_dpa_version": "2026-10",
            "ncsa_registration_confirmed": True,
        },
        format="json",
    )
    assert response.status_code == 422


@pytest.mark.acceptance("S1-B3")
def test_full_flow_with_changes_requested(
    village: str, platform_client: APIClient, django_capture_on_commit_callbacks: Any
) -> None:
    applicant = APIClient()
    app = submitted(applicant, village, django_capture_on_commit_callbacks)
    assert app["status"] == "submitted"
    # Edits outside draft/changes_requested -> 422
    assert (
        applicant.patch(
            f"{PUBLIC}{app['id']}/", {"version": app["version"]}, format="json"
        ).status_code
        == 422
    )
    review = under_review(platform_client, app)
    assert review["reviewer"]["full_name"]
    stale = platform_client.post(
        f"{PLATFORM}{app['id']}/request-changes/",
        {
            "version": 1,
            "items": [{"target": "location.address", "comment": "Add the plot number."}],
        },
        format="json",
    )
    assert stale.status_code == 409
    no_items = platform_client.post(
        f"{PLATFORM}{app['id']}/request-changes/",
        {"version": review["version"], "items": []},
        format="json",
    )
    assert no_items.status_code == 400
    with django_capture_on_commit_callbacks(execute=True):
        changes = platform_client.post(
            f"{PLATFORM}{app['id']}/request-changes/",
            {
                "version": review["version"],
                "general_comment": "Almost there.",
                "items": [{"target": "location.address", "comment": "Add the plot number."}],
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY="rc-1",
        )
    assert changes.status_code == 200 and changes.json()["status"] == "changes_requested"
    replay = platform_client.post(
        f"{PLATFORM}{app['id']}/request-changes/",
        {"version": review["version"], "items": [{"target": "x", "comment": "y"}]},
        format="json",
        HTTP_IDEMPOTENCY_KEY="rc-1",
    )
    assert replay.status_code == 200 and replay.json()["version"] == changes.json()["version"]
    seen = applicant.get(f"{PUBLIC}{app['id']}/").json()
    assert seen["feedback"]["items"] == [
        {"target": "location.address", "comment": "Add the plot number."}
    ]
    assert "Changes needed: Clinique Ubuzima" in [m.subject for m in mail.outbox]
    patched = applicant.patch(
        f"{PUBLIC}{app['id']}/",
        {"version": seen["version"], "location": {"address": "KG 11 Ave 5, plot 12"}},
        format="json",
    )
    assert patched.status_code == 200
    resubmit = applicant.post(
        f"{PUBLIC}{app['id']}/submit/",
        {
            "version": patched.json()["version"],
            "accepted_terms_version": "2026-10",
            "accepted_dpa_version": "2026-10",
            "ncsa_registration_confirmed": True,
        },
        format="json",
    )
    assert resubmit.status_code == 200 and resubmit.json()["status"] == "submitted"
    statuses = list(
        ApplicationEvent.objects.filter(application_id=app["id"], kind="status_change")
        .order_by("occurred_at")
        .values_list("to_status", flat=True)
    )
    assert statuses == ["draft", "submitted", "under_review", "changes_requested", "submitted"]


@pytest.mark.acceptance("S1-B3")
@pytest.mark.parametrize(
    ("status", "allowed"),
    [
        ("draft", set()),
        ("submitted", {"start_review"}),
        ("under_review", {"request_changes", "approve", "reject"}),
        ("changes_requested", set()),
        ("approved", set()),
        ("rejected", set()),
    ],
)
def test_platform_transitions_only_from_allowed_statuses(
    status: str, allowed: set[str], platform_admin: Any
) -> None:
    from medilink.core.exceptions import BusinessRuleViolation

    attempts = {
        "start_review": lambda a: services.start_review(a, version=a.version, actor=platform_admin),
        "request_changes": lambda a: services.request_changes(
            a,
            version=a.version,
            general_comment="",
            items=[{"target": "x", "comment": "y"}],
            actor=platform_admin,
        ),
        "reject": lambda a: services.reject(
            a, version=a.version, reason_code="duplicate", reason_text="", actor=platform_admin
        ),
        "approve": lambda a: services.approve(
            a,
            version=a.version,
            slug=f"s-{a.pk}",
            organization_name="O",
            facility_type="private_clinic",
            ownership="private",
            licences=[{"kind": "moh_operating", "number": "N", "expires_on": "2030-01-01"}],
            actor=platform_admin,
        ),
    }
    for action, attempt in attempts.items():
        application = Application.objects.create(
            facility_name="F",
            applicant_name="A",
            applicant_email=f"{action}@example.test",
            status=status,
        )
        if action in allowed:
            attempt(application)
        else:
            with pytest.raises(BusinessRuleViolation):
                attempt(application)


@pytest.mark.acceptance("S1-B5")
def test_approve_creates_the_tenant(
    village: str, platform_client: APIClient, django_capture_on_commit_callbacks: Any
) -> None:
    from medilink.onboarding.services import application_approved

    received: list[dict[str, Any]] = []
    application_approved.connect(
        lambda **kw: received.append(kw), weak=False, dispatch_uid="test-approved"
    )
    try:
        app = under_review(
            platform_client, submitted(APIClient(), village, django_capture_on_commit_callbacks)
        )
        gate = platform_client.post(
            f"{PLATFORM}{app['id']}/approve/", approve_body(app), format="json"
        )
        assert gate.status_code == 422  # documents not accepted yet
        accept_all(platform_client, app)
        app = platform_client.get(f"{PLATFORM}{app['id']}/").json()
        FacilityFactory(slug="taken")
        taken = platform_client.post(
            f"{PLATFORM}{app['id']}/approve/", approve_body(app, slug="taken"), format="json"
        )
        assert taken.status_code == 400 and "slug" in taken.json()["error"]["fields"]
        with django_capture_on_commit_callbacks(execute=True):
            approved = platform_client.post(
                f"{PLATFORM}{app['id']}/approve/",
                approve_body(app),
                format="json",
                HTTP_IDEMPOTENCY_KEY="ap-1",
            )
        assert approved.status_code == 200, approved.content
        body = approved.json()
        assert body["application"]["status"] == "approved"
        facility = Facility.objects.get(pk=body["facility"]["id"])
        # S2's approval hook then invites the proposed admin and moves the facility to setup
        assert facility.status == "setup" and facility.organization.name == "Ubuzima Ltd"
        assert body["application"]["facility_id"] == str(facility.pk)
        assert FacilityLicence.objects.filter(facility=facility, kind="moh_operating").count() == 1
        assert list(
            FacilityStatusEvent.objects.filter(facility=facility)
            .order_by("occurred_at")
            .values_list("to_status", flat=True)
        ) == ["approved", "setup"]
        assert received == [
            {
                "signal": application_approved,
                "sender": Application,
                "application_id": facility_application_id(body),
                "facility_id": facility.pk,
            }
        ]
        replay = platform_client.post(
            f"{PLATFORM}{app['id']}/approve/",
            approve_body(app),
            format="json",
            HTTP_IDEMPOTENCY_KEY="ap-1",
        )
        assert replay.status_code == 200 and replay.json()["facility"]["id"] == str(facility.pk)
        assert Facility.objects.filter(slug="clinique-ubuzima").count() == 1
        assert "Approved: Clinique Ubuzima" in [m.subject for m in mail.outbox]
    finally:
        application_approved.disconnect(dispatch_uid="test-approved")


def facility_application_id(body: dict[str, Any]) -> Any:
    from uuid import UUID

    return UUID(body["application"]["id"])


@pytest.mark.acceptance("S1-B5")
def test_reject_needs_reason_and_step_up(
    village: str, platform_client: APIClient, django_capture_on_commit_callbacks: Any
) -> None:
    app = under_review(
        platform_client, submitted(APIClient(), village, django_capture_on_commit_callbacks)
    )
    url = f"{PLATFORM}{app['id']}/reject/"
    assert (
        platform_client.post(
            url, {"version": app["version"], "reason_code": "nope"}, format="json"
        ).status_code
        == 400
    )
    other = platform_client.post(
        url, {"version": app["version"], "reason_code": "other"}, format="json"
    )
    assert other.status_code == 400 and "reason_text" in other.json()["error"]["fields"]
    age_recent_auth(platform_client)
    blocked = platform_client.post(
        url, {"version": app["version"], "reason_code": "duplicate"}, format="json"
    )
    assert blocked.status_code == 403 and error_code(blocked) == "step_up_required"
    approve = platform_client.post(
        f"{PLATFORM}{app['id']}/approve/", approve_body(app), format="json"
    )
    assert error_code(approve) == "step_up_required"


@pytest.mark.acceptance("S1-B19")
def test_rejection_email_carries_the_reason(
    village: str, platform_client: APIClient, django_capture_on_commit_callbacks: Any
) -> None:
    applicant = APIClient()
    app = under_review(
        platform_client, submitted(applicant, village, django_capture_on_commit_callbacks)
    )
    with django_capture_on_commit_callbacks(execute=True):
        response = platform_client.post(
            f"{PLATFORM}{app['id']}/reject/",
            {
                "version": app["version"],
                "reason_code": "duplicate",
                "reason_text": "Already registered.",
            },
            format="json",
        )
    assert response.status_code == 200
    email = next(m for m in mail.outbox if m.subject.startswith("Application not approved"))
    assert "Duplicate application" in email.body and "Already registered." in email.body
    feedback = applicant.get(f"{PUBLIC}{app['id']}/")
    assert feedback.status_code == 200
    assert feedback.json()["feedback"]["rejection"]["reason_code"] == "duplicate"


@pytest.mark.acceptance("S1-B19")
def test_submission_notifies_applicant_and_super_admins(
    village: str, platform_admin: Any, django_capture_on_commit_callbacks: Any
) -> None:
    submitted(APIClient(), village, django_capture_on_commit_callbacks)
    by_subject = {m.subject: m.to for m in mail.outbox}
    assert by_subject["Application received: Clinique Ubuzima"] == ["jeanne@ubuzima.example"]
    assert by_subject["New facility application: Clinique Ubuzima"] == [platform_admin.email]


# ---- platform features -----------------------------------------------------------------------------


def test_platform_create_list_notes_events_hints(
    village: str, platform_client: APIClient, django_capture_on_commit_callbacks: Any
) -> None:
    with django_capture_on_commit_callbacks(execute=True):
        created = platform_client.post(
            PLATFORM,
            {
                "applicant": {"name": "Uwase", "email": "jeanne@ubuzima.example"},
                "facility": {"name": "Clinique Ubuzima"},
                "send_link": True,
            },
            format="json",
        )
    assert created.status_code == 201, created.content
    data = created.json()
    assert data["created_by_platform"] is True and data["suggested_slug"] == "clinique-ubuzima"
    assert any(m.subject.startswith("Continue your MediLink application") for m in mail.outbox)
    submitted(APIClient(), village, django_capture_on_commit_callbacks)
    listing = platform_client.get(PLATFORM).json()
    assert [a["status"] for a in listing["results"]] == ["submitted"]  # drafts only when asked
    drafts = platform_client.get(
        PLATFORM, {"status": "draft", "created_by_platform": "true"}
    ).json()
    assert drafts["count"] == 1
    other = Application.objects.exclude(pk=data["id"]).get()
    hints = platform_client.get(f"{PLATFORM}{other.pk}/").json()["duplicate_hints"]
    assert {
        "kind": "same_applicant_email",
        "application_id": data["id"],
        "facility_id": None,
    } in hints
    note = platform_client.post(
        f"{PLATFORM}{other.pk}/notes/",
        {"note_kind": "call", "text": "Called the director."},
        format="json",
    )
    assert note.status_code == 201
    assert [n["note"] for n in platform_client.get(f"{PLATFORM}{other.pk}/notes/").json()] == [
        "Called the director."
    ]
    events = platform_client.get(f"{PLATFORM}{other.pk}/events/").json()
    assert {e["kind"] for e in events} >= {"status_change", "note", "link_sent"}
    edit = platform_client.patch(
        f"{PLATFORM}{data['id']}/",
        {"version": data["version"], "facility": {"phone": "+250788999999"}},
        format="json",
    )
    assert edit.status_code == 200
    assert ApplicationEvent.objects.get(
        application_id=data["id"], kind="platform_edit"
    ).metadata == {"fields": ["phone"]}
    assert platform_client.post(f"{PLATFORM}{data['id']}/send-resume-link/").status_code == 202


def test_platform_document_upload_review_and_link(
    village: str, platform_client: APIClient, django_capture_on_commit_callbacks: Any
) -> None:
    created = platform_client.post(
        PLATFORM,
        {"applicant": {"name": "U", "email": "u@example.test"}, "facility": {"name": "F"}},
        format="json",
    ).json()
    doc = upload(
        platform_client,
        PLATFORM,
        created["id"],
        "accreditation",
        django_capture_on_commit_callbacks,
    )
    assert doc.status_code == 201
    document = doc.json()
    link = platform_client.post(
        f"{PLATFORM}{created['id']}/documents/{document['id']}/download-links/", {}, format="json"
    )
    assert link.status_code == 200
    assert AuditEntry.objects.filter(action="facility_application.document_viewed").exists()
    review = platform_client.post(
        f"{PLATFORM}{created['id']}/documents/{document['id']}/review/",
        {"review_status": "accepted"},
        format="json",
    )
    assert review.status_code == 422  # not under review


def test_document_limits_and_delete(village: str, django_capture_on_commit_callbacks: Any) -> None:
    client = APIClient()
    app = start(client)
    doc = upload(client, PUBLIC, app["id"], "other", django_capture_on_commit_callbacks).json()
    stored = client.get(f"{PUBLIC}{app['id']}/").json()["documents"][0]["upload"]
    assert stored["status"] == "clean" and stored["is_attached"]
    patched = client.patch(
        f"{PUBLIC}{app['id']}/documents/{doc['id']}/", {"number": "X-1"}, format="json"
    )
    assert patched.json()["number"] == "X-1"
    assert client.delete(f"{PUBLIC}{app['id']}/documents/{doc['id']}/").status_code == 204
    assert client.get(f"{PUBLIC}{app['id']}/").json()["documents"] == []
    services.MAX_DOCUMENTS, previous = 0, services.MAX_DOCUMENTS
    try:
        assert (
            upload(
                client, PUBLIC, app["id"], "other", django_capture_on_commit_callbacks
            ).status_code
            == 422
        )
    finally:
        services.MAX_DOCUMENTS = previous


@pytest.mark.acceptance("S1-B2")
def test_platform_matrix(
    facility: Any, patient_user: Any, platform_admin: Any, settings: Any
) -> None:
    urls = [
        PLATFORM,
        "/api/v1/platform/overview/",
        "/api/v1/platform/facilities/",
        "/api/v1/platform/feature-flags/",
    ]
    for url in urls:
        assert APIClient().get(url).status_code == 401
    patient = APIClient()
    login_patient(patient, patient_user)
    for role in ("facility_admin", "receptionist", "doctor"):
        client = APIClient()
        login_staff(client, make_staff(facility, roles=(role,), email=f"{role}@example.test"))
        for url in urls:
            assert client.get(url).status_code == 403, (role, url)
    admin = APIClient()
    login_staff(admin, platform_admin)
    for url in urls:
        assert admin.get(url).status_code == 200, url
    settings.PLATFORM_ALLOWED_NETWORKS = "10.9.0.0/16"
    assert admin.get(urls[0]).status_code == 403


def test_overview(
    village: str, platform_client: APIClient, django_capture_on_commit_callbacks: Any
) -> None:
    submitted(APIClient(), village, django_capture_on_commit_callbacks)
    overview = platform_client.get("/api/v1/platform/overview/").json()
    assert overview["applications"]["submitted"] == 1
    assert overview["oldest_waiting_application"]["id"]
    assert set(overview["facilities"]) == {"approved", "setup", "live", "suspended", "deactivated"}


@pytest.mark.acceptance("S1-B18")
def test_status_event_tables_are_append_only() -> None:
    from django.db import DatabaseError, connection, transaction

    with (
        pytest.raises(DatabaseError, match="permission denied"),
        transaction.atomic(),
        connection.cursor() as cursor,
    ):
        cursor.execute("DELETE FROM onboarding_facility_status_event")
    with (
        pytest.raises(DatabaseError, match="permission denied"),
        transaction.atomic(),
        connection.cursor() as cursor,
    ):
        cursor.execute("UPDATE onboarding_application_event SET note = ''")
    assert ApplicationStatus.DRAFT == "draft"
