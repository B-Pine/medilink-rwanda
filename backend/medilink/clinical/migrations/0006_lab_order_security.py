"""Upgrade 06 §3 (#201) security for lab orders:

- forced facility RLS
- never deleted; who ordered what for whom never changes; a result, once entered, never changes;
  released and cancelled orders are locked
- SECURITY DEFINER clinical_patient_lab_results(account): the released results an account may
  read (self and guardian profiles; delegates only results of unrestricted consultations)
"""

from django.db import migrations

from medilink.facilities.db import owner_read_policy
from medilink.tenancy.rls import EnableFacilityRLS

TRIGGERS = """
CREATE OR REPLACE FUNCTION clinical_lab_order_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'lab orders are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.state IN ('released', 'cancelled')
     OR (NEW.facility_id, NEW.visit_id, NEW.consultation_id, NEW.patient_id,
         NEW.facility_patient_id, NEW.ordered_by_membership_id, NEW.test_code, NEW.ordered_at,
         NEW.reason_enc)
        IS DISTINCT FROM
        (OLD.facility_id, OLD.visit_id, OLD.consultation_id, OLD.patient_id,
         OLD.facility_patient_id, OLD.ordered_by_membership_id, OLD.test_code, OLD.ordered_at,
         OLD.reason_enc)
     OR (OLD.result_enc IS NOT NULL AND NEW.result_enc IS DISTINCT FROM OLD.result_enc)
  THEN
    RAISE EXCEPTION 'this lab order is locked' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER clinical_lab_order_lock BEFORE UPDATE OR DELETE ON clinical_lab_order
  FOR EACH ROW EXECUTE FUNCTION clinical_lab_order_guard();
"""

TRIGGERS_REVERSE = """
DROP TRIGGER IF EXISTS clinical_lab_order_lock ON clinical_lab_order;
DROP FUNCTION IF EXISTS clinical_lab_order_guard();
"""

FUNCTIONS = """
CREATE OR REPLACE FUNCTION clinical_patient_lab_results(p_account uuid)
RETURNS TABLE (lab_order_id uuid, facility_id uuid, patient_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT o.id, o.facility_id, o.patient_id
  FROM clinical_lab_order o
  JOIN clinical_consultation c ON c.id = o.consultation_id
  JOIN patients_patientlink l ON l.patient_id = o.patient_id
  WHERE l.account_id = p_account AND l.revoked_at IS NULL
    AND o.state = 'released' AND o.released_at IS NOT NULL
    AND (l.relationship IN ('self', 'guardian') OR NOT c.is_restricted)
  ORDER BY o.released_at DESC, o.id
$$;
REVOKE ALL ON FUNCTION clinical_patient_lab_results(uuid) FROM PUBLIC;
"""

FUNCTIONS_REVERSE = "DROP FUNCTION IF EXISTS clinical_patient_lab_results(uuid);"


class Migration(migrations.Migration):
    dependencies = [("clinical", "0005_lab_order")]

    operations = [
        EnableFacilityRLS("laborder"),
        migrations.RunSQL(TRIGGERS, TRIGGERS_REVERSE),
        owner_read_policy("clinical_lab_order", "clinical_lab_order_owner_read"),
        migrations.RunSQL(FUNCTIONS, FUNCTIONS_REVERSE),
    ]
