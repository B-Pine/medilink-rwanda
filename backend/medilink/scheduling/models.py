"""Doctor schedules (contract sprint-02 §2.1). S5 adds slots and bookings to this app."""

from __future__ import annotations

from typing import Any, ClassVar

from django.conf import settings
from django.db import models
from django.db.models import F, Q

from medilink.core.models import TimeStampedModel


class ScheduleTemplate(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    version = models.PositiveIntegerField(default=1)
    membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )
    service = models.ForeignKey("facilities.Service", on_delete=models.PROTECT, related_name="+")
    service_point = models.ForeignKey(
        "facilities.ServicePoint", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    weekday = models.PositiveSmallIntegerField()
    starts_at = models.TimeField()
    ends_at = models.TimeField()
    slot_minutes = models.PositiveSmallIntegerField()
    capacity = models.PositiveSmallIntegerField(default=1)
    bookable_share_pct = models.PositiveSmallIntegerField(default=100)
    valid_from = models.DateField()
    valid_to = models.DateField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "scheduling_schedule_template"
        constraints: ClassVar[list[Any]] = [
            models.CheckConstraint(condition=Q(weekday__lte=6), name="scheduling_tpl_weekday"),
            models.CheckConstraint(
                condition=Q(starts_at__lt=F("ends_at")), name="scheduling_tpl_order"
            ),
            models.CheckConstraint(
                condition=Q(slot_minutes__gte=5) & Q(capacity__gte=1),
                name="scheduling_tpl_slot",
            ),
            models.CheckConstraint(
                condition=Q(bookable_share_pct__lte=100), name="scheduling_tpl_share"
            ),
        ]


class ExceptionKind(models.TextChoices):
    LEAVE = "leave", "Leave"
    TRAINING = "training", "Training"
    EXTRA_SESSION = "extra_session", "Extra session"


class ExceptionStatus(models.TextChoices):
    REQUESTED = "requested", "Requested"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    CANCELLED = "cancelled", "Cancelled"


class ScheduleException(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )
    kind = models.CharField(max_length=16, choices=ExceptionKind.choices)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    service = models.ForeignKey(
        "facilities.Service", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    status = models.CharField(max_length=10, choices=ExceptionStatus.choices)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    reason = models.CharField(max_length=200, blank=True)
    decision_note = models.CharField(max_length=200, blank=True)

    class Meta:
        db_table = "scheduling_schedule_exception"
        constraints: ClassVar[list[Any]] = [
            models.CheckConstraint(
                condition=Q(starts_at__lt=F("ends_at")), name="scheduling_exc_order"
            )
        ]
