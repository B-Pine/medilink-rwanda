"""Schedule templates and exceptions (contract sprint-02 §2.2, FR-SCH-06, FR-ONB-06)."""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db import connection, transaction
from django.dispatch import Signal
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions

from medilink.audit.services import record
from medilink.core.exceptions import BusinessRuleViolation, Conflict
from medilink.facilities.changelog import log_changes, snapshot
from medilink.facilities.models import OpeningHours, Service, ServicePoint
from medilink.scheduling.models import (
    ExceptionKind,
    ExceptionStatus,
    ScheduleException,
    ScheduleTemplate,
)
from medilink.tenancy.models import FacilityMembership

# Approved future leave or training: S5 starts the disruption flow.
exception_approved = Signal()  # kwargs: exception_id, facility_id

NOT_ATTESTED = _("Attest this doctor's licence on the staff page before giving them a schedule.")
OVERLAP = _("This doctor already has a block at this time.")
NOT_OPEN = _("This request is no longer open.")
SLOT_FIT = _("The block length must be a multiple of the slot length.")
STALE = _("Someone else changed this. Reload and try again.")

TEMPLATE_FIELDS = (
    "membership_id",
    "service_id",
    "service_point_id",
    "weekday",
    "starts_at",
    "ends_at",
    "slot_minutes",
    "capacity",
    "bookable_share_pct",
    "valid_from",
    "valid_to",
)


def _minutes(t: dt.time) -> int:
    return t.hour * 60 + t.minute


def busy_ranges(user_id: Any, exclude_facility_id: Any) -> list[tuple[int, dt.time, dt.time]]:
    """Weekly ranges the person works at other facilities (time ranges only, FR-ONB-06)."""
    if connection.vendor != "postgresql":
        return []
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT * FROM scheduling_busy_ranges(%s, %s)", [user_id, exclude_facility_id]
        )
        return [(int(w), s, e) for w, s, e in cursor.fetchall()]


def _warnings(
    facility_id: Any, template: ScheduleTemplate, membership: FacilityMembership
) -> list[dict[str, Any]]:
    warnings: list[dict[str, Any]] = []
    hours = (
        OpeningHours.objects.filter(
            facility_id=facility_id, service_id=template.service_id, weekday=template.weekday
        ).first()
        or OpeningHours.objects.filter(
            facility_id=facility_id, service__isnull=True, weekday=template.weekday
        ).first()
    )
    if hours is None or template.starts_at < hours.opens_at or template.ends_at > hours.closes_at:
        warnings.append({"kind": "outside_hours", "weekday": template.weekday})
    for weekday, starts, ends in busy_ranges(membership.user_id, facility_id):
        if weekday == template.weekday and starts < template.ends_at and template.starts_at < ends:
            warnings.append(
                {
                    "kind": "other_facility",
                    "weekday": weekday,
                    "starts_at": starts.strftime("%H:%M"),
                    "ends_at": ends.strftime("%H:%M"),
                }
            )
    return warnings


def _check_membership(facility_id: Any, membership_id: Any) -> FacilityMembership:
    membership = FacilityMembership.objects.filter(
        pk=membership_id, facility_id=facility_id, is_active=True
    ).first()
    if membership is None:
        raise exceptions.ValidationError(
            {"membership_id": [str(_("Choose an active staff member."))]}
        )
    if membership.licence_attested_at is None:
        from medilink.facilities.errors import FieldRule

        raise FieldRule("membership_id", NOT_ATTESTED)
    return membership


def save_template(
    facility: Any,
    data: dict[str, Any],
    *,
    actor: Any,
    request: Any,
    template: ScheduleTemplate | None = None,
) -> tuple[ScheduleTemplate, list[dict[str, Any]]]:
    from medilink.facilities.services import ensure_configurable

    ensure_configurable(facility)
    before = snapshot(template, TEMPLATE_FIELDS) if template else None
    if template is None:
        template = ScheduleTemplate(facility=facility, valid_from=timezone.localdate())
    elif data.pop("version", None) != template.version:
        raise Conflict(STALE)
    for name, value in data.items():
        setattr(template, name, value)
    membership = _check_membership(facility.pk, template.membership_id)
    if not Service.objects.filter(
        pk=template.service_id, facility=facility, is_active=True
    ).exists():
        raise exceptions.ValidationError({"service_id": [str(_("Choose an active service."))]})
    if (
        template.service_point_id
        and not ServicePoint.objects.filter(
            pk=template.service_point_id, facility=facility, is_active=True
        ).exists()
    ):
        raise exceptions.ValidationError(
            {"service_point_id": [str(_("Choose an active service point."))]}
        )
    if template.starts_at >= template.ends_at:
        raise exceptions.ValidationError({"ends_at": [str(_("The end must be after the start."))]})
    if (_minutes(template.ends_at) - _minutes(template.starts_at)) % template.slot_minutes:
        raise exceptions.ValidationError({"slot_minutes": [str(SLOT_FIT)]})
    overlapping = ScheduleTemplate.objects.filter(
        facility=facility,
        membership_id=template.membership_id,
        weekday=template.weekday,
        ended_at__isnull=True,
        starts_at__lt=template.ends_at,
        ends_at__gt=template.starts_at,
    ).exclude(pk=template.pk)
    if overlapping.exists():
        raise BusinessRuleViolation(OVERLAP)
    if before is not None:
        template.version += 1
    template.save()
    log_changes(
        facility_id=facility.pk,
        entity="schedule_template",
        entity_id=template.pk,
        before=before,
        after=snapshot(template, TEMPLATE_FIELDS),
        actor=actor,
    )
    record(
        "scheduling.template.saved",
        request=request,
        facility_id=facility.pk,
        object_type="schedule_template",
        object_id=template.pk,
    )
    return template, _warnings(facility.pk, template, membership)


def end_template(facility: Any, template: ScheduleTemplate, *, actor: Any, request: Any) -> None:
    before = snapshot(template, TEMPLATE_FIELDS)
    template.ended_at = timezone.now()
    template.valid_to = timezone.localdate()
    template.version += 1
    template.save()
    log_changes(
        facility_id=facility.pk,
        entity="schedule_template",
        entity_id=template.pk,
        before=before,
        after=snapshot(template, TEMPLATE_FIELDS),
        actor=actor,
    )
    record(
        "scheduling.template.ended",
        request=request,
        facility_id=facility.pk,
        object_type="schedule_template",
        object_id=template.pk,
    )


def end_templates_for_service(service: Any, *, actor: Any) -> int:
    return ScheduleTemplate.objects.filter(service=service, ended_at__isnull=True).update(
        ended_at=timezone.now(), valid_to=timezone.localdate()
    )


def create_exception(
    facility: Any,
    data: dict[str, Any],
    *,
    actor: Any,
    membership_of_actor: Any,
    can_manage: bool,
    request: Any,
) -> tuple[ScheduleException, list[dict[str, Any]]]:
    own = str(data.get("membership_id")) == str(getattr(membership_of_actor, "pk", None))
    # doctors request their own leave only
    if not can_manage and (data.get("kind") != ExceptionKind.LEAVE or not own):
        raise exceptions.PermissionDenied()
    membership = FacilityMembership.objects.filter(
        pk=data["membership_id"], facility=facility, is_active=True
    ).first()
    if membership is None:
        raise exceptions.ValidationError(
            {"membership_id": [str(_("Choose an active staff member."))]}
        )
    if data["starts_at"] >= data["ends_at"]:
        raise exceptions.ValidationError({"ends_at": [str(_("The end must be after the start."))]})
    exception = ScheduleException.objects.create(
        facility=facility,
        membership=membership,
        kind=data["kind"],
        starts_at=data["starts_at"],
        ends_at=data["ends_at"],
        service_id=data.get("service_id"),
        reason=data.get("reason", ""),
        requested_by=actor,
        status=ExceptionStatus.APPROVED if can_manage else ExceptionStatus.REQUESTED,
        decided_by=actor if can_manage else None,
    )
    warnings: list[dict[str, Any]] = []
    if exception.kind == ExceptionKind.EXTRA_SESSION:
        weekday = exception.starts_at.astimezone(timezone.get_current_timezone()).weekday()
        start = exception.starts_at.astimezone(timezone.get_current_timezone()).time()
        end = exception.ends_at.astimezone(timezone.get_current_timezone()).time()
        for w, s, e in busy_ranges(membership.user_id, facility.pk):
            if w == weekday and s < end and start < e:
                warnings.append(
                    {
                        "kind": "other_facility",
                        "weekday": w,
                        "starts_at": s.strftime("%H:%M"),
                        "ends_at": e.strftime("%H:%M"),
                    }
                )
    action = "approved" if can_manage else "requested"
    record(
        f"scheduling.exception.{action}",
        request=request,
        facility_id=facility.pk,
        object_type="schedule_exception",
        object_id=exception.pk,
        metadata={"kind": exception.kind},
    )
    if can_manage:
        _notify_approved(exception)
    return exception, warnings


def _notify_approved(exception: ScheduleException) -> None:
    if exception.kind != ExceptionKind.EXTRA_SESSION and exception.starts_at > timezone.now():
        exc_id, facility_id = exception.pk, exception.facility_id
        transaction.on_commit(
            lambda: exception_approved.send(
                sender=ScheduleException, exception_id=exc_id, facility_id=facility_id
            )
        )


def decide_exception(
    exception: ScheduleException,
    *,
    action: str,
    actor: Any,
    note: str,
    request: Any,
    can_manage: bool,
) -> ScheduleException:
    if exception.status not in (ExceptionStatus.REQUESTED, ExceptionStatus.APPROVED):
        raise BusinessRuleViolation(NOT_OPEN)
    if action in ("approve", "reject"):
        if not can_manage:
            raise exceptions.PermissionDenied()
        if exception.status != ExceptionStatus.REQUESTED:
            raise BusinessRuleViolation(NOT_OPEN)
        if action == "reject" and not note.strip():
            raise exceptions.ValidationError({"decision_note": [str(_("Say why."))]})
        exception.status = (
            ExceptionStatus.APPROVED if action == "approve" else ExceptionStatus.REJECTED
        )
        exception.decided_by = actor
    else:  # cancel
        if not can_manage and exception.requested_by_id != actor.pk:
            raise exceptions.PermissionDenied()
        exception.status = ExceptionStatus.CANCELLED
    exception.decision_note = note.strip()
    exception.save()
    verb = {"approve": "approved", "reject": "rejected", "cancel": "cancelled"}[action]
    record(
        f"scheduling.exception.{verb}",
        request=request,
        facility_id=exception.facility_id,
        object_type="schedule_exception",
        object_id=exception.pk,
    )
    if action == "approve":
        _notify_approved(exception)
    return exception


def blocks(facility_id: Any, start: dt.date, end: dt.date) -> list[dict[str, Any]]:
    """Template blocks per date minus approved leave/training, plus approved extra sessions
    (interface for S5 slot generation and the week grid)."""
    templates = list(
        ScheduleTemplate.objects.filter(
            facility_id=facility_id, ended_at__isnull=True
        ).select_related("membership__user")
    )
    exceptions_ = list(
        ScheduleException.objects.filter(
            facility_id=facility_id,
            status=ExceptionStatus.APPROVED,
            starts_at__date__lte=end,
            ends_at__date__gte=start,
        )
    )
    tz = timezone.get_current_timezone()
    out: list[dict[str, Any]] = []
    day = start
    while day <= end:
        for t in templates:
            if (
                t.weekday != day.weekday()
                or t.valid_from > day
                or (t.valid_to and t.valid_to < day)
            ):
                continue
            block_start = dt.datetime.combine(day, t.starts_at, tz)
            block_end = dt.datetime.combine(day, t.ends_at, tz)
            off = any(
                e.membership_id == t.membership_id
                and e.kind != ExceptionKind.EXTRA_SESSION
                and e.starts_at < block_end
                and block_start < e.ends_at
                for e in exceptions_
            )
            if off:
                continue
            out.append(
                {
                    "membership_id": str(t.membership_id),
                    "template_id": str(t.pk),
                    "service_id": str(t.service_id),
                    "service_point_id": str(t.service_point_id) if t.service_point_id else None,
                    "starts_at": block_start,
                    "ends_at": block_end,
                    "slot_minutes": t.slot_minutes,
                    "capacity": t.capacity,
                    "bookable_share_pct": t.bookable_share_pct,
                }
            )
        day += dt.timedelta(days=1)
    for e in exceptions_:
        if e.kind == ExceptionKind.EXTRA_SESSION and e.service_id:
            out.append(
                {
                    "membership_id": str(e.membership_id),
                    "template_id": None,
                    "service_id": str(e.service_id),
                    "service_point_id": None,
                    "starts_at": e.starts_at,
                    "ends_at": e.ends_at,
                    "slot_minutes": None,
                    "capacity": 1,
                    "bookable_share_pct": 100,
                }
            )
    return sorted(out, key=lambda b: b["starts_at"])
