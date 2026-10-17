"""The reusable RLS migration operations (security 04 §4): forwards, backwards, no-op elsewhere."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest import mock

import pytest
from django.apps import apps
from django.db import connection, transaction
from django.db.migrations.state import ProjectState

from medilink.tenancy.context import get_db_context, set_db_context
from medilink.tenancy.models import (
    Facility,
    FacilityMembership,
    FacilityNote,
    Organization,
    Permission,
    Role,
)
from medilink.tenancy.rls import (
    FACILITY_CONTEXT_SQL,
    CreatePolicy,
    EnableFacilityRLS,
    context_uuid_sql,
)
from tests.factories import UserFactory, make_membership, make_note

pytestmark = [pytest.mark.acceptance("B10"), pytest.mark.django_db]

TABLE = "tenancy_facilitynote"


def _rls_flags() -> tuple[bool, bool]:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = %s", [TABLE]
        )
        return cursor.fetchone()


def _policies() -> set[str]:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT polname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relname = %s",
            [TABLE],
        )
        return {row[0] for row in cursor.fetchall()}


def test_b10_enable_facility_rls_is_reversible() -> None:
    state = ProjectState.from_apps(apps)
    rls = EnableFacilityRLS("facilitynote")
    extra = CreatePolicy("facilitynote", name="demo_read_all", command="SELECT", using="true")
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("RESET ROLE")  # DDL needs the owner (rolled back with the test)
        with connection.schema_editor(atomic=True) as editor:
            rls.database_backwards("tenancy", editor, state, state)
        assert _rls_flags() == (False, False)
        assert "facility_isolation" not in _policies()
        with connection.schema_editor(atomic=True) as editor:
            rls.database_forwards("tenancy", editor, state, state)
            extra.database_forwards("tenancy", editor, state, state)
        assert _rls_flags() == (True, True)
        assert {"facility_isolation", "demo_read_all"} <= _policies()
        with connection.schema_editor(atomic=True) as editor:
            extra.database_backwards("tenancy", editor, state, state)
        assert "demo_read_all" not in _policies()
        cursor.execute("SET ROLE medilink_app")


def test_b10_operations_describe_themselves_and_skip_other_databases() -> None:
    state = ProjectState.from_apps(apps)
    rls = EnableFacilityRLS("facilitynote")
    policy = CreatePolicy("facilitynote", name="p", using="true", with_check="true")
    assert rls.describe() == "Enable facility row-level security on facilitynote"
    assert rls.migration_name_fragment == "rls_facilitynote"
    assert policy.describe() == "Create RLS policy p on facilitynote"
    assert policy.migration_name_fragment == "policy_facilitynote_p"
    assert rls.reversible and policy.reduces_to_sql
    rls.state_forwards("tenancy", state)  # database-only: no model state change
    other_db = SimpleNamespace(connection=SimpleNamespace(vendor="sqlite"))
    for operation in (rls, policy):
        operation.database_forwards("tenancy", other_db, state, state)
        operation.database_backwards("tenancy", other_db, state, state)
    with pytest.raises(ValueError, match="Invalid policy command"):
        CreatePolicy("facilitynote", name="p", using="true", command="MERGE")
    assert context_uuid_sql("app.x") == "NULLIF(current_setting('app.x', true), '')::uuid"
    assert "app.facility_id" in FACILITY_CONTEXT_SQL


def test_b10_context_helpers_are_noops_on_other_databases() -> None:
    fake = mock.Mock(vendor="sqlite")
    with mock.patch("medilink.tenancy.context._connection", return_value=fake):
        set_db_context(facility_id="x")
        assert get_db_context().facility_id == ""
    fake.cursor.assert_not_called()


def test_tenancy_models_have_safe_string_representations(facility: Any) -> None:
    membership = make_membership(UserFactory(), facility)
    note = make_note(facility, "Generator check")
    assert str(facility) == facility.name
    assert str(Organization(name="Org")) == "Org"
    assert str(Permission(code="queue.operate")) == "queue.operate"
    assert str(Role(code="doctor")) == "doctor"
    assert str(membership) == f"membership {membership.pk}"
    assert str(note) == "Generator check"
    assert isinstance(Facility.objects.first(), Facility)
    assert FacilityMembership.objects.for_facility(None).count() == 0
    assert FacilityNote.objects.for_facility(facility.pk).count() == 0  # no RLS context set here
