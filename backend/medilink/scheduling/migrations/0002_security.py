"""Forced RLS on schedules; `scheduling_busy_ranges()` returns the weekly time ranges a person
works at other facilities, never which facility (FR-ONB-06, contract §2.2)."""

from django.db import migrations

from medilink.facilities.db import owner_read_policy
from medilink.tenancy.rls import EnableFacilityRLS

BUSY = """
CREATE OR REPLACE FUNCTION scheduling_busy_ranges(p_user uuid, p_exclude_facility uuid)
RETURNS TABLE (weekday smallint, starts_at time, ends_at time)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT t.weekday::smallint, t.starts_at, t.ends_at
  FROM scheduling_schedule_template t
  JOIN tenancy_facilitymembership m ON m.id = t.membership_id
  WHERE m.user_id = p_user AND m.is_active AND t.facility_id <> p_exclude_facility
    AND t.ended_at IS NULL AND (t.valid_to IS NULL OR t.valid_to >= CURRENT_DATE)
$$;
REVOKE ALL ON FUNCTION scheduling_busy_ranges(uuid, uuid) FROM PUBLIC;
"""
BUSY_REVERSE = "DROP FUNCTION IF EXISTS scheduling_busy_ranges(uuid, uuid);"


class Migration(migrations.Migration):
    dependencies = [
        ("scheduling", "0001_initial"),
        ("tenancy", "0005_s2_security"),
    ]

    operations = [
        EnableFacilityRLS("scheduletemplate"),
        EnableFacilityRLS("scheduleexception"),
        owner_read_policy("scheduling_schedule_template", "scheduling_tpl_owner_read"),
        owner_read_policy("tenancy_facilitymembership", "tenancy_membership_owner_read"),
        migrations.RunSQL(BUSY, BUSY_REVERSE),
    ]
