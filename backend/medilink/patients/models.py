"""Patients (minimal in Sprint 0): the self patient created at sign-up, links, consents."""

from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models import Q

from medilink.core.models import TimeStampedModel, UUIDModel


class Sex(models.TextChoices):
    FEMALE = "female", "Female"
    MALE = "male", "Male"
    OTHER = "other", "Other"


class Relationship(models.TextChoices):
    SELF = "self", "Self"
    GUARDIAN = "guardian", "Guardian"
    DELEGATE = "delegate", "Delegate"


class ConsentKind(models.TextChoices):
    TERMS = "terms", "Terms of use"
    PRIVACY = "privacy", "Privacy notice"
    CARE = "care", "Care"
    RESEARCH = "research", "Research"


class ConsentChannel(models.TextChoices):
    WEB = "web", "Web"
    MOBILE = "mobile", "Mobile app"
    STAFF_ASSISTED = "staff_assisted", "Staff assisted"


class Patient(TimeStampedModel):
    """Platform-wide person. Not facility-owned (facility patient records come in Sprint 3)."""

    full_name = models.CharField(max_length=150)
    date_of_birth = models.DateField(null=True, blank=True)
    # null = unknown; the API returns an explicit null (architecture 02 §2)
    sex = models.CharField(max_length=8, choices=Sex.choices, null=True, blank=True)  # noqa: DJ001

    def __str__(self) -> str:
        return f"patient {self.pk}"


class PatientLinkQuerySet(models.QuerySet):
    def active(self) -> PatientLinkQuerySet:
        return self.filter(revoked_at__isnull=True)

    def for_account(self, user: object) -> PatientLinkQuerySet:
        return self.filter(account=user)


class PatientLink(TimeStampedModel):
    """An account's access to a patient profile: self, guardian of a minor, or delegate."""

    account = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="patient_links"
    )
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="links")
    relationship = models.CharField(max_length=16, choices=Relationship.choices)
    revoked_at = models.DateTimeField(null=True, blank=True)

    objects = PatientLinkQuerySet.as_manager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["account", "patient"],
                condition=Q(revoked_at__isnull=True),
                name="patients_link_active_unique",
            ),
            models.UniqueConstraint(
                fields=["account"],
                condition=Q(relationship="self", revoked_at__isnull=True),
                name="patients_link_one_self_per_account",
            ),
        ]

    def __str__(self) -> str:
        return f"patient link {self.pk}"


class ConsentRecord(UUIDModel):
    """Versioned consent decision (FR-SEC-04/05). Append-only by convention: a change of mind is a
    new record."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="consents"
    )
    kind = models.CharField(max_length=16, choices=ConsentKind.choices)
    version = models.CharField(max_length=32)
    granted = models.BooleanField()
    granted_at = models.DateTimeField()
    channel = models.CharField(max_length=16, choices=ConsentChannel.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-granted_at"]
        indexes = [
            models.Index(fields=["user", "kind", "-granted_at"], name="patients_consent_lookup")
        ]

    def __str__(self) -> str:
        return f"consent {self.kind} {self.pk}"
