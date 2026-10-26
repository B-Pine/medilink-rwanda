"""Visits and the live queue (contract sprint-04 §2.1). Facility tables have forced RLS; visits
and tickets also have a patient read policy (own and linked profiles)."""

from __future__ import annotations

from typing import Any, ClassVar

from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import Q

from medilink.core.models import TimeStampedModel, UUIDModel


class VisitSource(models.TextChoices):
    ONLINE_BOOKING = "online_booking", "Online booking"
    PHONE_BOOKING = "phone_booking", "Phone booking"
    FOLLOW_UP = "follow_up", "Follow-up"
    REMOTE_JOIN = "remote_join", "Remote join"
    WALK_IN = "walk_in", "Walk-in"
    REFERRAL = "referral", "Referral"
    EMERGENCY = "emergency", "Emergency"


class VisitStatus(models.TextChoices):
    REMOTE_PENDING = "remote_pending", "Remote, not arrived"
    ON_SITE = "on_site", "On site"
    COMPLETED = "completed", "Completed"
    LEFT_WITHOUT_SERVICE = "left_without_service", "Left without service"
    CANCELLED = "cancelled", "Cancelled"


OPEN_VISIT = (VisitStatus.REMOTE_PENDING, VisitStatus.ON_SITE)


class PriorityClass(models.TextChoices):
    ELDERLY = "elderly", "Elderly"
    PREGNANT = "pregnant", "Pregnant"
    DISABILITY = "disability", "Disability"
    VERY_SICK = "very_sick", "Very sick"


class Visit(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    facility_patient = models.ForeignKey(
        "patients.FacilityPatient", on_delete=models.PROTECT, related_name="visits"
    )
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="+")
    service_date = models.DateField()
    source = models.CharField(max_length=16, choices=VisitSource.choices)
    booking_id = models.UUIDField(null=True, blank=True, unique=True)
    status = models.CharField(max_length=24, choices=VisitStatus.choices)
    first_service = models.ForeignKey(
        "facilities.Service", on_delete=models.PROTECT, related_name="+"
    )
    # C3 reason for visit: AES-GCM ciphertext bound to (table, column, row id), patients.crypto
    reason_encrypted = models.BinaryField(null=True, blank=True)
    checked_in_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    is_emergency = models.BooleanField(default=False)
    priority_class = models.CharField(  # noqa: DJ001
        max_length=12, choices=PriorityClass.choices, null=True, blank=True
    )
    priority_reason_code = models.CharField(max_length=40, null=True, blank=True)  # noqa: DJ001
    insurance_profile_id = models.UUIDField(null=True, blank=True)
    check_in_key = models.UUIDField(null=True, blank=True)
    checked_in_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )

    class Meta:
        db_table = "visits_visit"
        indexes: ClassVar[list[Any]] = [
            models.Index(fields=["facility", "service_date", "status"], name="visits_visit_day"),
            models.Index(fields=["patient", "-service_date"], name="visits_visit_patient"),
        ]
        constraints: ClassVar[list[Any]] = [
            models.UniqueConstraint(
                fields=["facility", "patient", "service_date"],
                condition=Q(status__in=list(OPEN_VISIT)),
                name="visits_one_open_visit_per_day",
            ),
            models.UniqueConstraint(
                fields=["facility", "check_in_key"],
                condition=Q(check_in_key__isnull=False),
                name="visits_check_in_key",
            ),
        ]

    def __str__(self) -> str:
        return f"visit {self.pk}"


class Stage(models.TextChoices):
    RECEPTION = "reception", "Reception"
    PAYMENT = "payment", "Payment"
    CONSULTATION = "consultation", "Consultation"
    PHARMACY = "pharmacy", "Pharmacy"


class TicketState(models.TextChoices):
    WAITING = "waiting", "Waiting"
    CALLED = "called", "Called"
    IN_SERVICE = "in_service", "In service"
    NO_RESPONSE = "no_response", "No response"
    ON_HOLD = "on_hold", "On hold"
    MOVED_TO_NEXT_STAGE = "moved_to_next_stage", "Moved to next stage"
    TRANSFERRED = "transferred", "Transferred"
    CANCELLED = "cancelled", "Cancelled"
    LEFT_WITHOUT_SERVICE = "left_without_service", "Left without service"
    COMPLETED = "completed", "Completed"


ACTIVE_STATES = (
    TicketState.WAITING,
    TicketState.CALLED,
    TicketState.IN_SERVICE,
    TicketState.NO_RESPONSE,
    TicketState.ON_HOLD,
)

# priority_rank values (contract §2.1): lower is called first
RANK_EMERGENCY, RANK_RETURN, RANK_PRIORITY, RANK_NORMAL = 0, 1, 2, 3


class Ticket(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    version = models.PositiveIntegerField(default=1)
    visit = models.ForeignKey(Visit, on_delete=models.PROTECT, related_name="tickets")
    service = models.ForeignKey("facilities.Service", on_delete=models.PROTECT, related_name="+")
    stage = models.CharField(max_length=12, choices=Stage.choices)
    service_date = models.DateField()
    number = models.CharField(max_length=8)
    sequence = models.PositiveIntegerField()
    state = models.CharField(max_length=24, choices=TicketState.choices)
    assigned_membership = models.ForeignKey(
        "tenancy.FacilityMembership",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    service_point = models.ForeignKey(
        "facilities.ServicePoint", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    priority_rank = models.PositiveSmallIntegerField(default=RANK_NORMAL)
    slot_starts_at = models.DateTimeField(null=True, blank=True)
    arrival_at = models.DateTimeField()
    is_remote = models.BooleanField(default=False)
    remote_checked_in_at = models.DateTimeField(null=True, blank=True)
    no_response_count = models.PositiveSmallIntegerField(default=0)
    pass_over_count = models.PositiveSmallIntegerField(default=0)
    step_out_until = models.DateTimeField(null=True, blank=True)
    called_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    estimate_min_minutes = models.PositiveSmallIntegerField(null=True, blank=True)
    estimate_max_minutes = models.PositiveSmallIntegerField(null=True, blank=True)
    estimate_shown_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "visits_ticket"
        indexes: ClassVar[list[Any]] = [
            models.Index(
                fields=["facility", "service", "stage", "priority_rank", "arrival_at"],
                condition=Q(state="waiting"),
                name="visits_ticket_call_next",
            ),
            models.Index(fields=["visit"], name="visits_ticket_visit"),
        ]
        constraints: ClassVar[list[Any]] = [
            models.UniqueConstraint(
                fields=["facility", "service", "service_date", "sequence"],
                name="visits_ticket_sequence",
            ),
            models.UniqueConstraint(
                fields=["visit"],
                condition=Q(state__in=[s.value for s in ACTIVE_STATES]),
                name="visits_one_active_ticket",
            ),
            models.CheckConstraint(condition=Q(priority_rank__lte=3), name="visits_ticket_rank"),
        ]

    def __str__(self) -> str:
        return self.number


class TicketEvent(UUIDModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    ticket = models.ForeignKey(Ticket, on_delete=models.PROTECT, related_name="events")
    from_state = models.CharField(max_length=24, blank=True)
    to_state = models.CharField(max_length=24)
    action = models.CharField(max_length=30)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    actor_membership = models.ForeignKey(
        "tenancy.FacilityMembership",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    request_id = models.CharField(max_length=40, blank=True)
    reason_code = models.CharField(max_length=40, blank=True)
    reason_text = models.CharField(max_length=300, blank=True)
    occurred_at = models.DateTimeField()
    client_occurred_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "visits_ticket_event"
        indexes: ClassVar[list[Any]] = [
            models.Index(fields=["ticket", "occurred_at"], name="visits_event_ticket"),
            models.Index(fields=["facility", "occurred_at"], name="visits_event_day"),
            models.Index(
                fields=["facility", "action", "actor_membership"], name="visits_event_action"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.action} {self.ticket_id}"


class TicketCounter(UUIDModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    service = models.ForeignKey("facilities.Service", on_delete=models.PROTECT, related_name="+")
    service_date = models.DateField()
    last_sequence = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "visits_ticket_counter"
        constraints: ClassVar[list[Any]] = [
            models.UniqueConstraint(
                fields=["facility", "service", "service_date"], name="visits_counter_day"
            )
        ]

    def __str__(self) -> str:
        return f"counter {self.service_id} {self.service_date}"


class DutyState(models.TextChoices):
    ON_DUTY = "on_duty", "On duty"
    BREAK = "break", "Break"
    EMERGENCY = "emergency", "Emergency"
    OFF = "off", "Off"


class DutyStatus(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )
    service_point = models.ForeignKey(
        "facilities.ServicePoint", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    state = models.CharField(max_length=10, choices=DutyState.choices, default=DutyState.OFF)
    until_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "visits_duty_status"
        constraints: ClassVar[list[Any]] = [
            models.UniqueConstraint(fields=["facility", "membership"], name="visits_duty_member")
        ]

    def __str__(self) -> str:
        return f"{self.membership_id} {self.state}"


class DutyStatusEvent(UUIDModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    membership = models.ForeignKey(
        "tenancy.FacilityMembership", on_delete=models.PROTECT, related_name="+"
    )
    from_state = models.CharField(max_length=10)
    to_state = models.CharField(max_length=10)
    occurred_at = models.DateTimeField()

    class Meta:
        db_table = "visits_duty_status_event"

    def __str__(self) -> str:
        return f"{self.membership_id} {self.to_state}"


class ReorderReview(UUIDModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    ticket_event = models.OneToOneField(
        TicketEvent, on_delete=models.PROTECT, related_name="review"
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    reviewed_at = models.DateTimeField()
    comment = models.CharField(max_length=300, blank=True)

    class Meta:
        db_table = "visits_reorder_review"

    def __str__(self) -> str:
        return f"review {self.ticket_event_id}"


class DisplayLink(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    label = models.CharField(max_length=80)
    service_ids = ArrayField(models.UUIDField(), default=list)
    token_hash = models.BinaryField(unique=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    revoked_at = models.DateTimeField(null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "facilities_display_link"

    def __str__(self) -> str:
        return self.label


class TravelTime(UUIDModel):
    account = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+"
    )
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.CASCADE, related_name="+")
    minutes = models.PositiveSmallIntegerField()

    class Meta:
        db_table = "scheduling_travel_time"
        constraints: ClassVar[list[Any]] = [
            models.UniqueConstraint(fields=["account", "facility"], name="travel_time_once"),
            models.CheckConstraint(condition=Q(minutes__lte=600), name="travel_time_range"),
        ]

    def __str__(self) -> str:
        return f"{self.minutes} min"


class OutboxEvent(UUIDModel):
    """Transactional outbox (database design `core_outbox_event`): IDs only, never personal data."""

    topic = models.CharField(max_length=60)
    facility_id = models.UUIDField(null=True, blank=True)
    payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    published_at = models.DateTimeField(null=True, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "core_outbox_event"
        indexes: ClassVar[list[Any]] = [
            models.Index(
                fields=["created_at"],
                condition=Q(published_at__isnull=True),
                name="core_outbox_unpublished",
            )
        ]

    def __str__(self) -> str:
        return self.topic
