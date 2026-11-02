"""S10 part 2b (contract sprint-10c §2): platform report figures across facilities. A SECURITY
DEFINER function returns one aggregate row per facility (counts only, no patient rows)."""

from django.db import migrations

FUNCTIONS = """
CREATE OR REPLACE FUNCTION reports_platform_figures(p_from date, p_to date)
RETURNS TABLE (
  facility_id uuid, name text, status text, facility_type text,
  visits bigint, bookings bigint, disputes bigint, escalated bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT f.id, f.name::text, f.status::text, f.facility_type::text,
    (SELECT count(*) FROM visits_visit v
      WHERE v.facility_id = f.id AND v.service_date BETWEEN p_from AND p_to),
    (SELECT count(*) FROM scheduling_booking b
      WHERE b.facility_id = f.id AND b.service_date BETWEEN p_from AND p_to
        AND b.status <> 'superseded'),
    (SELECT count(*) FROM disputes_dispute d
      WHERE d.facility_id = f.id AND d.created_at::date BETWEEN p_from AND p_to),
    (SELECT count(*) FROM disputes_dispute d
      WHERE d.facility_id = f.id AND d.created_at::date BETWEEN p_from AND p_to
        AND d.escalated_at IS NOT NULL)
  FROM tenancy_facility f
  WHERE f.status IN ('setup', 'live', 'suspended')
  ORDER BY f.name
$$;
REVOKE ALL ON FUNCTION reports_platform_figures(date, date) FROM PUBLIC;
"""

FUNCTIONS_REVERSE = "DROP FUNCTION IF EXISTS reports_platform_figures(date, date);"


class Migration(migrations.Migration):
    dependencies = [
        ("disputes", "0002_security"),
        ("scheduling", "0007_s5b_security"),
        ("visits", "0002_security"),
    ]

    operations = [migrations.RunSQL(FUNCTIONS, FUNCTIONS_REVERSE)]
