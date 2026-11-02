"""S10 part 2a security (contract sprint-10b §2): forced facility RLS on every table; events,
messages and evidence append-only; SECURITY DEFINER functions for what crosses facilities:

- disputes_subject_facility(type, id, patient): the facility of a subject that belongs to the
  patient (a patient raising a dispute does not know the facility context yet)
- disputes_patient_disputes(account): disputes of the account's profiles (self and guardian)
- disputes_platform_disputes(): escalated and platform-level disputes for platform admins
- disputes_open_facilities(): facilities with disputes still running, for the deadlines job
"""

from django.db import migrations

from medilink.facilities.db import append_only, owner_read_policy
from medilink.tenancy.rls import EnableFacilityRLS

FUNCTIONS = """
CREATE OR REPLACE FUNCTION disputes_subject_facility(p_type text, p_id uuid, p_patient uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE p_type
    WHEN 'visit' THEN (SELECT facility_id FROM visits_visit WHERE id = p_id AND patient_id = p_patient)
    WHEN 'ticket' THEN (SELECT t.facility_id FROM visits_ticket t JOIN visits_visit v ON v.id = t.visit_id
                        WHERE t.id = p_id AND v.patient_id = p_patient)
    WHEN 'booking' THEN (SELECT facility_id FROM scheduling_booking WHERE id = p_id AND patient_id = p_patient)
    WHEN 'no_show_strike' THEN (SELECT facility_id FROM scheduling_no_show_strike
                                WHERE id = p_id AND patient_id = p_patient)
    WHEN 'prescription' THEN (SELECT facility_id FROM pharmacy_prescription
                              WHERE id = p_id AND patient_id = p_patient AND status <> 'draft')
    WHEN 'bill' THEN (SELECT facility_id FROM billing_bill WHERE id = p_id AND patient_id = p_patient)
    WHEN 'document' THEN (SELECT facility_id FROM documents_document
                          WHERE id = p_id AND patient_id = p_patient AND released_at IS NOT NULL)
  END
$$;
REVOKE ALL ON FUNCTION disputes_subject_facility(text, uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION disputes_patient_disputes(p_account uuid)
RETURNS TABLE (dispute_id uuid, facility_id uuid, patient_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT d.id, d.facility_id, d.patient_id
  FROM disputes_dispute d
  JOIN patients_patientlink l ON l.patient_id = d.patient_id
  WHERE l.account_id = p_account AND l.revoked_at IS NULL
    AND l.relationship IN ('self', 'guardian')
  ORDER BY d.created_at DESC, d.id
$$;
REVOKE ALL ON FUNCTION disputes_patient_disputes(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION disputes_platform_disputes()
RETURNS TABLE (dispute_id uuid, facility_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT d.id, d.facility_id
  FROM disputes_dispute d
  WHERE d.handler_level = 'platform' OR d.status IN ('escalated', 'final_decision')
  ORDER BY d.created_at DESC, d.id
$$;
REVOKE ALL ON FUNCTION disputes_platform_disputes() FROM PUBLIC;

CREATE OR REPLACE FUNCTION disputes_open_facilities()
RETURNS TABLE (facility_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT d.facility_id FROM disputes_dispute d
  WHERE d.status IN ('open', 'acknowledged', 'under_review', 'info_requested', 'resolved',
                     'reopened')
$$;
REVOKE ALL ON FUNCTION disputes_open_facilities() FROM PUBLIC;
"""

FUNCTIONS_REVERSE = """
DROP FUNCTION IF EXISTS disputes_open_facilities();
DROP FUNCTION IF EXISTS disputes_platform_disputes();
DROP FUNCTION IF EXISTS disputes_patient_disputes(uuid);
DROP FUNCTION IF EXISTS disputes_subject_facility(text, uuid, uuid);
"""


class Migration(migrations.Migration):
    dependencies = [
        ("disputes", "0001_initial"),
        ("billing", "0005_s8_security"),
        ("documents", "0004_s7b_security"),
        ("pharmacy", "0002_security"),
        ("visits", "0002_security"),
        ("scheduling", "0007_s5b_security"),
    ]

    operations = [
        EnableFacilityRLS("dispute"),
        EnableFacilityRLS("disputeevent"),
        EnableFacilityRLS("message"),
        EnableFacilityRLS("evidence"),
        EnableFacilityRLS("commentrequest"),
        EnableFacilityRLS("action"),
        EnableFacilityRLS("disagreement"),
        append_only("disputes_dispute_event"),
        append_only("disputes_message"),
        append_only("disputes_evidence"),
        owner_read_policy("disputes_dispute", "disputes_dispute_owner_read"),
        migrations.RunSQL(FUNCTIONS, FUNCTIONS_REVERSE),
    ]
