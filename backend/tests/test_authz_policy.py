"""Policy layer and permission classes (security 04 §1-2)."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from rest_framework import exceptions

from medilink.accounts.principal import Principal, PrincipalState
from medilink.authz import permissions
from medilink.authz.policy import authorize, get_scoped_object_or_404, has_permission, scoped
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import FacilityMembership, FacilityNote
from tests.factories import UserFactory, make_membership, make_note

pytestmark = pytest.mark.django_db


def _principal(user: Any, membership: Any) -> Principal:
    return Principal(
        audience="staff", state=PrincipalState.AUTHENTICATED, user=user, membership=membership
    )


def _membership(user: Any, facility: Any, roles: tuple[str, ...]) -> Any:
    make_membership(user, facility, roles)
    with rls_context(facility_id=facility.pk):
        return FacilityMembership.objects.prefetch_related("roles__permissions").get(user=user)


def test_has_permission_and_authorize(facility: Any, other_facility: Any) -> None:
    user = UserFactory()
    principal = _principal(user, _membership(user, facility, ("pharmacist",)))
    assert principal.roles == ["pharmacist"]
    assert principal.actor_role == "pharmacist"
    assert has_permission(principal, "pharmacy.dispense")
    assert not has_permission(principal, "clinical.write")
    assert not has_permission(None, "pharmacy.dispense")
    authorize(principal, "pharmacy.dispense")
    with pytest.raises(exceptions.PermissionDenied):
        authorize(principal, "clinical.write")
    with pytest.raises(exceptions.NotAuthenticated):
        authorize(Principal.anonymous("staff"), "pharmacy.dispense")
    own = make_note(facility)
    foreign = make_note(other_facility)
    authorize(principal, "pharmacy.dispense", own)
    with pytest.raises(exceptions.NotFound):
        authorize(principal, "pharmacy.dispense", foreign)  # other facility: 404, not 403
    with pytest.raises(exceptions.NotFound):
        authorize(principal, "pharmacy.dispense", SimpleNamespace())


def test_scoped_queries(facility: Any, other_facility: Any) -> None:
    user = UserFactory()
    principal = _principal(user, _membership(user, facility, ("receptionist",)))
    note = make_note(facility)
    foreign = make_note(other_facility)
    with rls_context(facility_id=facility.pk):
        assert list(scoped(principal, FacilityNote.objects)) == [note]
        assert list(scoped(principal, FacilityNote.objects.all())) == [note]
        assert list(scoped(Principal.anonymous("staff"), FacilityNote.objects)) == []
        assert list(scoped(None, FacilityNote.objects)) == []
        assert get_scoped_object_or_404(principal, FacilityNote.objects, pk=note.pk) == note
        with pytest.raises(exceptions.NotFound):
            get_scoped_object_or_404(principal, FacilityNote.objects, pk=foreign.pk)
        with pytest.raises(exceptions.NotFound):
            get_scoped_object_or_404(principal, FacilityNote.objects, pk="garbage")
        assert list(FacilityNote.objects.for_facility(None)) == []


def test_actor_role_labels(facility: Any) -> None:
    admin = UserFactory(is_platform_admin=True)
    assert _principal(admin, None).actor_role == "platform_admin"
    assert (
        Principal(audience="patient", state=PrincipalState.AUTHENTICATED, user=admin).actor_role
        == "patient"
    )
    assert Principal.anonymous("staff").actor_role == "anonymous"
    plain = UserFactory()
    assert _principal(plain, None).actor_role == "staff"
    both = UserFactory(is_platform_admin=True)
    assert (
        _principal(both, _membership(both, facility, ("doctor",))).actor_role
        == "platform_admin,doctor"
    )


def _request(principal: Any, user: Any = None) -> Any:
    return SimpleNamespace(_request=SimpleNamespace(principal=principal), user=user)


def test_permission_classes() -> None:
    user = UserFactory()
    admin = UserFactory(is_platform_admin=True)
    staff = Principal(audience="staff", state=PrincipalState.AUTHENTICATED, user=user)
    staff_admin = Principal(audience="staff", state=PrincipalState.AUTHENTICATED, user=admin)
    assert permissions.IsStaffAuthenticated().has_permission(_request(staff, user), None)
    assert not permissions.IsPatientAuthenticated().has_permission(_request(staff, user), None)
    assert not permissions.IsPlatformAdmin().has_permission(_request(staff, user), None)
    assert permissions.IsPlatformAdmin().has_permission(_request(staff_admin, admin), None)
    assert not permissions.IsStaffAuthenticated().has_permission(_request(None), None)
    assert not permissions.HasFacilityPermission("queue.operate")().has_permission(
        _request(staff, user), None
    )
    assert not permissions.HasFacilityPermission("queue.operate")().has_permission(
        _request(None), None
    )
    assert (
        permissions.HasFacilityPermission("queue.operate").__name__
        == "HasFacilityPermission[queue.operate]"
    )
    pending = Principal(audience="staff", state=PrincipalState.MFA_REQUIRED, user=user)
    with pytest.raises(exceptions.NotAuthenticated):
        permissions.IsStaffAuthenticated().has_permission(_request(pending), None)
    assert permissions.IsStaffMfaVerifyPending().has_permission(_request(pending), None)
    with pytest.raises(exceptions.NotAuthenticated):
        permissions.IsStaffMfaSetupPending().has_permission(_request(pending), None)
    assert permissions.get_principal(SimpleNamespace(principal="not a principal")) is None
    assert not permissions.DenyAll().has_permission(_request(staff, user), None)
