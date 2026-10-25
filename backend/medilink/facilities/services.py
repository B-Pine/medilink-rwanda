"""Facility configuration services (contract sprint-02 §2.2). Every write goes through here so the
change log and audit stay complete. Callers run inside the request's facility RLS context."""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions

from medilink.audit.services import record
from medilink.core.exceptions import BusinessRuleViolation, Conflict
from medilink.facilities import settings_schema
from medilink.facilities.changelog import log_changes, snapshot
from medilink.facilities.models import (
    Branding,
    CalendarEvent,
    Department,
    OpeningHours,
    Profile,
    Service,
    ServicePoint,
    ServicePointService,
    Settings,
)
from medilink.tenancy.models import Facility, FacilityStatus

STALE = _("Someone else changed this. Reload and try again.")
DEACTIVATED = _("This facility is closed and can't be configured.")
PREFIX_TAKEN = _("Another active service uses this ticket prefix.")
DEPARTMENT_IN_USE = _("Retire or move the department's active services first.")
OUTSIDE_FACILITY = _("Service hours must lie inside the facility's opening hours.")
PAST_EVENT = _("Past calendar events can't be changed.")

PROFILE_FIELDS = (
    "description_i18n",
    "phone",
    "email",
    "website",
    "address",
    "village_code",
    "latitude",
    "longitude",
    "level_of_care",
)
SERVICE_FIELDS = (
    "department_id",
    "catalogue_item_code",
    "name_i18n",
    "duration_minutes",
    "is_bookable",
    "allows_walk_in",
    "allows_remote_join",
    "ticket_prefix",
    "min_age_months",
    "max_age_months",
    "sex_restriction",
    "is_active",
)


def check_version(current: int, sent: Any) -> None:
    if sent != current:
        raise Conflict(STALE)


def ensure_configurable(facility: Facility) -> None:
    if facility.status == FacilityStatus.DEACTIVATED:
        raise BusinessRuleViolation(DEACTIVATED)


def _audit(
    action: str, request: Any, facility_id: Any, object_type: str, object_id: Any, **meta: Any
) -> None:
    record(
        action,
        request=request,
        facility_id=facility_id,
        object_type=object_type,
        object_id=object_id,
        metadata=meta or None,
    )


# ---- profile, settings, branding ---------------------------------------------------------------


def profile_of(facility: Facility) -> Profile:
    profile, _created = Profile.objects.get_or_create(facility=facility)
    return profile


def settings_of(facility: Facility) -> Settings:
    row, _created = Settings.objects.get_or_create(facility=facility)
    return row


def branding_of(facility: Facility) -> Branding:
    row, _created = Branding.objects.get_or_create(facility=facility)
    return row


def update_profile(
    facility: Facility, data: dict[str, Any], *, actor: Any, request: Any
) -> Profile:
    ensure_configurable(facility)
    profile = Profile.objects.select_for_update().get(pk=profile_of(facility).pk)
    check_version(profile.version, data.pop("version"))
    before = snapshot(profile, PROFILE_FIELDS)
    for name, value in data.items():
        setattr(profile, name, value)
    changed = log_changes(
        facility_id=facility.pk,
        entity="profile",
        entity_id=facility.pk,
        before=before,
        after=snapshot(profile, PROFILE_FIELDS),
        actor=actor,
    )
    if changed:
        profile.version += 1
        profile.save()
        _audit(
            "facilities.profile.updated",
            request,
            facility.pk,
            "facility",
            facility.pk,
            fields=changed,
        )
    return profile


def set_photos(facility: Facility, photo_ids: list[Any], *, actor: Any, request: Any) -> Profile:
    profile = profile_of(facility)
    before = {"photo_file_ids": list(profile.photo_file_ids)}
    profile.photo_file_ids = photo_ids
    profile.version += 1
    profile.save(update_fields=["photo_file_ids", "version", "updated_at"])
    log_changes(
        facility_id=facility.pk,
        entity="profile",
        entity_id=facility.pk,
        before=before,
        after={"photo_file_ids": photo_ids},
        actor=actor,
    )
    _audit(
        "facilities.profile.updated",
        request,
        facility.pk,
        "facility",
        facility.pk,
        fields=["photo_file_ids"],
    )
    return profile


def settings_data(row: Settings) -> dict[str, Any]:
    data: dict[str, Any] = {
        name: settings_schema.with_defaults(name, getattr(row, name))
        for name in settings_schema.SECTIONS
    }
    return {**data, "umuganda": row.umuganda, "version": row.version}


def update_settings(
    facility: Facility,
    *,
    version: int,
    section: str,
    values: dict[str, Any],
    actor: Any,
    request: Any,
) -> Settings:
    ensure_configurable(facility)
    row = Settings.objects.select_for_update().get(pk=settings_of(facility).pk)
    check_version(row.version, version)
    if section == "umuganda":
        from medilink.facilities.models import Umuganda

        value = values.get("value")
        if value not in Umuganda.values:
            raise exceptions.ValidationError(
                {"values.value": [str(_("Choose one of the options."))]}
            )
        before: dict[str, Any] = {"umuganda": row.umuganda}
        after: dict[str, Any] = {"umuganda": value}
        row.umuganda = value
    else:
        try:
            clean = settings_schema.validate(section, values)
        except settings_schema.SettingsError as exc:
            raise exceptions.ValidationError(
                {f"values.{k}": [str(_("Not a valid value."))] for k in exc.errors}
            ) from None
        current = dict(getattr(row, section))
        before = {f"{section}.{k}": current.get(k) for k in clean}
        current.update(clean)
        setattr(row, section, current)
        after = {f"{section}.{k}": v for k, v in clean.items()}
    changed = log_changes(
        facility_id=facility.pk,
        entity="settings",
        entity_id=facility.pk,
        before=before,
        after=after,
        actor=actor,
    )
    if changed:
        row.version += 1
        row.save()
        _audit(
            "facilities.settings.updated",
            request,
            facility.pk,
            "facility",
            facility.pk,
            section=section,
            fields=changed,
        )
    return row


def update_branding(
    facility: Facility, data: dict[str, Any], *, actor: Any, request: Any
) -> Branding:
    ensure_configurable(facility)
    row = Branding.objects.select_for_update().get(pk=branding_of(facility).pk)
    check_version(row.version, data.pop("version"))
    fields = ("letterhead_file_id", "logo_file_id", "stamp_file_id", "footer_text")
    before = snapshot(row, fields)
    for name, value in data.items():
        setattr(row, name, value)
    changed = log_changes(
        facility_id=facility.pk,
        entity="branding",
        entity_id=facility.pk,
        before=before,
        after=snapshot(row, fields),
        actor=actor,
    )
    if changed:
        row.version += 1
        row.save()
        _audit(
            "facilities.branding.updated",
            request,
            facility.pk,
            "facility",
            facility.pk,
            fields=changed,
        )
    return row


# ---- departments, services, service points ------------------------------------------------------


def save_department(
    facility: Facility,
    data: dict[str, Any],
    *,
    actor: Any,
    request: Any,
    department: Department | None = None,
) -> Department:
    ensure_configurable(facility)
    fields = ("name_i18n", "sort_order", "is_active")
    before = snapshot(department, fields) if department else None
    if department is None:
        department = Department(facility=facility)
    if (
        data.get("is_active") is False
        and department.pk
        and department.services.filter(is_active=True).exists()
    ):
        raise BusinessRuleViolation(DEPARTMENT_IN_USE)
    for name, value in data.items():
        setattr(department, name, value)
    department.save()
    log_changes(
        facility_id=facility.pk,
        entity="department",
        entity_id=department.pk,
        before=before,
        after=snapshot(department, fields),
        actor=actor,
    )
    action = (
        "created"
        if before is None
        else ("retired" if data.get("is_active") is False else "updated")
    )
    _audit(f"facilities.department.{action}", request, facility.pk, "department", department.pk)
    return department


def save_service(
    facility: Facility,
    data: dict[str, Any],
    *,
    actor: Any,
    request: Any,
    service: Service | None = None,
) -> tuple[Service, list[dict[str, Any]]]:
    """Create or update a service. Retiring ends its schedule templates (returned as warnings)."""
    ensure_configurable(facility)
    warnings: list[dict[str, Any]] = []
    before = snapshot(service, SERVICE_FIELDS) if service else None
    if service is None:
        service = Service(facility=facility)
    else:
        check_version(service.version, data.pop("version", None))
    if (
        "department_id" in data
        and not Department.objects.filter(
            pk=data["department_id"], facility=facility, is_active=True
        ).exists()
    ):
        raise exceptions.ValidationError(
            {"department_id": [str(_("Choose an active department."))]}
        )
    for name, value in data.items():
        setattr(service, name, value)
    if service.ticket_prefix:
        service.ticket_prefix = service.ticket_prefix.upper()
    if before is not None:
        service.version += 1
    try:
        with transaction.atomic():
            service.save()
    except IntegrityError:
        from medilink.facilities.errors import FieldConflict

        raise FieldConflict("ticket_prefix", PREFIX_TAKEN) from None
    if before and before["is_active"] and not service.is_active:
        from medilink.scheduling.services import end_templates_for_service

        ended = end_templates_for_service(service, actor=actor)
        if ended:
            warnings.append({"kind": "templates_ended", "count": ended})
    log_changes(
        facility_id=facility.pk,
        entity="service",
        entity_id=service.pk,
        before=before,
        after=snapshot(service, SERVICE_FIELDS),
        actor=actor,
    )
    action = (
        "created"
        if before is None
        else ("retired" if before["is_active"] and not service.is_active else "updated")
    )
    _audit(f"facilities.service.{action}", request, facility.pk, "service", service.pk)
    return service, warnings


def save_service_point(
    facility: Facility,
    data: dict[str, Any],
    *,
    actor: Any,
    request: Any,
    point: ServicePoint | None = None,
) -> ServicePoint:
    ensure_configurable(facility)
    service_ids = data.pop("service_ids", None)
    before = None
    if point is not None:
        before = {
            **snapshot(point, ("name", "kind", "is_active")),
            "service_ids": sorted(str(s) for s in point.services.values_list("pk", flat=True)),
        }
    else:
        point = ServicePoint(facility=facility)
    for name, value in data.items():
        setattr(point, name, value)
    point.save()
    if service_ids is not None:
        valid = set(
            Service.objects.filter(facility=facility, pk__in=service_ids).values_list(
                "pk", flat=True
            )
        )
        if len(valid) != len(set(service_ids)):
            raise exceptions.ValidationError(
                {"service_ids": [str(_("Choose services of this facility."))]}
            )
        ServicePointService.objects.filter(service_point=point).exclude(
            service_id__in=valid
        ).delete()
        existing = set(
            ServicePointService.objects.filter(service_point=point).values_list(
                "service_id", flat=True
            )
        )
        ServicePointService.objects.bulk_create(
            [
                ServicePointService(facility=facility, service_point=point, service_id=s)
                for s in valid - existing
            ]
        )
    after = {
        **snapshot(point, ("name", "kind", "is_active")),
        "service_ids": sorted(str(s) for s in point.services.values_list("pk", flat=True)),
    }
    log_changes(
        facility_id=facility.pk,
        entity="service_point",
        entity_id=point.pk,
        before=before,
        after=after,
        actor=actor,
    )
    action = (
        "created"
        if before is None
        else ("retired" if before["is_active"] and not point.is_active else "updated")
    )
    _audit(f"facilities.service_point.{action}", request, facility.pk, "service_point", point.pk)
    return point


# ---- opening hours and calendar events ----------------------------------------------------------


def hours_version(facility: Facility, service_id: Any) -> int:
    """Hours have no row of their own; the version is the number of logged changes for the scope."""
    from medilink.facilities.models import ConfigChange

    return (
        ConfigChange.objects.filter(
            facility=facility, entity="opening_hours", entity_id=str(service_id or facility.pk)
        )
        .values("changed_at")
        .distinct()
        .count()
        + 1
    )


def replace_hours(
    facility: Facility,
    *,
    service_id: Any,
    version: int,
    days: list[dict[str, Any]],
    actor: Any,
    request: Any,
) -> list[OpeningHours]:
    ensure_configurable(facility)
    check_version(hours_version(facility, service_id), version)
    weekdays = [d["weekday"] for d in days]
    if len(weekdays) != len(set(weekdays)):
        raise exceptions.ValidationError({"days": [str(_("Each day can appear only once."))]})
    if service_id is not None:
        if not Service.objects.filter(pk=service_id, facility=facility).exists():
            raise exceptions.ValidationError(
                {"service_id": [str(_("Choose a service of this facility."))]}
            )
        facility_week = {
            h.weekday: h
            for h in OpeningHours.objects.filter(facility=facility, service__isnull=True)
        }
        outside = [
            d["weekday"]
            for d in days
            if d["weekday"] not in facility_week
            or d["opens_at"] < facility_week[d["weekday"]].opens_at
            or d["closes_at"] > facility_week[d["weekday"]].closes_at
        ]
        if outside:
            raise BusinessRuleViolation(OUTSIDE_FACILITY)
    current = OpeningHours.objects.filter(facility=facility, service_id=service_id)
    fields = ("opens_at", "closes_at", "break_starts_at", "break_ends_at")
    before = {f"{h.weekday}.{f}": getattr(h, f) for h in current for f in fields}
    current.delete()
    rows = OpeningHours.objects.bulk_create(
        [OpeningHours(facility=facility, service_id=service_id, **d) for d in days]
    )
    after = {f"{h.weekday}.{f}": getattr(h, f) for h in rows for f in fields}
    log_changes(
        facility_id=facility.pk,
        entity="opening_hours",
        entity_id=service_id or facility.pk,
        before=before,
        after=after,
        actor=actor,
    )
    _audit(
        "facilities.hours.replaced",
        request,
        facility.pk,
        "facility",
        facility.pk,
        scope=str(service_id or "facility"),
    )
    return sorted(rows, key=lambda h: h.weekday)


EVENT_FIELDS = (
    "kind",
    "service_id",
    "starts_at",
    "ends_at",
    "is_open",
    "opens_at",
    "closes_at",
    "reason",
)


def save_event(
    facility: Facility,
    data: dict[str, Any],
    *,
    actor: Any,
    request: Any,
    event: CalendarEvent | None = None,
) -> CalendarEvent:
    ensure_configurable(facility)
    if event is not None and event.ends_at <= timezone.now():
        raise BusinessRuleViolation(PAST_EVENT)
    before = snapshot(event, EVENT_FIELDS) if event else None
    if event is None:
        event = CalendarEvent(facility=facility)
    for name, value in data.items():
        setattr(event, name, value)
    if event.starts_at >= event.ends_at:
        raise exceptions.ValidationError({"ends_at": [str(_("The end must be after the start."))]})
    event.save()
    log_changes(
        facility_id=facility.pk,
        entity="calendar_event",
        entity_id=event.pk,
        before=before,
        after=snapshot(event, EVENT_FIELDS),
        actor=actor,
    )
    _audit(
        f"facilities.calendar_event.{'created' if before is None else 'updated'}",
        request,
        facility.pk,
        "calendar_event",
        event.pk,
    )
    return event


def delete_event(facility: Facility, event: CalendarEvent, *, actor: Any, request: Any) -> None:
    if event.ends_at <= timezone.now():
        raise BusinessRuleViolation(PAST_EVENT)
    event.deleted_at = timezone.now()
    event.save(update_fields=["deleted_at", "updated_at"])
    log_changes(
        facility_id=facility.pk,
        entity="calendar_event",
        entity_id=event.pk,
        before=snapshot(event, EVENT_FIELDS),
        after=None,
        actor=actor,
    )
    _audit("facilities.calendar_event.deleted", request, facility.pk, "calendar_event", event.pk)


def today() -> dt.date:
    return timezone.localdate()
