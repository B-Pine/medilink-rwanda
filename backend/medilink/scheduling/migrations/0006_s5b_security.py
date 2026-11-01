"""S5b row security (contract sprint-05 §2.1, §3.4): forced facility RLS on disruptions, their items
and follow-ups; the calendar feed has no facility, so it gets forced RLS by account instead (D-11).
SECURITY DEFINER lookups for the public feed (token hash -> account, then the account's and
dependants' confirmed bookings) and for the auto-accept job, returning only IDs."""

from django.db import migrations

from medilink.facilities.db import owner_read_policy
from medilink.tenancy.rls import USER_CONTEXT_SQL, CreatePolicy, EnableFacilityRLS

FEED_RLS = """
ALTER TABLE scheduling_calendar_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_calendar_feed FORCE ROW LEVEL SECURITY;
"""
FEED_RLS_REVERSE = """
ALTER TABLE scheduling_calendar_feed NO FORCE ROW LEVEL SECURITY;
ALTER TABLE scheduling_calendar_feed DISABLE ROW LEVEL SECURITY;
"""

FUNCTIONS = """
CREATE OR REPLACE FUNCTION scheduling_find_feed(p_hash bytea)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT f.account_id FROM scheduling_calendar_feed f
  WHERE f.token_hash = p_hash AND f.revoked_at IS NULL
$$;
REVOKE ALL ON FUNCTION scheduling_find_feed(bytea) FROM PUBLIC;

-- Confirmed upcoming bookings of the account's own and guarded profiles (never a delegate's)
CREATE OR REPLACE FUNCTION scheduling_feed_bookings(p_account uuid)
RETURNS TABLE (booking_id uuid, facility_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT b.id, b.facility_id FROM scheduling_booking b
  WHERE b.patient_id IN (SELECT patient_id FROM visits_account_patients(p_account))
    AND b.status = 'confirmed' AND b.starts_at > now() - interval '1 day'
  ORDER BY b.starts_at
  LIMIT 200
$$;
REVOKE ALL ON FUNCTION scheduling_feed_bookings(uuid) FROM PUBLIC;

-- Facilities with unanswered disruption offers (the auto-accept job has no context yet)
CREATE OR REPLACE FUNCTION scheduling_disruption_facilities()
RETURNS TABLE (facility_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT d.facility_id FROM scheduling_disruption d WHERE d.status = 'open'
$$;
REVOKE ALL ON FUNCTION scheduling_disruption_facilities() FROM PUBLIC;
"""

REVERSE = """
DROP FUNCTION IF EXISTS scheduling_disruption_facilities();
DROP FUNCTION IF EXISTS scheduling_feed_bookings(uuid);
DROP FUNCTION IF EXISTS scheduling_find_feed(bytea);
"""


class Migration(migrations.Migration):
    dependencies = [
        ("scheduling", "0005_s5b"),
        ("visits", "0002_security"),
    ]

    operations = [
        EnableFacilityRLS("disruption"),
        EnableFacilityRLS("disruptionitem"),
        EnableFacilityRLS("followup"),
        migrations.RunSQL(FEED_RLS, FEED_RLS_REVERSE),
        CreatePolicy(
            "calendarfeed",
            name="account_isolation",
            using=f"account_id = {USER_CONTEXT_SQL}",
            with_check=f"account_id = {USER_CONTEXT_SQL}",
        ),
        owner_read_policy("scheduling_calendar_feed", "scheduling_feed_owner_read"),
        owner_read_policy("scheduling_disruption", "scheduling_disruption_owner_read"),
        migrations.RunSQL(FUNCTIONS, REVERSE),
    ]
