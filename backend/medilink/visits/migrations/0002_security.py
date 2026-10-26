"""Forced RLS on queue tables; append-only histories; SECURITY DEFINER lookups for jobs without a
facility context, the patient tracker and display tokens (contract sprint-04 §2, §3)."""

from django.db import migrations

from medilink.facilities.db import append_only, owner_read_policy
from medilink.tenancy.rls import EnableFacilityRLS

FUNCTIONS = """
CREATE OR REPLACE FUNCTION visits_open_facilities()
RETURNS TABLE (facility_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT t.facility_id FROM visits_ticket t
  WHERE t.state IN ('waiting', 'called', 'in_service', 'no_response', 'on_hold')
$$;
REVOKE ALL ON FUNCTION visits_open_facilities() FROM PUBLIC;

CREATE OR REPLACE FUNCTION visits_account_patients(p_account uuid)
RETURNS TABLE (patient_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT l.patient_id FROM patients_patientlink l
  WHERE l.account_id = p_account AND l.revoked_at IS NULL
    AND l.relationship IN ('self', 'guardian')
$$;
REVOKE ALL ON FUNCTION visits_account_patients(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION visits_patient_active(p_account uuid)
RETURNS TABLE (visit_id uuid, facility_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT v.id, v.facility_id FROM visits_visit v
  WHERE v.patient_id IN (SELECT patient_id FROM visits_account_patients(p_account))
    AND v.status IN ('remote_pending', 'on_site')
    AND v.service_date = (now() AT TIME ZONE 'Africa/Kigali')::date
  ORDER BY v.checked_in_at
$$;
REVOKE ALL ON FUNCTION visits_patient_active(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION visits_find_display_link(p_hash bytea)
RETURNS TABLE (link_id uuid, facility_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT d.id, d.facility_id FROM facilities_display_link d
  WHERE d.token_hash = p_hash AND d.revoked_at IS NULL
$$;
REVOKE ALL ON FUNCTION visits_find_display_link(bytea) FROM PUBLIC;
"""

REVERSE = """
DROP FUNCTION IF EXISTS visits_find_display_link(bytea);
DROP FUNCTION IF EXISTS visits_patient_active(uuid);
DROP FUNCTION IF EXISTS visits_account_patients(uuid);
DROP FUNCTION IF EXISTS visits_open_facilities();
"""


class Migration(migrations.Migration):
    dependencies = [
        ("visits", "0001_initial"),
        ("patients", "0003_s3_security_and_data"),
    ]

    operations = [
        EnableFacilityRLS("visit"),
        EnableFacilityRLS("ticket"),
        EnableFacilityRLS("ticketevent"),
        EnableFacilityRLS("ticketcounter"),
        EnableFacilityRLS("dutystatus"),
        EnableFacilityRLS("dutystatusevent"),
        EnableFacilityRLS("reorderreview"),
        EnableFacilityRLS("displaylink"),
        append_only("visits_ticket_event"),
        append_only("visits_duty_status_event"),
        append_only("visits_reorder_review"),
        owner_read_policy("visits_ticket", "visits_ticket_owner_read"),
        owner_read_policy("visits_visit", "visits_visit_owner_read"),
        owner_read_policy("facilities_display_link", "visits_display_owner_read"),
        migrations.RunSQL(FUNCTIONS, REVERSE),
    ]
