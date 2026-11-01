"""Facility and platform announcements (contract sprint-09 §2.2, §3.3, FR-NOT-11).

`draft` -> `published` (fan-out) -> `withdrawn` (unsent attempts cancelled, inbox items flagged).
Fan-out resolves the audience in batches of 200, each batch in its own transaction; the dedupe key
makes a re-run a no-op. Recipients are grouped by language so each gets the text in their own
language (falling back to rw, en, fr, then any).
"""

from __future__ import annotations

import datetime as dt
import logging
from collections import defaultdict
from typing import Any

from django.db import transaction
from django.utils import timezone

from medilink.notifications import content_policy, hooks
from medilink.notifications.models import (
    Announcement,
    AnnouncementAudience,
    AnnouncementStatus,
    AttemptStatus,
    Audience,
    DeliveryAttempt,
    FailureReason,
    Notification,
)
from medilink.notifications.recipients import Recipient, Recipients

logger = logging.getLogger("medilink.notifications")

BATCH = 200
DAILY_PUBLISH_LIMIT = 10
TITLE_MAX = 120
BODY_MAX = 1000
LANGUAGE_ORDER = ("rw", "en", "fr")


class AnnouncementError(ValueError):
    def __init__(self, field: str, message: str, code: str = "invalid") -> None:
        super().__init__(message)
        self.field = field
        self.message = message
        self.code = code


def validate_texts(title_i18n: dict[str, str], body_i18n: dict[str, str]) -> None:
    """At least one language; ≤ 120 / 1,000 characters; no clinical words, no URLs."""
    titles = {k: (v or "").strip() for k, v in (title_i18n or {}).items() if k in LANGUAGE_ORDER}
    bodies = {k: (v or "").strip() for k, v in (body_i18n or {}).items() if k in LANGUAGE_ORDER}
    if not any(titles.values()) or not any(bodies.values()):
        raise AnnouncementError("title_i18n", "Write the announcement in at least one language.")
    for lang, text in titles.items():
        if len(text) > TITLE_MAX:
            raise AnnouncementError(f"title_i18n.{lang}", f"At most {TITLE_MAX} characters.")
    for lang, text in bodies.items():
        if len(text) > BODY_MAX:
            raise AnnouncementError(f"body_i18n.{lang}", f"At most {BODY_MAX} characters.")
    for field, texts in (("title_i18n", titles), ("body_i18n", bodies)):
        for lang, text in texts.items():
            if content_policy.clinical_terms(text):
                raise AnnouncementError(
                    f"{field}.{lang}", "Clinical words are not allowed in announcements."
                )
            if content_policy.has_url(text):
                raise AnnouncementError(
                    f"{field}.{lang}", "Links are not allowed in announcements."
                )


def text_for(texts: dict[str, str], language: str) -> str:
    for lang in (language, *LANGUAGE_ORDER):
        value = (texts or {}).get(lang, "").strip()
        if value:
            return value
    return next((v for v in (texts or {}).values() if v), "")


def published_today(facility_id: Any) -> int:
    start = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
    return Announcement.objects.filter(facility_id=facility_id, published_at__gte=start).count()


def publish(announcement: Announcement, user: Any) -> Announcement:
    announcement.status = AnnouncementStatus.PUBLISHED
    announcement.published_by = user
    announcement.published_at = timezone.now()
    announcement.version += 1
    announcement.save(
        update_fields=["status", "published_by", "published_at", "version", "updated_at"]
    )
    announcement_id = str(announcement.pk)
    facility_id = str(announcement.facility_id) if announcement.facility_id else None

    from medilink.notifications import tasks

    transaction.on_commit(lambda: tasks.fan_out_announcement.delay(announcement_id, facility_id))
    return announcement


def withdraw(announcement: Announcement) -> int:
    """Cancel unsent attempts, flag inbox items, tell open inboxes to refetch."""
    now = timezone.now()
    announcement.status = AnnouncementStatus.WITHDRAWN
    announcement.withdrawn_at = now
    announcement.version += 1
    announcement.save(update_fields=["status", "withdrawn_at", "version", "updated_at"])
    cancelled = DeliveryAttempt.objects.filter(
        notification__announcement=announcement,
        status__in=[AttemptStatus.QUEUED, AttemptStatus.HELD],
    ).update(
        status=AttemptStatus.CANCELLED,
        failure_reason=FailureReason.WITHDRAWN,
        finished_at=now,
        updated_at=now,
    )
    flagged = list(
        Notification.objects.filter(announcement=announcement).values_list(
            "pk", "audience", "recipient_user_id"
        )
    )
    Notification.objects.filter(announcement=announcement).update(is_withdrawn=True, updated_at=now)

    def _publish() -> None:
        from medilink.notifications.channels.in_app import publish as socket

        for pk, audience, user_id in flagged:
            socket(audience, user_id, "notification.updated", {"id": str(pk)})

    transaction.on_commit(_publish)
    return cancelled


def _facility_recipients(announcement: Announcement) -> list[Recipient]:
    patient_ids = hooks.resolve_patients(
        announcement.audience,
        announcement.facility_id,
        announcement.range_starts_on,
        announcement.range_ends_on,
    )
    seen: set[Any] = set()
    out: list[Recipient] = []
    for patient_id in patient_ids:
        for recipient in Recipients.patient(patient_id).resolve():
            if recipient.user_id in seen:  # one notification per account
                continue
            seen.add(recipient.user_id)
            out.append(recipient)
    return out


def _platform_recipients(announcement: Announcement) -> tuple[list[Recipient], set[Any]]:
    """All active members of live (and setting-up) facilities, or of the selected ones.
    Facility admins anywhere also get email (one notification per person)."""
    from medilink.tenancy.context import rls_context
    from medilink.tenancy.models import Facility, FacilityMembership, FacilityStatus

    facilities = Facility.objects.filter(status__in=[FacilityStatus.LIVE, FacilityStatus.SETUP])
    if announcement.audience == AnnouncementAudience.SELECTED_FACILITIES:
        facilities = facilities.filter(pk__in=announcement.target_facility_ids or [])
    users: dict[Any, bool] = {}
    for facility_id in facilities.values_list("pk", flat=True):
        with rls_context(facility_id=facility_id):
            for m in FacilityMembership.objects.filter(
                facility_id=facility_id, is_active=True, user__is_active=True
            ).prefetch_related("roles"):
                is_admin = any(r.code == "facility_admin" for r in m.roles.all())
                users[m.user_id] = users.get(m.user_id, False) or is_admin
    recipients = [Recipient(user_id=u, audience=Audience.STAFF) for u in users]
    admins = {u for u, admin in users.items() if admin}
    return recipients, admins


def fan_out(announcement_id: str, facility_id: str | None = None) -> int:
    """Notify the audience in batches; returns the recipient count and stores it. Facility rows
    are read inside the facility's RLS context (the task gets the facility ID)."""
    from medilink.accounts.models import User
    from medilink.notifications.service import notify
    from medilink.tenancy.context import rls_context

    with rls_context(facility_id=facility_id):
        announcement = (
            Announcement.objects.select_related("facility").filter(pk=announcement_id).first()
        )
    if announcement is None:
        return 0
    if announcement.status != AnnouncementStatus.PUBLISHED:
        return 0
    facility_name = ""
    admins: set[Any] = set()
    if announcement.facility_id is not None:
        if announcement.audience == AnnouncementAudience.DISPLAY:
            with rls_context(facility_id=facility_id):
                Announcement.objects.filter(pk=announcement.pk).update(recipient_count=0)
            return 0
        facility_name = announcement.facility.name if announcement.facility else ""
        event = "announcement.facility.published"
        recipients = _facility_recipients(announcement)
    else:
        event = "announcement.platform.published"
        recipients, admins = _platform_recipients(announcement)

    languages = {
        u.pk: (u.preferred_language or "rw")
        for u in User.objects.filter(pk__in={r.user_id for r in recipients})
    }
    groups: dict[tuple[str, bool], list[Recipient]] = defaultdict(list)
    for r in recipients:
        groups[(languages.get(r.user_id, "rw"), r.user_id in admins)].append(r)

    total = 0
    for (language, is_admin), members in groups.items():
        context: dict[str, Any] = {
            "announcement_title": text_for(announcement.title_i18n, language),
            "announcement_text": text_for(announcement.body_i18n, language),
            "announcement_id": announcement.pk,
        }
        if announcement.facility_id is not None:
            context["facility_name"] = facility_name
        channels = None if announcement.facility_id or is_admin else ("in_app",)
        for start in range(0, len(members), BATCH):
            batch = members[start : start + BATCH]
            with transaction.atomic():
                if announcement.facility_id:
                    with rls_context(facility_id=announcement.facility_id):
                        result = _notify(notify, event, batch, context, announcement, channels)
                else:
                    result = _notify(notify, event, batch, context, announcement, channels)
            total += len(result.created) + result.duplicates
    with rls_context(facility_id=facility_id):
        Announcement.objects.filter(pk=announcement.pk).update(recipient_count=total)
    return total


def _notify(
    notify: Any,
    event: str,
    batch: list[Recipient],
    context: dict[str, Any],
    announcement: Announcement,
    channels: tuple[str, ...] | None,
) -> Any:
    return notify(
        event,
        Recipients.explicit(*batch),
        context,
        facility_id=announcement.facility_id,
        priority=announcement.priority,
        channels=channels,
        announcement_id=announcement.pk,
    )


def is_active(announcement: Announcement, at: dt.datetime | None = None) -> bool:
    now = at or timezone.now()
    return (
        announcement.status == AnnouncementStatus.PUBLISHED
        and (announcement.starts_at is None or announcement.starts_at <= now)
        and (announcement.ends_at is None or announcement.ends_at > now)
    )
