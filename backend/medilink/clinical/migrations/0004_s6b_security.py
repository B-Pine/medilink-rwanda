"""S6b security (contract sprint-06 §2.1):

- forced facility RLS on scans, result reviews and history entries
- scans, history entries and health attributes are append-only
- break-glass sessions change only their end and review columns, and are never deleted
- result reviews are never deleted
"""

from django.db import migrations

from medilink.facilities.db import append_only
from medilink.tenancy.rls import EnableFacilityRLS

TRIGGERS = """
CREATE OR REPLACE FUNCTION authz_break_glass_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'break-glass sessions are never deleted'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.user_id, NEW.patient_id, NEW.facility_id, NEW.reason_code, NEW.reason_text,
      NEW.starts_at, NEW.expires_at)
     IS DISTINCT FROM
     (OLD.user_id, OLD.patient_id, OLD.facility_id, OLD.reason_code, OLD.reason_text,
      OLD.starts_at, OLD.expires_at)
     OR (OLD.ended_at IS NOT NULL AND NEW.ended_at IS DISTINCT FROM OLD.ended_at)
     OR (OLD.reviewed_at IS NOT NULL AND (NEW.reviewed_at, NEW.reviewed_by_id,
         NEW.review_outcome, NEW.review_note) IS DISTINCT FROM (OLD.reviewed_at,
         OLD.reviewed_by_id, OLD.review_outcome, OLD.review_note))
  THEN
    RAISE EXCEPTION 'break-glass sessions are locked' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER authz_break_glass_lock BEFORE UPDATE OR DELETE ON authz_break_glass_session
  FOR EACH ROW EXECUTE FUNCTION authz_break_glass_guard();

CREATE OR REPLACE FUNCTION clinical_result_review_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'result reviews are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status = 'reviewed'
     OR (NEW.scan_id, NEW.patient_id, NEW.facility_patient_id, NEW.facility_id)
        IS DISTINCT FROM (OLD.scan_id, OLD.patient_id, OLD.facility_patient_id, OLD.facility_id)
  THEN
    RAISE EXCEPTION 'reviewed results are locked' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER clinical_result_review_lock BEFORE UPDATE OR DELETE ON clinical_result_review
  FOR EACH ROW EXECUTE FUNCTION clinical_result_review_guard();
"""

TRIGGERS_REVERSE = """
DROP TRIGGER IF EXISTS clinical_result_review_lock ON clinical_result_review;
DROP FUNCTION IF EXISTS clinical_result_review_guard();
DROP TRIGGER IF EXISTS authz_break_glass_lock ON authz_break_glass_session;
DROP FUNCTION IF EXISTS authz_break_glass_guard();
"""


class Migration(migrations.Migration):
    dependencies = [("clinical", "0003_s6b_records")]

    operations = [
        EnableFacilityRLS("clinicalscan"),
        EnableFacilityRLS("resultreview"),
        EnableFacilityRLS("historyentry"),
        append_only("clinical_scan"),
        append_only("clinical_history_entry"),
        append_only("patients_health_attribute"),
        migrations.RunSQL(TRIGGERS, TRIGGERS_REVERSE),
    ]
