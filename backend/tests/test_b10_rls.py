"""B10: PostgreSQL RLS. As the app role: no context -> zero rows; context A never sees B;
WITH CHECK blocks cross-facility writes. Plus the context helper and the request middleware."""

from __future__ import annotations

from typing import Any
from unittest import mock

import pytest
from django.conf import settings
from django.db import DatabaseError, connection, transaction
from rest_framework.test import APIClient

from medilink.tenancy.context import (
    TenantContextError,
    get_db_context,
    rls_context,
    set_db_context,
    set_user_context,
)
from medilink.tenancy.models import FacilityMembership, FacilityNote
from tests.conftest import login_staff
from tests.factories import FacilityFactory, UserFactory, make_membership, make_note, make_staff

pytestmark = [pytest.mark.acceptance("B10"), pytest.mark.django_db]


@pytest.fixture
def two_facilities(facility: Any, other_facility: Any) -> tuple[Any, Any]:
    make_note(facility, "A note")
    make_note(other_facility, "B note")
    make_membership(UserFactory(), facility)
    make_membership(UserFactory(), other_facility)
    set_db_context()  # start every test without context
    return facility, other_facility


def _scalar(sql: str, params: list[Any] | None = None) -> Any:
    with connection.cursor() as cursor:
        cursor.execute(sql, params or [])
        return cursor.fetchone()[0]


def test_b10_tests_run_as_restricted_app_role() -> None:
    assert _scalar("SELECT current_user") == settings.DATABASE_APP_ROLE
    assert _scalar("SELECT rolsuper FROM pg_roles WHERE rolname = current_user") is False
    assert _scalar("SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user") is False
    owner = _scalar(
        "SELECT tableowner FROM pg_tables WHERE tablename = 'tenancy_facilitymembership'"
    )
    assert owner != settings.DATABASE_APP_ROLE


def test_b10_rls_is_enabled_and_forced() -> None:
    for table in ("tenancy_facilitymembership", "tenancy_facilitynote"):
        enabled, forced = 0, 0
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = %s",
                [table],
            )
            enabled, forced = cursor.fetchone()
        assert enabled and forced, table
    expr = _scalar(
        "SELECT pg_get_expr(polwithcheck, polrelid) FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid "
        "WHERE c.relname = 'tenancy_facilitynote' AND polname = 'facility_isolation'"
    )
    assert "NULLIF(current_setting('app.facility_id'::text, true), ''::text)" in expr


def test_b10_no_context_returns_zero_rows(two_facilities: Any) -> None:
    assert FacilityNote.objects.count() == 0
    assert FacilityMembership.objects.count() == 0
    assert _scalar("SELECT count(*) FROM tenancy_facilitynote") == 0


def test_b10_context_a_never_sees_b(two_facilities: Any) -> None:
    facility_a, facility_b = two_facilities
    with rls_context(facility_id=facility_a.pk):
        assert set(FacilityNote.objects.values_list("facility_id", flat=True)) == {facility_a.pk}
        assert set(FacilityMembership.objects.values_list("facility_id", flat=True)) == {
            facility_a.pk
        }
        assert (
            _scalar(
                "SELECT count(*) FROM tenancy_facilitynote WHERE facility_id = %s", [facility_b.pk]
            )
            == 0
        )
    with rls_context(facility_id=facility_b.pk):
        assert set(FacilityNote.objects.values_list("title", flat=True)) == {"B note"}


def test_b10_with_check_blocks_cross_facility_insert(two_facilities: Any) -> None:
    facility_a, facility_b = two_facilities
    with rls_context(facility_id=facility_a.pk):
        with pytest.raises(DatabaseError, match="row-level security"), transaction.atomic():
            FacilityNote.objects.create(facility=facility_b, title="smuggled")
        intruder = UserFactory()
        with pytest.raises(DatabaseError, match="row-level security"), transaction.atomic():
            FacilityMembership.objects.create(user=intruder, facility=facility_b)


def test_b10_with_check_blocks_moving_a_row_to_another_facility(two_facilities: Any) -> None:
    facility_a, facility_b = two_facilities
    with rls_context(facility_id=facility_a.pk):
        note = FacilityNote.objects.get()
        with pytest.raises(DatabaseError, match="row-level security"), transaction.atomic():
            FacilityNote.objects.filter(pk=note.pk).update(facility=facility_b)


def test_b10_no_context_blocks_inserts(two_facilities: Any) -> None:
    facility_a, _ = two_facilities
    with pytest.raises(DatabaseError, match="row-level security"), transaction.atomic():
        FacilityNote.objects.create(facility=facility_a, title="no context")


def test_b10_user_can_read_only_own_memberships_without_facility_context(
    two_facilities: Any,
) -> None:
    facility_a, facility_b = two_facilities
    user = UserFactory()
    make_membership(user, facility_a)
    make_membership(user, facility_b)
    with rls_context(user_id=user.pk):
        rows = list(FacilityMembership.objects.values_list("user_id", flat=True))
    assert rows == [user.pk, user.pk]
    with rls_context(user_id=user.pk), pytest.raises(DatabaseError), transaction.atomic():
        FacilityMembership.objects.create(user=user, facility=FacilityFactory())  # read-only policy


def test_b10_context_must_be_set_inside_a_transaction() -> None:
    # pytest-django wraps each test in a transaction; pretend we're outside one.
    with mock.patch.object(connection, "in_atomic_block", False), pytest.raises(TenantContextError):
        set_db_context(facility_id=None)


def test_b10_rls_context_restores_previous_values(facility: Any, other_facility: Any) -> None:
    set_db_context(facility_id=facility.pk, user_id=None)
    with rls_context(facility_id=other_facility.pk):
        assert get_db_context().facility_id == str(other_facility.pk)
    assert get_db_context().facility_id == str(facility.pk)
    set_user_context("01a14a5e-0000-7000-8000-000000000001")
    assert get_db_context().facility_id == str(facility.pk)
    assert get_db_context().user_id == "01a14a5e-0000-7000-8000-000000000001"


@pytest.mark.urls("tests.demo_views")
def test_b10_request_context_isolates_facilities_end_to_end(
    api: APIClient, two_facilities: Any
) -> None:
    facility_a, _ = two_facilities
    user = make_staff(facility_a, roles=("receptionist",))
    login_staff(api, user)
    scoped = api.get("/api/v1/staff/demo/notes/").json()
    assert [n["title"] for n in scoped] == ["A note"]
    # Even a view that forgets to scope its queryset only gets the active facility's rows.
    assert api.get("/api/v1/staff/demo/notes-unscoped/").json() == [str(facility_a.pk)]


@pytest.mark.urls("tests.demo_views")
def test_b10_staff_without_active_facility_sees_nothing(
    api: APIClient, two_facilities: Any
) -> None:
    facility_a, facility_b = two_facilities
    user = make_staff(facility_a, roles=("doctor",))
    make_membership(user, facility_b, roles=("doctor",))
    login_staff(api, user)  # two memberships: no facility selected yet
    assert api.get("/api/v1/staff/demo/notes/").json() == []
    assert api.get("/api/v1/staff/demo/notes-unscoped/").json() == []
