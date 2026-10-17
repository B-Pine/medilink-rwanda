"""factory-boy factories. All data is synthetic."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

import factory
from django_otp.plugins.otp_totp.models import TOTPDevice

from medilink.accounts.models import Language, User
from medilink.patients.models import Patient, PatientLink, Relationship
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import (
    Facility,
    FacilityMembership,
    FacilityNote,
    FacilityStatus,
    FacilityType,
    Organization,
    Ownership,
    Role,
)

PASSWORD = "a long synthetic test passphrase"


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User

    email = factory.Sequence(lambda n: f"user{n}@example.test")
    full_name = factory.Sequence(lambda n: f"Test Person {n}")
    preferred_language = Language.RW

    @classmethod
    def _create(cls, model_class: type[User], *args: Any, **kwargs: Any) -> User:
        password = kwargs.pop("password", PASSWORD)
        return model_class.objects.create_user(*args, password=password, **kwargs)


class OrganizationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Organization

    name = factory.Sequence(lambda n: f"Demo Organisation {n}")


class FacilityFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Facility

    organization = factory.SubFactory(OrganizationFactory)
    name = factory.Sequence(lambda n: f"Demo Facility {n}")
    slug = factory.Sequence(lambda n: f"demo-facility-{n}")
    facility_type = FacilityType.PRIVATE_CLINIC
    ownership = Ownership.PRIVATE
    status = FacilityStatus.LIVE


def make_membership(
    user: User, facility: Facility, roles: Iterable[str] = ("receptionist",), is_active: bool = True
) -> FacilityMembership:
    """FacilityMembership is RLS-protected: create it inside that facility's context."""
    with rls_context(facility_id=facility.pk):
        membership = FacilityMembership.objects.create(
            user=user, facility=facility, is_active=is_active
        )
        membership.roles.set(Role.objects.filter(code__in=list(roles)))
    return membership


def make_note(facility: Facility, title: str = "Generator check") -> FacilityNote:
    with rls_context(facility_id=facility.pk):
        return FacilityNote.objects.create(facility=facility, title=title)


def make_totp_device(user: User) -> TOTPDevice:
    return TOTPDevice.objects.create(user=user, name="test", confirmed=True)


def make_staff(
    facility: Facility | None = None,
    roles: Iterable[str] = ("receptionist",),
    *,
    enrolled: bool = True,
    **user_kwargs: Any,
) -> User:
    user = UserFactory(**user_kwargs)
    if facility is not None:
        make_membership(user, facility, roles)
    if enrolled:
        make_totp_device(user)
    return user


def make_patient_user(**user_kwargs: Any) -> User:
    user = UserFactory(**user_kwargs)
    patient = Patient.objects.create(full_name=user.full_name)
    PatientLink.objects.create(account=user, patient=patient, relationship=Relationship.SELF)
    return user
