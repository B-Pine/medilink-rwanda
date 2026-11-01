"""Recipient specs (contract sprint-09 §3.1, §2.5).

A spec resolves to `Recipient(user_id, audience, variant, patient_id)` rows. `Recipients.patient`
reaches every account with an active link (self, guardian, delegate); for a dependent only when
that account has not switched its alerts off. Guardians get the `dependent` template variant.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any, Literal

from medilink.notifications.models import Audience, Preference, Variant


@dataclass(frozen=True)
class Recipient:
    user_id: Any
    audience: str | None  # None = decide from the event's audience
    variant: str = Variant.SELF
    patient_id: Any = None


@dataclass(frozen=True)
class RecipientSpec:
    kind: Literal["users", "patient", "facility_staff", "platform_admins", "explicit"]
    user_ids: tuple[Any, ...] = ()
    audience: str | None = None
    patient_id: Any = None
    facility_id: Any = None
    permission: str | None = None
    roles: tuple[str, ...] = ()
    explicit: tuple[Recipient, ...] = ()

    def resolve(self) -> list[Recipient]:
        return _RESOLVERS[self.kind](self)


class Recipients:
    @staticmethod
    def users(*user_ids: Any, audience: Literal["patient", "staff"] | None = None) -> RecipientSpec:
        return RecipientSpec(kind="users", user_ids=tuple(user_ids), audience=audience)

    @staticmethod
    def patient(patient_id: Any) -> RecipientSpec:
        return RecipientSpec(kind="patient", patient_id=patient_id)

    @staticmethod
    def facility_staff(
        facility_id: Any, *, permission: str | None = None, roles: Iterable[str] = ()
    ) -> RecipientSpec:
        return RecipientSpec(
            kind="facility_staff",
            facility_id=facility_id,
            permission=permission,
            roles=tuple(roles),
        )

    @staticmethod
    def platform_admins() -> RecipientSpec:
        return RecipientSpec(kind="platform_admins")

    @staticmethod
    def explicit(*recipients: Recipient) -> RecipientSpec:
        """Already-resolved recipients (fan-out batches grouped by language)."""
        return RecipientSpec(kind="explicit", explicit=tuple(recipients))


def _users(spec: RecipientSpec) -> list[Recipient]:
    return [Recipient(user_id=u, audience=spec.audience) for u in spec.user_ids]


def _patient(spec: RecipientSpec) -> list[Recipient]:
    from medilink.patients.models import PatientLink, Relationship

    links = (
        PatientLink.objects.filter(
            patient_id=spec.patient_id, revoked_at__isnull=True, account__is_active=True
        )
        .values_list("account_id", "relationship")
        .order_by("created_at")
    )
    muted = set(
        Preference.objects.filter(
            audience=Audience.PATIENT, patient_id=spec.patient_id, receive_alerts=False
        ).values_list("user_id", flat=True)
    )
    seen: set[Any] = set()
    out: list[Recipient] = []
    for account_id, relationship in links:
        if account_id in seen:
            continue
        seen.add(account_id)
        is_self = relationship == Relationship.SELF
        if not is_self and account_id in muted:
            continue
        out.append(
            Recipient(
                user_id=account_id,
                audience=Audience.PATIENT,
                variant=Variant.SELF if is_self else Variant.DEPENDENT,
                patient_id=spec.patient_id,
            )
        )
    return out


def _facility_staff(spec: RecipientSpec) -> list[Recipient]:
    from medilink.tenancy.context import rls_context
    from medilink.tenancy.models import FacilityMembership
    from medilink.tenancy.services import membership_permissions

    out: list[Recipient] = []
    with rls_context(facility_id=spec.facility_id):
        memberships = (
            FacilityMembership.objects.filter(
                facility_id=spec.facility_id, is_active=True, user__is_active=True
            )
            .prefetch_related("roles__permissions")
            .order_by("created_at")
        )
        for m in memberships:
            role_codes = {r.code for r in m.roles.all()}
            if spec.roles and not role_codes & set(spec.roles):
                continue
            if spec.permission and spec.permission not in membership_permissions(m):
                continue
            out.append(Recipient(user_id=m.user_id, audience=Audience.STAFF))
    return out


def _platform_admins(spec: RecipientSpec) -> list[Recipient]:
    from medilink.accounts.models import User

    return [
        Recipient(user_id=pk, audience=Audience.STAFF)
        for pk in User.objects.filter(is_platform_admin=True, is_active=True).values_list(
            "pk", flat=True
        )
    ]


def _explicit(spec: RecipientSpec) -> list[Recipient]:
    return list(spec.explicit)


_RESOLVERS = {
    "explicit": _explicit,
    "users": _users,
    "patient": _patient,
    "facility_staff": _facility_staff,
    "platform_admins": _platform_admins,
}
