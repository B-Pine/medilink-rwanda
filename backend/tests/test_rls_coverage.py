"""Every table with a facility_id column has RLS enabled and forced with the
`facility_isolation` policy, unless RLS_EXCEPTIONS lists it with the document that allows it
(security 04 §4, database design §1)."""

from __future__ import annotations

import pytest
from django.db import connection

pytestmark = pytest.mark.django_db

RLS_EXCEPTIONS: dict[str, str] = {
    # Documented in the sprint contracts (RLS column "—" or a decision).
    "onboarding_application": "sprint-01 §2.2: exists before the tenant does",
    "onboarding_facility_licence": "sprint-01 §2.8 S1-D3: platform verification data",
    "patients_consentrecord": "sprint-03 §2.1, §2.3: platform table, policy-layer scoped",
    "patients_record_claim": "sprint-03 §2.1: account-scoped claim flow",
    "patients_merge": "sprint-03 §2.3: cross-facility requests listed by the platform",
    "scheduling_travel_time": "sprint-04 §2.1: patient setting, account scope",
    "facilities_public_listing": "sprint-05 §2.1: public read model, live facilities only",
    # Recorded in database design §1 "RLS exceptions" (M1 completion plan, decision D3).
    "core_outbox_event": "database design §1: system table, IDs only, no API reader",
    "onboarding_facility_feature_flag": "database design §1: platform-managed configuration",
    "onboarding_facility_status_event": "database design §1: platform status history",
    # Database design §758 wants SELECT RLS; added before the S10 audit viewer (decision D2).
    "audit_auditentry": "database design §1: pending D2, no facility-scoped reader yet",
}


def _facility_tables() -> list[tuple[str, bool, bool, bool]]:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
                   EXISTS (SELECT 1 FROM pg_policy p
                           WHERE p.polrelid = c.oid AND p.polname = 'facility_isolation')
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_attribute a ON a.attrelid = c.oid
                 AND a.attname = 'facility_id' AND NOT a.attisdropped
            WHERE n.nspname = 'public' AND c.relkind = 'r'
            ORDER BY c.relname
            """
        )
        return cursor.fetchall()


def test_every_facility_table_has_forced_rls() -> None:
    missing = [
        name
        for name, enabled, forced, policy in _facility_tables()
        if name not in RLS_EXCEPTIONS and not (enabled and forced and policy)
    ]
    assert missing == [], f"facility tables without forced RLS: {missing}"


def test_every_exception_is_still_needed() -> None:
    protected = {name: enabled and forced for name, enabled, forced, _ in _facility_tables()}
    stale = [name for name in RLS_EXCEPTIONS if protected.get(name, True)]
    assert stale == [], f"remove from RLS_EXCEPTIONS (table gone or now protected): {stale}"
