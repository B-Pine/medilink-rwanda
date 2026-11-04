"""Organisations, facilities, roles, permissions and facility memberships."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.db import models

from medilink.core.models import TimeStampedModel, UUIDModel


class FacilityType(models.TextChoices):
    """Master data from analysis 03 §"Facility types"."""

    HEALTH_POST = "health_post", "Health post"
    HEALTH_CENTER = "health_center", "Health center"
    DISTRICT_HOSPITAL = "district_hospital", "District hospital"
    PROVINCIAL_HOSPITAL = "provincial_hospital", "Provincial hospital"
    REFERRAL_HOSPITAL = "referral_hospital", "Referral / teaching hospital"
    PRIVATE_CLINIC = "private_clinic", "Private clinic"
    POLYCLINIC = "polyclinic", "Polyclinic"
    PRIVATE_HOSPITAL = "private_hospital", "Private hospital"
    DENTAL_CLINIC = "dental_clinic", "Dental clinic"
    EYE_CLINIC = "eye_clinic", "Eye clinic"
    DIAGNOSTIC_CENTER = "diagnostic_center", "Diagnostic center"


class Ownership(models.TextChoices):
    PUBLIC = "public", "Public"
    PRIVATE = "private", "Private"
    FAITH_BASED = "faith_based", "Faith-based"
    NGO = "ngo", "NGO"


class FacilityStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    SUBMITTED = "submitted", "Submitted"
    UNDER_REVIEW = "under_review", "Under review"
    CHANGES_REQUESTED = "changes_requested", "Changes requested"
    APPROVED = "approved", "Approved"
    SETUP = "setup", "Setup"
    LIVE = "live", "Live"
    SUSPENDED = "suspended", "Suspended"
    DEACTIVATED = "deactivated", "Deactivated"
    REJECTED = "rejected", "Rejected"


class RoleCode(models.TextChoices):
    FACILITY_ADMIN = "facility_admin", "Facility admin"
    RECEPTIONIST = "receptionist", "Receptionist"
    DOCTOR = "doctor", "Doctor / clinician"
    PHARMACIST = "pharmacist", "Pharmacist"
    CASHIER = "cashier", "Cashier"
    TRIAGE_NURSE = "triage_nurse", "Triage nurse"


class EmploymentType(models.TextChoices):
    FULL_TIME = "full_time", "Full time"
    PART_TIME = "part_time", "Part time"
    VISITING = "visiting", "Visiting"
    LOCUM = "locum", "Locum"


class Organization(TimeStampedModel):
    name = models.CharField(max_length=200)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Facility(TimeStampedModel):
    organization = models.ForeignKey(
        Organization, on_delete=models.PROTECT, related_name="facilities"
    )
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=120, unique=True)
    facility_type = models.CharField(max_length=32, choices=FacilityType.choices)
    ownership = models.CharField(max_length=16, choices=Ownership.choices)
    status = models.CharField(
        max_length=24, choices=FacilityStatus.choices, default=FacilityStatus.DRAFT
    )
    # Government identifiers (C0), platform-managed: the Ministry of Health facility code (the
    # national master facility list's FOSA ID) and the RRA tax number. Blank until known.
    moh_facility_code = models.CharField(max_length=20, blank=True)
    tin = models.CharField(max_length=9, blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "facilities"

    def __str__(self) -> str:
        return self.name


class Permission(UUIDModel):
    """A capability code from the permission matrix (analysis 02 §3), e.g. `queue.operate`."""

    code = models.CharField(max_length=64, unique=True)
    description = models.CharField(max_length=255)

    class Meta:
        ordering = ["code"]

    def __str__(self) -> str:
        return self.code


class Role(UUIDModel):
    """A facility role = a set of permissions. Super admin is User.is_platform_admin, not a role."""

    code = models.CharField(max_length=32, unique=True, choices=RoleCode.choices)
    name = models.CharField(max_length=100)
    permissions = models.ManyToManyField(Permission, related_name="roles", blank=True)

    class Meta:
        ordering = ["code"]

    def __str__(self) -> str:
        return self.code


class FacilityScopedQuerySet(models.QuerySet):
    """Every facility-owned queryset starts here (security 04 §2 "scoped querysets")."""

    def for_facility(self, facility_id: UUID | str | None) -> FacilityScopedQuerySet:
        if facility_id is None:
            return self.none()
        return self.filter(facility_id=facility_id)


class FacilityMembershipQuerySet(FacilityScopedQuerySet):
    def for_user(self, user: Any) -> FacilityMembershipQuerySet:
        return self.filter(user=user)

    def active(self) -> FacilityMembershipQuerySet:
        return self.filter(is_active=True)


class FacilityMembership(TimeStampedModel):
    """A user's membership of one facility, with roles. Protected by RLS (facility isolation +
    read access to the signed-in user's own memberships)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="memberships"
    )
    facility = models.ForeignKey(Facility, on_delete=models.PROTECT, related_name="memberships")
    roles = models.ManyToManyField(
        Role, related_name="memberships", blank=True, through="MembershipRole"
    )
    is_active = models.BooleanField(default=True)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    # S2: licence attestation (FR-ACC-07) and deactivation details (FR-ACC-06)
    licence_attested_at = models.DateTimeField(null=True, blank=True)
    licence_attested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    deactivated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    deactivation_reason = models.CharField(max_length=300, blank=True)
    # 2026-11-03: why the facility admin did not attest the licence (shown to the clinician)
    licence_refused_reason = models.CharField(max_length=300, blank=True)
    licence_refused_at = models.DateTimeField(null=True, blank=True)
    # where and how the person works here: a facilities.Department id (no cross-app FK: tenancy
    # comes before facilities) and the employment type
    department_id = models.UUIDField(null=True, blank=True)
    employment_type = models.CharField(max_length=12, choices=EmploymentType.choices, blank=True)
    version = models.PositiveIntegerField(default=1)

    objects = FacilityMembershipQuerySet.as_manager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "facility"], name="tenancy_membership_user_facility_unique"
            )
        ]

    def __str__(self) -> str:
        return f"membership {self.pk}"


class MembershipRoleQuerySet(models.QuerySet):
    def bulk_create(self, objs: Any, *args: Any, **kwargs: Any) -> list[Any]:
        """`membership.roles.set()/add()` build rows without `facility_id`: copy the membership's
        (visible only in its facility context, so RLS still decides)."""
        objs = list(objs)
        missing = {o.facilitymembership_id for o in objs if o.facility_id is None}
        if missing:
            facilities = dict(
                FacilityMembership.objects.filter(pk__in=missing).values_list("pk", "facility_id")
            )
            for o in objs:
                if o.facility_id is None:
                    o.facility_id = facilities.get(o.facilitymembership_id)
        return super().bulk_create(objs, *args, **kwargs)


class MembershipRole(models.Model):
    """The membership-role join, with its own `facility_id` so forced RLS covers it (security 04
    §4): `facility_isolation`, plus reading the roles of your own memberships (as memberships)."""

    id = models.BigAutoField(primary_key=True)
    facilitymembership = models.ForeignKey(FacilityMembership, on_delete=models.CASCADE)
    role = models.ForeignKey(Role, on_delete=models.CASCADE)
    facility = models.ForeignKey(Facility, on_delete=models.PROTECT, related_name="+")

    objects = MembershipRoleQuerySet.as_manager()

    class Meta:
        db_table = "tenancy_facilitymembership_roles"
        unique_together = [("facilitymembership", "role")]

    def __str__(self) -> str:
        return f"membership role {self.pk}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if self.facility_id is None:
            self.facility_id = self.facilitymembership.facility_id
        super().save(*args, **kwargs)


class FacilityNote(TimeStampedModel):
    """Small facility-owned table used to prove RLS isolation end to end (Sprint 0 demo).
    Contains no personal data."""

    facility = models.ForeignKey(Facility, on_delete=models.PROTECT, related_name="notes")
    title = models.CharField(max_length=200)

    objects = FacilityScopedQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title


class MembershipServicePoint(TimeStampedModel):
    """S2: service points a member works at (RLS through the facility)."""

    facility = models.ForeignKey(Facility, on_delete=models.PROTECT, related_name="+")
    membership = models.ForeignKey(
        FacilityMembership, on_delete=models.CASCADE, related_name="service_points"
    )
    service_point = models.ForeignKey(
        "facilities.ServicePoint", on_delete=models.CASCADE, related_name="+"
    )

    class Meta:
        db_table = "tenancy_membership_service_point"
        constraints = [
            models.UniqueConstraint(
                fields=["membership", "service_point"], name="tenancy_msp_unique"
            )
        ]


class InvitationSource(models.TextChoices):
    STAFF = "staff", "Invited by staff"
    APPLICATION_APPROVAL = "application_approval", "Facility approval"


class Invitation(TimeStampedModel):
    """S2: staff invitation (FR-ACC-05). The token is stored as a SHA-256 hash and looked up
    before login through `tenancy_find_invitation()`."""

    facility = models.ForeignKey(Facility, on_delete=models.PROTECT, related_name="+")
    email = models.EmailField()
    # What the inviter knows about the person (the facility application's proposed admin, or the
    # invite form): prefills the new account. The person can change the name when accepting.
    full_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    preferred_language = models.CharField(max_length=2, blank=True)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="+"
    )
    role_codes = ArrayField(models.CharField(max_length=32))
    service_point_ids = ArrayField(models.UUIDField(), default=list, blank=True)
    token_hash = models.BinaryField(unique=True)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    accepted_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    revoked_at = models.DateTimeField(null=True, blank=True)
    # Closed by the daily job or by a re-invite once `expires_at` passed (not a revocation).
    expired_at = models.DateTimeField(null=True, blank=True)
    idempotency_key = models.UUIDField(null=True, blank=True)
    source = models.CharField(
        max_length=24, choices=InvitationSource.choices, default=InvitationSource.STAFF
    )
    source_ref = models.CharField(max_length=64, blank=True)

    class Meta:
        db_table = "tenancy_invitation"
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "email"],
                condition=models.Q(
                    accepted_at__isnull=True, revoked_at__isnull=True, expired_at__isnull=True
                ),
                name="tenancy_invitation_pending_unique",
            ),
            models.UniqueConstraint(
                fields=["facility", "idempotency_key"],
                condition=models.Q(idempotency_key__isnull=False),
                name="tenancy_invitation_idempotency_unique",
            ),
        ]
