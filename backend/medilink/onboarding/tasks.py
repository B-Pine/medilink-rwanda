"""Onboarding jobs (contract §5): notification emails (stub until S9), resume links, licence
reminders and stale draft expiry. Tasks take IDs only (security 06 §8)."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from medilink.accounts.models import User
from medilink.tenancy.context import rls_context

logger = logging.getLogger(__name__)

DRAFT_REMINDER_DAYS = 83
DRAFT_EXPIRY_DAYS = 90
REMINDER_STEPS = (60, 30)


def _platform_admin_emails() -> list[str]:
    return list(
        User.objects.filter(is_platform_admin=True, is_active=True).values_list("email", flat=True)
    )


def _app_url(path: str) -> str:
    return f"{str(settings.PATIENT_APP_URL).rstrip('/')}{path}"


def _staff_url(path: str) -> str:
    return f"{str(settings.STAFF_APP_URL).rstrip('/')}{path}"


def _facility_contacts(facility_id: str) -> list[str]:
    from medilink.onboarding.models import Application

    application = Application.objects.filter(facility_id=facility_id).first()
    if application is None:
        return []
    return sorted({e for e in (application.email, application.applicant_email) if e})


def _message(event: str, ids: dict[str, Any]) -> tuple[str, str, list[str]] | None:
    """(subject, body, recipients) for an event, or None when the object is gone."""
    from medilink.onboarding.models import Application, FacilityLicence
    from medilink.tenancy.models import Facility

    if event.startswith("facility_application."):
        application = Application.objects.filter(pk=ids["application_id"]).first()
        if application is None:
            return None
        name = application.facility_name
        to = [application.applicant_email]
        texts = {
            "facility_application.started": (
                f"Your MediLink application for {name}",
                "We created your application. Use the link we send separately to continue it.",
            ),
            "facility_application.submitted": (
                f"Application received: {name}",
                "Thank you. We'll verify your documents and contact you. You'll get an email "
                "when we decide or need changes.",
            ),
            "facility_application.changes_requested": (
                f"Changes needed: {name}",
                "Our team asked for some changes. Ask for a new link on the application page "
                f"({_app_url('/for-facilities/apply/resume')}) to see the comments and update it.",
            ),
            "facility_application.approved": (
                f"Approved: {name}",
                "Your facility is approved on MediLink. We'll invite the facility administrator "
                "to set it up.",
            ),
            "facility_application.rejected": (
                f"Application not approved: {name}",
                "We couldn't approve this application.\n\nReason: "
                + _rejection_reason(application),
            ),
            "facility_application.draft_expiring": (
                f"Your draft application will be deleted soon: {name}",
                f"Your draft hasn't changed for {DRAFT_REMINDER_DAYS} days. It will be deleted "
                f"after {DRAFT_EXPIRY_DAYS} days without activity. Ask for a new link to continue.",
            ),
        }
        subject, body = texts[event]
        if event == "facility_application.submitted":
            admins = _platform_admin_emails()
            if admins:
                send_mail(
                    subject=f"New facility application: {name}",
                    message=f"Review it in the console: {_staff_url('/platform/applications')}\n",
                    from_email=None,
                    recipient_list=admins,
                )
        return subject, body, to

    if event.startswith("facility.licence_"):
        licence = FacilityLicence.objects.filter(pk=ids["licence_id"]).first()
        if licence is None:
            return None
        facility = Facility.objects.filter(pk=licence.facility_id).first()
        name = facility.name if facility else "your facility"
        to = sorted({*_facility_contacts(str(licence.facility_id)), *_platform_admin_emails()})
        if event == "facility.licence_expired":
            return (
                f"Licence expired: {name}",
                f"The {licence.get_kind_display()} {licence.number} expired on "
                f"{licence.expires_on.isoformat()}. Upload the renewed licence.",
                to,
            )
        return (
            f"Licence expires in {ids.get('days')} days: {name}",
            f"The {licence.get_kind_display()} {licence.number} expires on "
            f"{licence.expires_on.isoformat()}. Send the renewed licence before then.",
            to,
        )

    if event in ("facility.suspended", "facility.reactivated", "facility.deactivated"):
        facility = Facility.objects.filter(pk=ids["facility_id"]).first()
        if facility is None:
            return None
        word = event.removeprefix("facility.")
        return (
            f"{facility.name} was {word} on MediLink",
            f"{facility.name} was {word} on MediLink. Contact MediLink support with questions.",
            _facility_contacts(str(facility.pk)),
        )

    if event.startswith("security."):
        user = User.objects.filter(pk=ids["user_id"]).first()
        if user is None:
            return None
        texts = {
            "security.pin_changed": (
                "Your MediLink unlock PIN was changed",
                "The PIN that unlocks your MediLink session was just set or changed. If this "
                "wasn't you, sign in, remove the PIN and change your password.",
            ),
            "security.unlock_exhausted": (
                "Too many wrong PINs on your MediLink account",
                "Someone entered a wrong unlock PIN too many times. PIN unlock is off for one "
                "hour; your password still works. If this wasn't you, change your password.",
            ),
        }
        subject, body = texts[event]
        return subject, body, [user.email]
    raise ValueError(event)


def _rejection_reason(application: Any) -> str:
    from medilink.masterdata.models import ReasonCode
    from medilink.onboarding.models import ApplicationEvent

    event = (
        ApplicationEvent.objects.filter(application=application, to_status="rejected")
        .order_by("-occurred_at")
        .first()
    )
    if event is None:
        return ""
    reason = ReasonCode.objects.filter(kind="application_rejection", code=event.reason_code).first()
    label = (reason.label_i18n.get("en") if reason else "") or event.reason_code
    return f"{label}. {event.note}".strip()


@shared_task(ignore_result=True, time_limit=60, soft_time_limit=50, max_retries=3)
def send_notification(event: str, ids: dict[str, Any]) -> None:
    with rls_context():
        message = _message(event, ids)
    if message is None:
        return
    subject, body, recipients = message
    recipients = [r for r in recipients if r]
    if recipients:
        send_mail(subject=subject, message=body + "\n", from_email=None, recipient_list=recipients)


@shared_task(ignore_result=True, time_limit=60, soft_time_limit=50, max_retries=3)
def send_resume_link(application_id: str) -> None:
    """Issue a fresh single-use resume token (7 days) and email the link. The token is created
    here, so it never travels through the broker."""
    from medilink.onboarding import applicant

    with rls_context():
        result = applicant.issue_resume_token(application_id)
    if result is None:
        return
    application, token = result
    link = _app_url(f"/for-facilities/apply/resume?token={token}")
    send_mail(
        subject=f"Continue your MediLink application: {application.facility_name}",
        message=(
            f"Open this link within {applicant.RESUME_TOKEN_DAYS} days to continue your "
            f"application:\n{link}\n\nThe link works once. If you didn't ask for it, ignore this "
            "email.\n"
        ),
        from_email=None,
        recipient_list=[application.applicant_email],
    )


@shared_task(ignore_result=True, time_limit=600, soft_time_limit=580)
def send_licence_reminders() -> dict[str, int]:
    """60- and 30-day reminders and expiry flags for current licences (one per step)."""
    from medilink.onboarding import notifications
    from medilink.onboarding.models import FacilityLicence

    today = timezone.localdate()
    counts = {"60": 0, "30": 0, "expired": 0}
    with rls_context():
        current = FacilityLicence.objects.filter(superseded_at__isnull=True)
        for licence in current.filter(expires_on__lte=today + timedelta(days=REMINDER_STEPS[0])):
            days_left = (licence.expires_on - today).days
            if days_left < 0:
                step = 0
            elif days_left <= REMINDER_STEPS[1]:
                step = 30
            else:
                step = 60
            if licence.last_reminder_days is not None and licence.last_reminder_days <= step:
                continue  # already sent this step (60 -> 30 -> 0)
            FacilityLicence.objects.filter(pk=licence.pk).update(last_reminder_days=step)
            if step == 0:
                notifications.dispatch("facility.licence_expired", licence_id=licence.pk)
                counts["expired"] += 1
            else:
                notifications.dispatch(
                    "facility.licence_expiring", licence_id=licence.pk, days=step
                )
                counts[str(step)] += 1
    logger.info("Licence reminders sent", extra=counts)
    return counts


@shared_task(ignore_result=True, time_limit=600, soft_time_limit=580)
def expire_stale_drafts() -> dict[str, int]:
    """Remind at 83 days without activity; delete the draft and its files at 90 days."""
    from medilink.audit.services import record
    from medilink.onboarding import notifications
    from medilink.onboarding.models import Application, ApplicationStatus
    from medilink.uploads.services import soft_delete

    now = timezone.now()
    counts = {"reminded": 0, "purged": 0}
    with rls_context():
        drafts = Application.objects.filter(status=ApplicationStatus.DRAFT)
        for application in drafts.filter(
            last_activity_at__lt=now - timedelta(days=DRAFT_EXPIRY_DAYS)
        ):
            for document in application.documents.select_related("file"):
                soft_delete(document.file, actor=None)
            application_id = application.pk
            application.delete()
            record(
                "facility_application.purged",
                object_type="facility_application",
                object_id=application_id,
                metadata={"reason": "stale_draft"},
            )
            counts["purged"] += 1
        for application in drafts.filter(
            last_activity_at__lt=now - timedelta(days=DRAFT_REMINDER_DAYS),
            draft_reminder_sent_at__isnull=True,
        ):
            Application.objects.filter(pk=application.pk).update(draft_reminder_sent_at=now)
            notifications.dispatch(
                "facility_application.draft_expiring", application_id=application.pk
            )
            counts["reminded"] += 1
    return counts
