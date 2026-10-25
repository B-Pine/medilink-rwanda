"""Facility configuration (contract sprint-02 §2.1). Every table has `facility_id` and forced
RLS."""

from __future__ import annotations

from typing import Any, ClassVar

from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import F, Q

from medilink.core.models import TimeStampedModel, UUIDModel


class FacilityOwned(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")

    class Meta:
        abstract = True


class Profile(models.Model):
    """Public-facing description of the facility (name and type stay platform-managed)."""

    facility = models.OneToOneField(
        "tenancy.Facility", on_delete=models.PROTECT, primary_key=True, related_name="+"
    )
    version = models.PositiveIntegerField(default=1)
    description_i18n = models.JSONField(default=dict, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    website = models.URLField(blank=True)
    address = models.CharField(max_length=300, blank=True)
    village_code = models.CharField(max_length=40, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    photo_file_ids = ArrayField(models.UUIDField(), default=list, blank=True)
    level_of_care = models.CharField(max_length=40, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "facilities_profile"

    def __str__(self) -> str:
        return f"{self._meta.db_table} {self.pk}"


class Department(FacilityOwned):
    name_i18n = models.JSONField()
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "facilities_department"
        ordering: ClassVar[list[str]] = ["sort_order", "created_at"]


class SexRestriction(models.TextChoices):
    FEMALE = "female", "Female"
    MALE = "male", "Male"


class Service(FacilityOwned):
    version = models.PositiveIntegerField(default=1)
    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name="services")
    catalogue_item_code = models.CharField(max_length=40, blank=True)
    name_i18n = models.JSONField()
    duration_minutes = models.PositiveSmallIntegerField(default=15)
    is_bookable = models.BooleanField(default=True)
    allows_walk_in = models.BooleanField(default=True)
    allows_remote_join = models.BooleanField(default=False)
    ticket_prefix = models.CharField(max_length=3)
    min_age_months = models.PositiveSmallIntegerField(null=True, blank=True)
    max_age_months = models.PositiveSmallIntegerField(null=True, blank=True)
    sex_restriction = models.CharField(  # noqa: DJ001
        max_length=8, choices=SexRestriction.choices, null=True, blank=True
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "facilities_service"
        constraints: ClassVar[list[Any]] = [
            models.UniqueConstraint(
                fields=["facility", "ticket_prefix"],
                condition=Q(is_active=True),
                name="facilities_service_prefix_uniq",
            ),
            models.CheckConstraint(
                condition=Q(duration_minutes__gte=5) & Q(duration_minutes__lte=240),
                name="facilities_service_duration",
            ),
        ]


class ServicePointKind(models.TextChoices):
    ROOM = "room", "Room"
    DESK = "desk", "Desk"
    WINDOW = "window", "Window"
    LAB = "lab", "Laboratory"
    OTHER = "other", "Other"


class ServicePoint(FacilityOwned):
    name = models.CharField(max_length=80)
    kind = models.CharField(max_length=8, choices=ServicePointKind.choices)
    services = models.ManyToManyField(
        Service, through="ServicePointService", related_name="service_points"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "facilities_service_point"
        ordering: ClassVar[list[str]] = ["name"]


class ServicePointService(FacilityOwned):
    service_point = models.ForeignKey(ServicePoint, on_delete=models.CASCADE, related_name="+")
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="+")

    class Meta:
        db_table = "facilities_service_point_service"
        constraints: ClassVar[list[Any]] = [
            models.UniqueConstraint(fields=["service_point", "service"], name="facilities_sps_uniq")
        ]


class OpeningHours(FacilityOwned):
    service = models.ForeignKey(Service, on_delete=models.CASCADE, null=True, blank=True)
    weekday = models.PositiveSmallIntegerField()  # Monday = 0
    opens_at = models.TimeField()
    closes_at = models.TimeField()
    break_starts_at = models.TimeField(null=True, blank=True)
    break_ends_at = models.TimeField(null=True, blank=True)

    class Meta:
        db_table = "facilities_opening_hours"
        constraints: ClassVar[list[Any]] = [
            models.UniqueConstraint(
                fields=["facility", "service", "weekday"],
                nulls_distinct=False,
                name="facilities_hours_uniq",
            ),
            models.CheckConstraint(condition=Q(weekday__lte=6), name="facilities_hours_weekday"),
            models.CheckConstraint(
                condition=Q(opens_at__lt=F("closes_at")), name="facilities_hours_order"
            ),
            models.CheckConstraint(
                condition=Q(break_starts_at__isnull=True, break_ends_at__isnull=True)
                | Q(
                    break_starts_at__gt=F("opens_at"),
                    break_ends_at__lt=F("closes_at"),
                    break_starts_at__lt=F("break_ends_at"),
                ),
                name="facilities_hours_break",
            ),
        ]


class CalendarEventKind(models.TextChoices):
    CLOSURE = "closure", "Closure"
    HOLIDAY_OVERRIDE = "holiday_override", "Open on a public holiday"
    SPECIAL_DAY = "special_day", "Special hours"


class CalendarEvent(FacilityOwned):
    kind = models.CharField(max_length=20, choices=CalendarEventKind.choices)
    service = models.ForeignKey(Service, on_delete=models.CASCADE, null=True, blank=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    is_open = models.BooleanField(default=False)
    opens_at = models.TimeField(null=True, blank=True)
    closes_at = models.TimeField(null=True, blank=True)
    reason = models.CharField(max_length=200, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "facilities_calendar_event"
        indexes: ClassVar[list[Any]] = [
            models.Index(fields=["facility", "starts_at"], name="facilities_cal_start_idx")
        ]
        constraints: ClassVar[list[Any]] = [
            models.CheckConstraint(
                condition=Q(starts_at__lt=F("ends_at")), name="facilities_cal_order"
            )
        ]


class Umuganda(models.TextChoices):
    CLOSED = "closed", "Closed in the morning"
    OPEN_AFTER = "open_after", "Opens at 11:30"
    OPEN = "open", "Open as usual"


class Settings(models.Model):
    facility = models.OneToOneField(
        "tenancy.Facility", on_delete=models.PROTECT, primary_key=True, related_name="+"
    )
    version = models.PositiveIntegerField(default=1)
    queue = models.JSONField(default=dict, blank=True)
    booking = models.JSONField(default=dict, blank=True)
    billing = models.JSONField(default=dict, blank=True)
    documents = models.JSONField(default=dict, blank=True)
    notifications = models.JSONField(default=dict, blank=True)
    umuganda = models.CharField(max_length=12, choices=Umuganda.choices, default=Umuganda.CLOSED)
    schema_version = models.PositiveSmallIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "facilities_settings"

    def __str__(self) -> str:
        return f"{self._meta.db_table} {self.pk}"


class Branding(models.Model):
    facility = models.OneToOneField(
        "tenancy.Facility", on_delete=models.PROTECT, primary_key=True, related_name="+"
    )
    version = models.PositiveIntegerField(default=1)
    letterhead_file_id = models.UUIDField(null=True, blank=True)
    logo_file_id = models.UUIDField(null=True, blank=True)
    stamp_file_id = models.UUIDField(null=True, blank=True)
    footer_text = models.CharField(max_length=300, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "facilities_branding"

    def __str__(self) -> str:
        return f"{self._meta.db_table} {self.pk}"


class ConfigChange(UUIDModel):
    """Append-only change log: one row per changed field (contract §2.2). No personal data."""

    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    entity = models.CharField(max_length=60)
    entity_id = models.CharField(max_length=64)
    field = models.CharField(max_length=60)
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="+"
    )
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "facilities_config_change"
        indexes: ClassVar[list[Any]] = [
            models.Index(fields=["facility", "-changed_at"], name="facilities_change_idx")
        ]
