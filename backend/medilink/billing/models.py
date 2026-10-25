"""Facility prices and insurer rules (contract sprint-02 §2.1). S8 adds bills and payments."""

from __future__ import annotations

from typing import Any, ClassVar

from django.conf import settings
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import ArrayField, DateRangeField, RangeOperators
from django.db import models
from django.db.models import F, Func, Q

from medilink.core.models import TimeStampedModel


class DateRange(Func):
    """daterange(valid_from, valid_to, '[]'); an open end means "until further notice"."""

    function = "DATERANGE"
    output_field = DateRangeField()


def validity() -> DateRange:
    return DateRange(F("valid_from"), F("valid_to"), models.Value("[]"))


class TariffKind(models.TextChoices):
    SERVICE = "service", "Service"
    PROCEDURE = "procedure", "Procedure"
    MEDICINE = "medicine", "Medicine"
    OTHER = "other", "Other"


class TariffItem(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    version = models.PositiveIntegerField(default=1)
    code = models.CharField(max_length=40)
    name_i18n = models.JSONField()
    kind = models.CharField(max_length=10, choices=TariffKind.choices)
    service = models.ForeignKey(
        "facilities.Service", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    amount_rwf = models.PositiveIntegerField()
    valid_from = models.DateField()
    valid_to = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        db_table = "billing_tariff_item"
        constraints: ClassVar[list[Any]] = [
            ExclusionConstraint(
                name="billing_tariff_no_overlap",
                expressions=[
                    ("facility", RangeOperators.EQUAL),
                    ("code", RangeOperators.EQUAL),
                    (validity(), RangeOperators.OVERLAPS),
                ],
            ),
            models.CheckConstraint(
                condition=Q(valid_to__isnull=True) | Q(valid_to__gte=F("valid_from")),
                name="billing_tariff_dates",
            ),
        ]


class InsurerRule(TimeStampedModel):
    facility = models.ForeignKey("tenancy.Facility", on_delete=models.PROTECT, related_name="+")
    version = models.PositiveIntegerField(default=1)
    insurer_code = models.CharField(max_length=40)
    applies_to_all_services = models.BooleanField(default=True)
    service_ids = ArrayField(models.UUIDField(), default=list, blank=True)
    patient_share_bp = models.PositiveIntegerField(default=0)
    requires_referral = models.BooleanField(default=False)
    excluded_tariff_codes = ArrayField(models.CharField(max_length=40), default=list, blank=True)
    ceiling_per_visit_rwf = models.PositiveIntegerField(null=True, blank=True)
    valid_from = models.DateField()
    valid_to = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        db_table = "billing_insurer_rule"
        constraints: ClassVar[list[Any]] = [
            ExclusionConstraint(
                name="billing_insurer_rule_no_overlap",
                expressions=[
                    ("facility", RangeOperators.EQUAL),
                    ("insurer_code", RangeOperators.EQUAL),
                    (validity(), RangeOperators.OVERLAPS),
                ],
            ),
            models.CheckConstraint(
                condition=Q(patient_share_bp__lte=10000), name="billing_rule_share"
            ),
            models.CheckConstraint(
                condition=Q(valid_to__isnull=True) | Q(valid_to__gte=F("valid_from")),
                name="billing_rule_dates",
            ),
        ]
