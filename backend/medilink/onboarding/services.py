"""Onboarding services (contract §2.3): the application and facility state machines, documents,
licences and feature flag administration. Views stay thin; every rule lives here.

Concurrency: transitions send `version` (409 on mismatch). Idempotency: a repeated
`Idempotency-Key` returns the original result (the key is stored on the event row, S1-D6).
"""

from __future__ import annotations

from datetime import date
from typing import Any

from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.dispatch import Signal
from django.utils import timezone
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions

from medilink.accounts.models import normalize_email
from medilink.audit.services import record
from medilink.core.exceptions import BusinessRuleViolation, Conflict
from medilink.masterdata.models import Location, ReasonCode
from medilink.onboarding import golive, notifications
from medilink.onboarding.models import (
    ActorKind,
    Application,
    ApplicationDocument,
    ApplicationEvent,
    ApplicationStatus,
    DocumentKind,
    DocumentReview,
    EventKind,
    FacilityFeatureFlag,
    FacilityLicence,
    FacilityStatusEvent,
    FeatureFlag,
    LicenceKind,
)
from medilink.tenancy.models import Facility, FacilityStatus, Organization, Ownership
from medilink.uploads import services as uploads

# Sent after approval, on commit: S2 invites the proposed admin and moves the facility to setup.
application_approved = Signal()  # kwargs: application_id, facility_id

DOCUMENT_PURPOSE = "facility_application_document"
MAX_DOCUMENTS = 20
MAX_DOCUMENT_BYTES = 100 * 2**20

NOT_EDITABLE = _("This application can't be changed in its current status.")
WRONG_STATUS = _("This action isn't possible in the current status.")
NOT_SCANNED = _("Some documents are still being checked. Try again in a moment.")
DOCUMENTS_LIMIT = _("An application can have at most 20 documents and 100 MB.")
REQUIRED = _("This is required.")
UNSAFE_DOCUMENT = _("This document was refused by the security check. Upload it again.")
ALL_DOCUMENTS_ACCEPTED = _("Every document must be accepted before approval.")
NEEDS_MOH_LICENCE = _("At least one MoH operating licence is required.")
SLUG_TAKEN = _("This address is already used by another facility.")
REASON_UNKNOWN = _("Choose a reason from the list.")
REASON_TEXT = _("Explain the reason.")
SLUG_MISMATCH = _("Type the facility's address exactly to confirm.")
GO_LIVE_FAILED = _("The facility isn't ready to go live.")
SUPERSEDED = _("This licence was renewed; change the current one instead.")
NEEDS_ITEM = _("Add at least one comment.")

EDITABLE_GROUPS = ("facility", "location", "applicant", "proposed_admin", "claimed_insurer_codes")

# Facility lifecycle (contract §2.3): action -> (allowed from statuses, to status)
FACILITY_TRANSITIONS: dict[str, tuple[frozenset[str], str]] = {
    "start_setup": (frozenset({FacilityStatus.APPROVED}), FacilityStatus.SETUP),
    "go_live": (frozenset({FacilityStatus.SETUP}), FacilityStatus.LIVE),
    "suspend": (frozenset({FacilityStatus.LIVE}), FacilityStatus.SUSPENDED),
    "reactivate": (frozenset({FacilityStatus.SUSPENDED}), FacilityStatus.LIVE),
    "deactivate": (
        frozenset(
            {
                FacilityStatus.APPROVED,
                FacilityStatus.SETUP,
                FacilityStatus.LIVE,
                FacilityStatus.SUSPENDED,
            }
        ),
        FacilityStatus.DEACTIVATED,
    ),
}
REASON_KINDS = {
    "suspend": "facility_suspension",
    "reactivate": "facility_reactivation",
    "deactivate": "facility_deactivation",
}
STATUS_NOTIFICATIONS = {
    "suspend": "facility.suspended",
    "reactivate": "facility.reactivated",
    "deactivate": "facility.deactivated",
}


def is_publicly_listed(facility: Facility) -> bool:
    return facility.status == FacilityStatus.LIVE


def accepts_new_bookings(facility: Facility) -> bool:
    return facility.status == FacilityStatus.LIVE


# ---- helpers ------------------------------------------------------------------------------------


def _actor_kind(actor: Any) -> str:
    return ActorKind.PLATFORM_ADMIN if actor is not None else ActorKind.APPLICANT


def _event(
    application: Application,
    kind: str,
    *,
    actor: Any = None,
    actor_kind: str | None = None,
    from_status: str = "",
    to_status: str = "",
    idempotency_key: str = "",
    visible: bool = False,
    **fields: Any,
) -> ApplicationEvent:
    return ApplicationEvent.objects.create(
        application=application,
        kind=kind,
        actor=actor,
        actor_kind=actor_kind or _actor_kind(actor),
        from_status=from_status,
        to_status=to_status,
        idempotency_key=(idempotency_key or "")[:200],
        is_visible_to_applicant=visible,
        **fields,
    )


def _replayed(application: Application, key: str | None) -> bool:
    return (
        bool(key)
        and ApplicationEvent.objects.filter(application=application, idempotency_key=key).exists()
    )


def _check_version(current: int, version: Any) -> None:
    if not isinstance(version, int):
        raise exceptions.ValidationError({"version": [str(REQUIRED)]})
    if current != version:
        raise Conflict()


def _transition(
    application: Application,
    to_status: str,
    *,
    allowed_from: set[str],
    version: Any,
    actor: Any,
    idempotency_key: str | None = None,
    **event_fields: Any,
) -> bool:
    """Move the application and write the status event. False when replayed."""
    if _replayed(application, idempotency_key):
        return False
    if application.status not in allowed_from:
        raise BusinessRuleViolation(WRONG_STATUS)
    _check_version(application.version, version)
    from_status = application.status
    application.status = to_status
    application.version += 1
    application.save()
    _event(
        application,
        EventKind.STATUS_CHANGE,
        actor=actor,
        from_status=from_status,
        to_status=to_status,
        idempotency_key=idempotency_key or "",
        visible=True,
        **event_fields,
    )
    return True


def _audit(
    action: str, application: Application, request: Any, actor: Any = None, **meta: Any
) -> None:
    record(
        action,
        request=request,
        actor=actor,
        actor_role=None if actor is not None else "applicant",
        object_type="facility_application",
        object_id=application.pk,
        metadata=meta,
    )


def check_reason(kind: str, code: str, text: str) -> None:
    reason = ReasonCode.objects.filter(kind=kind, code=code or "", is_active=True).first()
    if reason is None:
        raise exceptions.ValidationError({"reason_code": [str(REASON_UNKNOWN)]})
    if reason.requires_text and not (text or "").strip():
        raise exceptions.ValidationError({"reason_text": [str(REASON_TEXT)]})


def suggested_slug(application: Application) -> str:
    base = slugify(application.facility_name)[:100] or "facility"
    slug, n = base, 2
    while Facility.objects.filter(slug=slug).exists():
        slug, n = f"{base}-{n}", n + 1
    return slug


# ---- applications: create, resume, edit ------------------------------------------------------


def start_application(
    *,
    applicant: dict[str, Any],
    facility_name: str,
    preferred_language: str,
    request: Any = None,
) -> Application:
    application = Application.objects.create(
        facility_name=facility_name,
        applicant_name=applicant["name"],
        applicant_email=normalize_email(applicant["email"]),
        applicant_phone=applicant.get("phone", ""),
        applicant_position=applicant.get("position", ""),
        preferred_language=preferred_language,
        last_activity_at=timezone.now(),
    )
    _event(application, EventKind.STATUS_CHANGE, to_status=ApplicationStatus.DRAFT, visible=True)
    _audit("facility_application.started", application, request)
    notifications.dispatch("facility_application.started", application_id=application.pk)
    send_resume_link(application, request=request, audit=False)
    return application


def create_by_platform(
    *, data: dict[str, Any], actor: Any, send_link: bool, request: Any = None
) -> Application:
    applicant = data["applicant"]
    facility = data.get("facility") or {}
    application = Application.objects.create(
        facility_name=facility.get("name") or data.get("facility_name", ""),
        applicant_name=applicant["name"],
        applicant_email=normalize_email(applicant["email"]),
        applicant_phone=applicant.get("phone", ""),
        applicant_position=applicant.get("position", ""),
        created_by_platform_admin=actor,
        last_activity_at=timezone.now(),
    )
    _apply_groups(application, {k: v for k, v in data.items() if k != "applicant"})
    application.save()
    _event(application, EventKind.STATUS_CHANGE, actor=actor, to_status=ApplicationStatus.DRAFT)
    _audit("facility_application.created_by_platform", application, request, actor)
    if send_link:
        send_resume_link(application, actor=actor, request=request)
    return application


def send_resume_link(
    application: Application, *, actor: Any = None, request: Any = None, audit: bool = True
) -> None:
    if not application.is_editable:
        raise BusinessRuleViolation(WRONG_STATUS)
    from medilink.onboarding.tasks import send_resume_link as task

    application_id = str(application.pk)
    transaction.on_commit(lambda: task.delay(application_id))
    _event(
        application,
        EventKind.LINK_SENT,
        actor=actor,
        actor_kind=_actor_kind(actor) if actor else ActorKind.SYSTEM,
    )
    if audit:
        _audit("facility_application.link_sent", application, request, actor)


def request_resume_links(email: str) -> int:
    """One link per open application of that email. Never reveals whether any exist."""
    count = 0
    for application in Application.objects.filter(
        applicant_email=normalize_email(email),
        status__in=[ApplicationStatus.DRAFT, ApplicationStatus.CHANGES_REQUESTED],
    ):
        send_resume_link(application)
        count += 1
    return count


def _apply_groups(application: Application, data: dict[str, Any]) -> list[str]:
    """Copy the editable groups onto the row. Returns the changed field names."""
    changed: list[str] = []

    def put(field: str, value: Any) -> None:
        if getattr(application, field) != value:
            setattr(application, field, value)
            changed.append(field)

    facility = data.get("facility")
    if facility is not None:
        mapping = {
            "name": "facility_name",
            "facility_type": "facility_type",
            "level_of_care": "level_of_care",
            "ownership": "ownership",
            "organization_name": "organization_name",
            "phone": "phone",
            "email": "email",
        }
        for key, field in mapping.items():
            if key in facility:
                put(field, facility[key] if key != "email" else normalize_email(facility[key]))
    location = data.get("location")
    if location is not None:
        if "village_code" in location:
            code = location["village_code"]
            village = (
                Location.objects.select_related("parent__parent__parent")
                .filter(code=code, level="village", is_active=True)
                .first()
                if code
                else None
            )
            if code and village is None:
                raise exceptions.ValidationError({"location.village_code": ["Unknown village."]})
            put("village", village)
            district = (
                village.parent.parent.parent if village else None
            )  # cell -> sector -> district
            put("district_code", district.code if district else "")
        for key in ("address", "latitude", "longitude"):
            if key in location:
                put(key, location[key])
    applicant = data.get("applicant")
    if applicant is not None:
        for key in ("name", "phone", "position"):
            if key in applicant:
                put(f"applicant_{key}", applicant[key])
        if "email" in applicant:
            put("applicant_email", normalize_email(applicant["email"]))
    admin = data.get("proposed_admin")
    if admin is not None:
        for key in ("name", "email", "phone"):
            if key in admin:
                value = normalize_email(admin[key]) if key == "email" else admin[key]
                put(f"proposed_admin_{key}", value)
    if "claimed_insurer_codes" in data:
        put("claimed_insurer_codes", sorted(set(data["claimed_insurer_codes"])))
    return changed


def update_application(
    application: Application,
    data: dict[str, Any],
    *,
    version: Any,
    actor: Any = None,
    request: Any = None,
) -> Application:
    if not application.is_editable:
        raise BusinessRuleViolation(NOT_EDITABLE)
    _check_version(application.version, version)
    changed = _apply_groups(application, data)
    if not changed:
        return application
    application.version += 1
    application.last_activity_at = timezone.now()
    application.save()
    if actor is not None:
        _event(application, EventKind.PLATFORM_EDIT, actor=actor, metadata={"fields": changed})
    return application


# ---- documents ---------------------------------------------------------------------------------


def add_document(
    application: Application,
    *,
    django_file: Any,
    kind: str,
    insurer_code: str = "",
    number: str = "",
    issued_on: date | None = None,
    expires_on: date | None = None,
    actor: Any = None,
    idempotency_key: str | None = None,
    request: Any = None,
) -> ApplicationDocument:
    if not application.is_editable:
        raise BusinessRuleViolation(NOT_EDITABLE)
    scope = f"application:{application.pk}"
    key = (idempotency_key or "")[:200]
    if key:
        existing = ApplicationDocument.objects.filter(
            application=application,
            file__idempotency_scope=scope,
            file__idempotency_key=key,
        ).first()
        if existing is not None:
            return existing
    current = ApplicationDocument.objects.current().filter(application=application)
    total = current.aggregate(total=Sum("file__size_bytes"))["total"] or 0
    if current.count() >= MAX_DOCUMENTS or total + (django_file.size or 0) > MAX_DOCUMENT_BYTES:
        raise BusinessRuleViolation(DOCUMENTS_LIMIT)
    file = uploads.receive(
        actor=actor,
        audience="platform" if actor is not None else "public",
        purpose=DOCUMENT_PURPOSE,
        django_file=django_file,
        idempotency_key=key or None,
        idempotency_scope=scope,
        request=request,
    )
    document = ApplicationDocument.objects.create(
        application=application,
        file=file,
        kind=kind,
        insurer_code=insurer_code,
        number=number,
        issued_on=issued_on,
        expires_on=expires_on,
    )
    _touch(application)
    return document


def _touch(application: Application) -> None:
    Application.objects.filter(pk=application.pk).update(last_activity_at=timezone.now())


def update_document(document: ApplicationDocument, data: dict[str, Any]) -> ApplicationDocument:
    if not document.application.is_editable:
        raise BusinessRuleViolation(NOT_EDITABLE)
    for key in ("number", "issued_on", "expires_on"):
        if key in data:
            setattr(document, key, data[key])
    document.review_status = DocumentReview.PENDING
    document.save()
    _touch(document.application)
    return document


def delete_document(document: ApplicationDocument) -> None:
    if not document.application.is_editable:
        raise BusinessRuleViolation(NOT_EDITABLE)
    document.deleted_at = timezone.now()
    document.save(update_fields=["deleted_at"])
    uploads.soft_delete(document.file, actor=None)
    _touch(document.application)


def attach_scanned_document(file_id: Any) -> None:
    """upload_scanned receiver: a clean application document becomes owned by its application."""
    document = ApplicationDocument.objects.select_related("file").filter(file_id=file_id).first()
    if document is None or document.file.is_attached:
        return
    if document.file.scan_status == "clean":
        uploads.attach(
            document.file, purpose=DOCUMENT_PURPOSE, owner_id=document.application_id, actor=None
        )


# ---- submit ------------------------------------------------------------------------------------


def _required_documents(application: Application) -> list[str]:
    required: list[str] = [DocumentKind.MOH_LICENCE]
    if application.ownership != Ownership.PUBLIC:
        required += [DocumentKind.RDB_REGISTRATION, DocumentKind.TIN_CERTIFICATE]
    return required


def missing_for_submit(application: Application) -> list[str]:
    missing = []
    checks = {
        "facility.name": application.facility_name,
        "facility.facility_type": application.facility_type,
        "facility.ownership": application.ownership,
        "facility.phone": application.phone,
        "facility.email": application.email,
        "location.village_code": application.village_id,
        "location.address": application.address,
        "applicant.name": application.applicant_name,
        "applicant.email": application.applicant_email,
        "applicant.phone": application.applicant_phone,
        "proposed_admin.name": application.proposed_admin_name,
        "proposed_admin.email": application.proposed_admin_email,
        "proposed_admin.phone": application.proposed_admin_phone,
    }
    missing += [name for name, value in checks.items() if not value]
    documents = list(ApplicationDocument.objects.current().filter(application=application))
    for kind in _required_documents(application):
        matching = [d for d in documents if d.kind == kind]
        if not matching or (
            kind == DocumentKind.MOH_LICENCE
            and not any(d.number and d.expires_on for d in matching)
        ):
            missing.append(f"documents.{kind}")
    return missing


def submit(
    application: Application,
    *,
    version: Any,
    terms_version: str,
    dpa_version: str,
    ncsa_confirmed: bool,
    idempotency_key: str | None = None,
    request: Any = None,
) -> Application:
    if _replayed(application, idempotency_key):
        return application
    if not application.is_editable:
        raise BusinessRuleViolation(WRONG_STATUS)
    _check_version(application.version, version)
    fields = {name: [str(REQUIRED)] for name in missing_for_submit(application)}
    for name, value in (
        ("accepted_terms_version", terms_version),
        ("accepted_dpa_version", dpa_version),
        ("ncsa_registration_confirmed", ncsa_confirmed),
    ):
        if not value:
            fields[name] = [str(REQUIRED)]
    documents = list(
        ApplicationDocument.objects.current().filter(application=application).select_related("file")
    )
    for document in documents:
        if document.file.scan_status in ("infected", "rejected", "failed"):
            fields[f"documents.{document.pk}"] = [str(UNSAFE_DOCUMENT)]
    if fields:
        raise exceptions.ValidationError(fields)
    if any(d.file.scan_status == "pending" for d in documents):
        raise BusinessRuleViolation(NOT_SCANNED)
    application.accepted_terms_version = terms_version
    application.accepted_dpa_version = dpa_version
    application.ncsa_registration_confirmed = True
    application.submitted_at = timezone.now()
    application.last_activity_at = timezone.now()
    application.general_comment = ""
    _transition(
        application,
        ApplicationStatus.SUBMITTED,
        allowed_from={ApplicationStatus.DRAFT, ApplicationStatus.CHANGES_REQUESTED},
        version=version,
        actor=None,
        idempotency_key=idempotency_key,
    )
    _audit("facility_application.submitted", application, request)
    notifications.dispatch("facility_application.submitted", application_id=application.pk)
    return application


# ---- review ------------------------------------------------------------------------------------


def start_review(
    application: Application, *, version: Any, actor: Any, request: Any = None
) -> Application:
    application.reviewer = actor
    _transition(
        application,
        ApplicationStatus.UNDER_REVIEW,
        allowed_from={ApplicationStatus.SUBMITTED},
        version=version,
        actor=actor,
    )
    _audit("facility_application.review_started", application, request, actor)
    return application


def review_document(
    document: ApplicationDocument,
    *,
    review_status: str,
    comment: str,
    actor: Any,
    request: Any = None,
) -> ApplicationDocument:
    application = document.application
    if application.status != ApplicationStatus.UNDER_REVIEW:
        raise BusinessRuleViolation(WRONG_STATUS)
    document.review_status = review_status
    document.review_comment = comment
    document.save(update_fields=["review_status", "review_comment", "updated_at"])
    _event(
        application,
        EventKind.DOCUMENT_REVIEW,
        actor=actor,
        metadata={"document_id": str(document.pk), "review_status": review_status},
    )
    _audit(
        "facility_application.document_reviewed",
        application,
        request,
        actor,
        document_id=document.pk,
        review_status=review_status,
    )
    return document


def request_changes(
    application: Application,
    *,
    version: Any,
    general_comment: str,
    items: list[dict[str, str]],
    actor: Any,
    idempotency_key: str | None = None,
    request: Any = None,
) -> Application:
    if not items:
        raise exceptions.ValidationError({"items": [str(NEEDS_ITEM)]})
    if _replayed(application, idempotency_key):
        return application
    application.general_comment = general_comment
    _transition(
        application,
        ApplicationStatus.CHANGES_REQUESTED,
        allowed_from={ApplicationStatus.UNDER_REVIEW},
        version=version,
        actor=actor,
        idempotency_key=idempotency_key,
        note=general_comment,
        item_comments=items,
    )
    _audit("facility_application.changes_requested", application, request, actor, items=len(items))
    notifications.dispatch("facility_application.changes_requested", application_id=application.pk)
    return application


def approve(
    application: Application,
    *,
    version: Any,
    slug: str,
    organization_name: str,
    facility_type: str,
    ownership: str,
    licences: list[dict[str, Any]],
    actor: Any,
    idempotency_key: str | None = None,
    request: Any = None,
) -> tuple[Application, Facility]:
    if _replayed(application, idempotency_key):
        assert application.facility is not None  # noqa: S101 (replay of an approval)
        return application, application.facility
    if application.status != ApplicationStatus.UNDER_REVIEW:
        raise BusinessRuleViolation(WRONG_STATUS)
    _check_version(application.version, version)
    documents = {
        d.pk: d for d in ApplicationDocument.objects.current().filter(application=application)
    }
    if any(d.review_status != DocumentReview.ACCEPTED for d in documents.values()):
        raise BusinessRuleViolation(ALL_DOCUMENTS_ACCEPTED)
    if not any(lic["kind"] == LicenceKind.MOH_OPERATING for lic in licences):
        raise BusinessRuleViolation(NEEDS_MOH_LICENCE)
    for index, licence in enumerate(licences):
        if licence.get("document_id") and licence["document_id"] not in documents:
            raise exceptions.ValidationError(
                {f"licences.{index}.document_id": ["Unknown document."]}
            )
    if Facility.objects.filter(slug=slug).exists():
        raise exceptions.ValidationError({"slug": [str(SLUG_TAKEN)]})
    now = timezone.now()
    try:
        with transaction.atomic():
            organization = Organization.objects.create(name=organization_name)
            facility = Facility.objects.create(
                organization=organization,
                name=application.facility_name,
                slug=slug,
                facility_type=facility_type,
                ownership=ownership,
                status=FacilityStatus.APPROVED,
            )
    except IntegrityError:
        raise exceptions.ValidationError({"slug": [str(SLUG_TAKEN)]}) from None
    for licence in licences:
        document = documents.get(licence["document_id"]) if licence.get("document_id") else None
        FacilityLicence.objects.create(
            facility=facility,
            kind=licence["kind"],
            number=licence["number"],
            issued_on=licence.get("issued_on"),
            expires_on=licence["expires_on"],
            file=document.file if document else None,
            source_document=document,
            verified_by=actor,
            verified_at=now,
        )
        record(
            "facility.licence.recorded",
            request=request,
            actor=actor,
            facility_id=facility.pk,
            object_type="facility_licence",
            metadata={"kind": licence["kind"]},
        )
    FacilityStatusEvent.objects.create(
        facility=facility, from_status="", to_status=FacilityStatus.APPROVED, actor=actor
    )
    application.facility = facility
    application.organization_name = organization_name
    application.facility_type = facility_type
    application.ownership = ownership
    application.decided_at = now
    _transition(
        application,
        ApplicationStatus.APPROVED,
        allowed_from={ApplicationStatus.UNDER_REVIEW},
        version=version,
        actor=actor,
        idempotency_key=idempotency_key,
    )
    _audit("facility_application.approved", application, request, actor, facility_id=facility.pk)
    notifications.dispatch("facility_application.approved", application_id=application.pk)
    application_id, facility_id = application.pk, facility.pk
    transaction.on_commit(
        lambda: application_approved.send(
            sender=Application, application_id=application_id, facility_id=facility_id
        )
    )
    return application, facility


def reject(
    application: Application,
    *,
    version: Any,
    reason_code: str,
    reason_text: str,
    actor: Any,
    idempotency_key: str | None = None,
    request: Any = None,
) -> Application:
    if _replayed(application, idempotency_key):
        return application
    check_reason("application_rejection", reason_code, reason_text)
    application.decided_at = timezone.now()
    _transition(
        application,
        ApplicationStatus.REJECTED,
        allowed_from={ApplicationStatus.UNDER_REVIEW},
        version=version,
        actor=actor,
        idempotency_key=idempotency_key,
        reason_code=reason_code,
        note=reason_text,
    )
    _audit("facility_application.rejected", application, request, actor, reason_code=reason_code)
    notifications.dispatch("facility_application.rejected", application_id=application.pk)
    return application


def add_note(
    application: Application,
    *,
    note_kind: str,
    text: str,
    occurred_on: date | None,
    actor: Any,
    request: Any = None,
) -> ApplicationEvent:
    event = _event(
        application,
        EventKind.NOTE,
        actor=actor,
        note_kind=note_kind,
        note=text,
        occurred_on=occurred_on,
    )
    _audit("facility_application.note_added", application, request, actor, note_kind=note_kind)
    return event


def duplicate_hints(application: Application) -> list[dict[str, Any]]:
    hints: list[dict[str, Any]] = []
    numbers = list(
        ApplicationDocument.objects.current()
        .filter(application=application)
        .exclude(number="")
        .values_list("number", flat=True)
    )
    if numbers:
        for doc in (
            ApplicationDocument.objects.current()
            .filter(number__in=numbers)
            .exclude(application=application)
            .select_related("application")
        ):
            hints.append(
                {
                    "kind": "same_licence_number",
                    "application_id": doc.application_id,
                    "facility_id": doc.application.facility_id,
                }
            )
        for licence in FacilityLicence.objects.filter(number__in=numbers):
            if licence.facility_id != application.facility_id:
                hints.append(
                    {
                        "kind": "same_licence_number",
                        "application_id": None,
                        "facility_id": licence.facility_id,
                    }
                )
    for other in Application.objects.filter(
        applicant_email=application.applicant_email,
        status__in=[
            ApplicationStatus.DRAFT,
            ApplicationStatus.SUBMITTED,
            ApplicationStatus.UNDER_REVIEW,
            ApplicationStatus.CHANGES_REQUESTED,
        ],
    ).exclude(pk=application.pk):
        hints.append(
            {"kind": "same_applicant_email", "application_id": other.pk, "facility_id": None}
        )
    if application.district_code:
        for other in Application.objects.filter(
            district_code=application.district_code,
            facility_name__iexact=application.facility_name,
        ).exclude(pk=application.pk):
            hints.append(
                {
                    "kind": "same_name_in_district",
                    "application_id": other.pk,
                    "facility_id": other.facility_id,
                }
            )
    unique = {(h["kind"], str(h["application_id"]), str(h["facility_id"])): h for h in hints}
    return list(unique.values())


# ---- facilities ---------------------------------------------------------------------------------


def facility_version(facility: Facility) -> int:
    """Status version: the number of status events (tenancy_facility has no version column)."""
    return FacilityStatusEvent.objects.filter(facility=facility).count()


def change_facility_status(
    facility: Facility,
    action: str,
    *,
    version: Any,
    actor: Any,
    reason_code: str = "",
    reason_text: str = "",
    confirm_slug: str | None = None,
    idempotency_key: str | None = None,
    request: Any = None,
) -> Facility:
    """Apply a lifecycle action (contract §2.3). S2 calls this for its own go-live."""
    allowed_from, to_status = FACILITY_TRANSITIONS[action]
    key = (idempotency_key or "")[:200]
    if key and FacilityStatusEvent.objects.filter(facility=facility, idempotency_key=key).exists():
        return facility
    facility = Facility.objects.select_for_update().get(pk=facility.pk)
    if action in REASON_KINDS:
        check_reason(REASON_KINDS[action], reason_code, reason_text)
    if action == "deactivate" and confirm_slug != facility.slug:
        raise exceptions.ValidationError({"confirm_slug": [str(SLUG_MISMATCH)]})
    if facility.status not in allowed_from:
        raise BusinessRuleViolation(WRONG_STATUS)
    _check_version(facility_version(facility), version)
    if action == "go_live":
        failing = golive.run(facility)
        if failing:
            raise GoLiveFailed(failing)
    from_status = facility.status
    facility.status = to_status
    facility.save(update_fields=["status", "updated_at"])
    FacilityStatusEvent.objects.create(
        facility=facility,
        from_status=from_status,
        to_status=to_status,
        actor=actor,
        reason_code=reason_code or "",
        reason_text=reason_text or "",
        idempotency_key=key,
    )
    record(
        "facility.status_changed",
        request=request,
        actor=actor,
        facility_id=facility.pk,
        object_type="facility",
        object_id=facility.pk,
        reason=reason_text or "",
        metadata={"from": from_status, "to": to_status, "reason_code": reason_code or None},
    )
    if action in STATUS_NOTIFICATIONS:
        notifications.dispatch(STATUS_NOTIFICATIONS[action], facility_id=facility.pk)
    return facility


class GoLiveFailed(BusinessRuleViolation):
    """422 with the failing checks in `fields` (`checks.<code>`)."""

    def __init__(self, failing: dict[str, list[golive.Problem]]) -> None:
        super().__init__(GO_LIVE_FAILED)
        self.failing = failing


# ---- licences -----------------------------------------------------------------------------------


def add_licence(
    facility: Facility,
    *,
    data: dict[str, Any],
    actor: Any,
    request: Any = None,
) -> FacilityLicence:
    renews = data.get("renews_licence_id")
    old = None
    if renews:
        old = (
            FacilityLicence.objects.select_for_update().filter(pk=renews, facility=facility).first()
        )
        if old is None:
            raise exceptions.ValidationError({"renews_licence_id": ["Unknown licence."]})
        if old.superseded_at is not None:
            raise BusinessRuleViolation(SUPERSEDED)
    file = None
    if data.get("upload_id"):
        from medilink.uploads.models import UploadedFile

        file = UploadedFile.objects.filter(pk=data["upload_id"], scan_status="clean").first()
        if file is None:
            raise exceptions.ValidationError({"upload_id": ["Unknown or unscanned upload."]})
    licence = FacilityLicence.objects.create(
        facility=facility,
        kind=data["kind"],
        number=data["number"],
        issued_on=data.get("issued_on"),
        expires_on=data["expires_on"],
        file=file,
        verified_by=actor,
        verified_at=timezone.now(),
    )
    if old is not None:
        old.superseded_by = licence
        old.superseded_at = timezone.now()
        old.version += 1
        old.save()
    record(
        "facility.licence.renewed" if old else "facility.licence.recorded",
        request=request,
        actor=actor,
        facility_id=facility.pk,
        object_type="facility_licence",
        object_id=licence.pk,
        metadata={"kind": licence.kind},
    )
    return licence


def correct_licence(
    licence: FacilityLicence, *, data: dict[str, Any], version: Any, actor: Any, request: Any = None
) -> FacilityLicence:
    if licence.superseded_at is not None:
        raise BusinessRuleViolation(SUPERSEDED)
    _check_version(licence.version, version)
    if "expires_on" in data and data["expires_on"] != licence.expires_on:
        licence.last_reminder_days = None  # moving the expiry restarts the reminders
    for key in ("number", "issued_on", "expires_on"):
        if key in data:
            setattr(licence, key, data[key])
    licence.version += 1
    licence.save()
    record(
        "facility.licence.updated",
        request=request,
        actor=actor,
        facility_id=licence.facility_id,
        object_type="facility_licence",
        object_id=licence.pk,
        metadata={"kind": licence.kind},
    )
    return licence


def licence_state(licence: FacilityLicence | None, today: date | None = None) -> str:
    if licence is None:
        return "missing"
    today = today or timezone.localdate()
    days = (licence.expires_on - today).days
    if days < 0:
        return "expired"
    if days <= 60:
        return "expiring"
    return "valid"


# ---- feature flags ------------------------------------------------------------------------------


def set_facility_flag(
    facility: Facility,
    flag: FeatureFlag,
    *,
    is_enabled: bool,
    note: str,
    actor: Any,
    request: Any = None,
) -> FacilityFeatureFlag:
    override, _created = FacilityFeatureFlag.objects.update_or_create(
        flag=flag,
        facility=facility,
        defaults={"is_enabled": is_enabled, "note": note, "set_by": actor},
    )
    record(
        "facility.feature_flag.changed",
        request=request,
        actor=actor,
        facility_id=facility.pk,
        object_type="feature_flag",
        metadata={"flag_code": flag.code, "is_enabled": is_enabled},
    )
    return override


def clear_facility_flag(
    facility: Facility, flag: FeatureFlag, *, actor: Any, request: Any = None
) -> None:
    FacilityFeatureFlag.objects.filter(flag=flag, facility=facility).delete()
    record(
        "facility.feature_flag.changed",
        request=request,
        actor=actor,
        facility_id=facility.pk,
        object_type="feature_flag",
        metadata={"flag_code": flag.code, "is_enabled": None},
    )


def update_flag(
    flag: FeatureFlag, *, data: dict[str, Any], version: Any, actor: Any, request: Any = None
) -> FeatureFlag:
    _check_version(flag.version, version)
    for key in ("default_enabled", "description"):
        if key in data:
            setattr(flag, key, data[key])
    flag.version += 1
    flag.save()
    record(
        "feature_flag.default_changed",
        request=request,
        actor=actor,
        object_type="feature_flag",
        metadata={"flag_code": flag.code, "default_enabled": flag.default_enabled},
    )
    return flag
