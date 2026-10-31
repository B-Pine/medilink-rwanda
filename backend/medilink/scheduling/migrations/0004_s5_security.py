"""Forced RLS on slots, holds, bookings and strikes; append-only booking history; SECURITY DEFINER
counts across facilities that return only numbers or IDs (contract sprint-05 §3.4, D-1)."""

from django.db import migrations

from medilink.facilities.db import append_only, owner_read_policy
from medilink.tenancy.rls import EnableFacilityRLS

FUNCTIONS = """
CREATE OR REPLACE FUNCTION scheduling_active_booking_count(p_patient uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(*)::integer FROM scheduling_booking b
  WHERE b.patient_id = p_patient AND b.status = 'confirmed' AND b.starts_at > now()
$$;
REVOKE ALL ON FUNCTION scheduling_active_booking_count(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION scheduling_strike_count(p_patient uuid, p_since timestamptz)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(*)::integer FROM scheduling_no_show_strike s
  WHERE s.patient_id = p_patient AND s.reversed_at IS NULL AND s.occurred_at >= p_since
$$;
REVOKE ALL ON FUNCTION scheduling_strike_count(uuid, timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION scheduling_patient_bookings(p_account uuid, p_upcoming boolean)
RETURNS TABLE (booking_id uuid, facility_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT b.id, b.facility_id FROM scheduling_booking b
  WHERE b.patient_id IN (
      SELECT l.patient_id FROM patients_patientlink l
      WHERE l.account_id = p_account AND l.revoked_at IS NULL
    )
    AND (
      (p_upcoming AND b.status = 'confirmed' AND b.starts_at > now() - interval '2 hours')
      OR (NOT p_upcoming AND NOT (b.status = 'confirmed' AND b.starts_at > now() - interval '2 hours'))
    )
  ORDER BY b.starts_at
$$;
REVOKE ALL ON FUNCTION scheduling_patient_bookings(uuid, boolean) FROM PUBLIC;

CREATE OR REPLACE FUNCTION scheduling_booking_facilities()
RETURNS TABLE (facility_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT b.facility_id FROM scheduling_booking b
  WHERE b.status = 'confirmed' AND b.starts_at < now()
  UNION
  SELECT DISTINCT h.facility_id FROM scheduling_slot_hold h WHERE h.released_at IS NULL
$$;
REVOKE ALL ON FUNCTION scheduling_booking_facilities() FROM PUBLIC;

-- Which facility a slot or hold belongs to (patient requests carry only the ID); live only
CREATE OR REPLACE FUNCTION scheduling_slot_facility(p_slot uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.facility_id FROM scheduling_slot s
  JOIN tenancy_facility f ON f.id = s.facility_id AND f.status = 'live'
  WHERE s.id = p_slot
$$;
REVOKE ALL ON FUNCTION scheduling_slot_facility(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION scheduling_hold_facility(p_hold uuid, p_account uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT h.facility_id FROM scheduling_slot_hold h
  WHERE h.id = p_hold AND h.account_id = p_account
$$;
REVOKE ALL ON FUNCTION scheduling_hold_facility(uuid, uuid) FROM PUBLIC;
"""

REVERSE = """
DROP FUNCTION IF EXISTS scheduling_hold_facility(uuid, uuid);
DROP FUNCTION IF EXISTS scheduling_slot_facility(uuid);
DROP FUNCTION IF EXISTS scheduling_booking_facilities();
DROP FUNCTION IF EXISTS scheduling_patient_bookings(uuid, boolean);
DROP FUNCTION IF EXISTS scheduling_strike_count(uuid, timestamptz);
DROP FUNCTION IF EXISTS scheduling_active_booking_count(uuid);
"""


class Migration(migrations.Migration):
    dependencies = [
        ("scheduling", "0003_s5"),
        ("patients", "0003_s3_security_and_data"),
    ]

    operations = [
        EnableFacilityRLS("slot"),
        EnableFacilityRLS("slothold"),
        EnableFacilityRLS("booking"),
        EnableFacilityRLS("bookingevent"),
        EnableFacilityRLS("noshowstrike"),
        append_only("scheduling_booking_event"),
        owner_read_policy("scheduling_booking", "scheduling_booking_owner_read"),
        owner_read_policy("scheduling_no_show_strike", "scheduling_strike_owner_read"),
        owner_read_policy("scheduling_slot_hold", "scheduling_hold_owner_read"),
        owner_read_policy("scheduling_slot", "scheduling_slot_owner_read"),
        migrations.RunSQL(FUNCTIONS, REVERSE),
    ]
