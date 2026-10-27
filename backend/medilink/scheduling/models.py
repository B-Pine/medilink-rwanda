"""Doctor schedules (contract sprint-02 §2.1); slots, holds and bookings (sprint-05 §2.1)."""

from __future__ import annotations

from typing import Any, ClassVar

from django.conf import settings
from django.db import models
from django.db.models import F, Q

from medilink.core.models import TimeStampedModel, UUIDModel


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


# ---- S5: slots, holds and bookings (contract sprint-05 §2.1) -----------------------------------


class SlotStatus(models.TextChoices):
    OPEN = "open", "Open"
    CLOSED = "closed", "Closed"
    CANCELLED = "cancelled", "Cancelled"


class Slot(TimeStampedModel):
    """One bookable time for a doctor (or a service schedule) with counters updated under a row
    lock: `booked_count + held_count <= bookable_capacity` (database design §5.6)."""

    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    service = models.ForeignKey("facilities.Service", on_delete=models.PROTECT, related_name="+")
    membership = models.ForeignKey(
        "tenancy.FacilityMembership",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    service_point = models.ForeignKey(
        "facilities.ServicePoint", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    capacity = models.PositiveSmallIntegerField()
    bookable_capacity = models.PositiveSmallIntegerField()
    booked_count = models.PositiveSmallIntegerField(default=0)
    held_count = models.PositiveSmallIntegerField(default=0)
    status = models.CharField(max_length=10, choices=SlotStatus.choices, default=SlotStatus.OPEN)
    source_template = models.ForeignKey(
        ScheduleTemplate, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        db_table = "scheduling_slot"
        indexes: ClassVar[list[Any]] = [
            models.Index(
                fields=["facility", "service", "starts_at"],
                condition=Q(status="open"),
                name="scheduling_slot_open",
            )
        ]
        constraints: ClassVar[list[Any]] = [
            models.UniqueConstraint(
                fields=["facility", "service", "membership", "starts_at"],
                nulls_distinct=False,
                name="scheduling_slot_once",
            ),
            models.CheckConstraint(
                condition=Q(booked_count__lte=F("bookable_capacity") - F("held_count")),
                name="scheduling_slot_counters",
            ),
            models.CheckConstraint(
                condition=Q(bookable_capacity__lte=F("capacity")), name="scheduling_slot_share"
            ),
            models.CheckConstraint(
                condition=Q(starts_at__lt=F("ends_at")), name="scheduling_slot_order"
            ),
        ]

    def __str__(self) -> str:
        return f"slot {self.starts_at:%Y-%m-%d %H:%M}"

    @property
    def open_places(self) -> int:
        return max(self.bookable_capacity - self.booked_count - self.held_count, 0)


class SlotHold(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    slot = models.ForeignKey(Slot, on_delete=models.PROTECT, related_name="holds")
    account = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    membership = models.ForeignKey(
        "tenancy.FacilityMembership",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    expires_at = models.DateTimeField()
    released_at = models.DateTimeField(null=True, blank=True)
    booking_id = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "scheduling_slot_hold"
        indexes: ClassVar[list[Any]] = [
            models.Index(
                fields=["slot"], condition=Q(released_at__isnull=True), name="scheduling_hold_open"
            ),
            models.Index(fields=["expires_at"], name="scheduling_hold_expiry"),
        ]
        constraints: ClassVar[list[Any]] = [
            models.CheckConstraint(
                condition=Q(account__isnull=False) | Q(membership__isnull=False),
                name="scheduling_hold_owner",
            )
        ]

    def __str__(self) -> str:
        return f"hold {self.slot_id}"


class BookingSource(models.TextChoices):
    ONLINE = "online", "Online"
    PHONE = "phone", "Phone"
    FOLLOW_UP = "follow_up", "Follow-up"
    REFERRAL = "referral", "Referral"
    REBOOKING = "rebooking", "Rebooking"


class BookingStatus(models.TextChoices):
    CONFIRMED = "confirmed", "Confirmed"
    CANCELLED = "cancelled", "Cancelled"
    LATE_CANCELLED = "late_cancelled", "Late cancelled"
    NO_SHOW = "no_show", "No-show"
    CHECKED_IN = "checked_in", "Checked in"
    SUPERSEDED = "superseded", "Superseded"


class Booking(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    version = models.PositiveIntegerField(default=1)
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="+")
    facility_patient = models.ForeignKey(
        "patients.FacilityPatient",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    account = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    booked_by_membership = models.ForeignKey(
        "tenancy.FacilityMembership",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    source = models.CharField(max_length=10, choices=BookingSource.choices)
    slot = models.ForeignKey(
        Slot, on_delete=models.SET_NULL, null=True, blank=True, related_name="bookings"
    )
    service = models.ForeignKey("facilities.Service", on_delete=models.PROTECT, related_name="+")
    membership = models.ForeignKey(
        "tenancy.FacilityMembership",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    starts_at = models.DateTimeField()
    service_date = models.DateField()
    status = models.CharField(max_length=16, choices=BookingStatus.choices)
    booking_code = models.CharField(max_length=10)
    idempotency_key = models.UUIDField(null=True, blank=True)
    contact_phone_e164 = models.CharField(max_length=16, null=True, blank=True)  # noqa: DJ001
    insurance_profile_id = models.UUIDField(null=True, blank=True)
    insurer_code = models.CharField(max_length=40, null=True, blank=True)  # noqa: DJ001
    insurer_accepted = models.BooleanField(null=True, blank=True)
    estimated_fee_rwf = models.PositiveIntegerField(null=True, blank=True)
    estimated_patient_share_rwf = models.PositiveIntegerField(null=True, blank=True)
    # C3 reason for visit: AES-GCM ciphertext bound to (table, column, row id), patients.crypto
    reason_encrypted = models.BinaryField(null=True, blank=True)
    pending_change = models.JSONField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason_code = models.CharField(max_length=40, null=True, blank=True)  # noqa: DJ001
    rescheduled_to_id = models.UUIDField(null=True, blank=True)
    visit_id = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "scheduling_booking"
        indexes: ClassVar[list[Any]] = [
            models.Index(fields=["facility", "service_date", "status"], name="scheduling_bk_day"),
            models.Index(
                fields=["patient", "starts_at"],
                condition=Q(status="confirmed"),
                name="scheduling_bk_patient",
            ),
        ]
        constraints: ClassVar[list[Any]] = [
            models.UniqueConstraint(fields=["facility", "booking_code"], name="scheduling_bk_code"),
            models.UniqueConstraint(
                fields=["patient", "service", "service_date"],
                condition=Q(status="confirmed"),
                name="scheduling_bk_one_per_day",
            ),
            models.UniqueConstraint(
                fields=["facility", "idempotency_key"],
                condition=Q(idempotency_key__isnull=False),
                name="scheduling_bk_key",
            ),
        ]

    def __str__(self) -> str:
        return self.booking_code


class BookingEvent(UUIDModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    booking = models.ForeignKey(Booking, on_delete=models.PROTECT, related_name="events")
    from_status = models.CharField(max_length=16, blank=True)
    to_status = models.CharField(max_length=16)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    reason_code = models.CharField(max_length=40, blank=True)
    reason_text = models.CharField(max_length=300, blank=True)
    occurred_at = models.DateTimeField()

    class Meta:
        db_table = "scheduling_booking_event"
        indexes: ClassVar[list[Any]] = [
            models.Index(fields=["booking", "occurred_at"], name="scheduling_bk_event")
        ]

    def __str__(self) -> str:
        return f"{self.to_status} {self.booking_id}"


class NoShowStrike(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="+")
    booking = models.OneToOneField(Booking, on_delete=models.PROTECT, related_name="strike")
    occurred_at = models.DateTimeField()
    reversed_at = models.DateTimeField(null=True, blank=True)
    reversed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    reversal_reason = models.CharField(max_length=300, blank=True)

    class Meta:
        db_table = "scheduling_no_show_strike"
        indexes: ClassVar[list[Any]] = [
            models.Index(fields=["patient", "occurred_at"], name="scheduling_strike_patient")
        ]

    def __str__(self) -> str:
        return f"strike {self.booking_id}"
