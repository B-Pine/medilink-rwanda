"""S6a security and data (contract sprint-06 §2.1, §4, D-4, D-5):

- forced facility RLS on every clinical table and authz_access_reason
- lock triggers: signed consultations keep their content, diagnoses follow the parent's status,
  vitals change only their entered-in-error columns, addenda and access reasons are append-only,
  nothing is ever deleted
- SECURITY DEFINER clinical_patient_records(account) for the patient read (D-4)
- the S6 permission code (frozen copy of medilink/clinical/permissions.py)
"""

from django.db import migrations

from medilink.facilities.db import append_only, owner_read_policy
from medilink.tenancy.rls import EnableFacilityRLS

PERMISSIONS = {
    "clinical.unsigned_list": "See the list of unsigned clinical records, without content",
}
GRANTS = {"facility_admin": ["clinical.unsigned_list"], "doctor": ["clinical.unsigned_list"]}

TRIGGERS = """
CREATE OR REPLACE FUNCTION clinical_consultation_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'clinical records are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status <> 'draft' AND (
       OLD.status = 'entered_in_error'
    OR NEW.status NOT IN (OLD.status, 'entered_in_error')
    OR NEW.history_enc IS DISTINCT FROM OLD.history_enc
    OR NEW.examination_enc IS DISTINCT FROM OLD.examination_enc
    OR NEW.plan_enc IS DISTINCT FROM OLD.plan_enc
    OR NEW.instructions_enc IS DISTINCT FROM OLD.instructions_enc
    OR NEW.private_notes_enc IS DISTINCT FROM OLD.private_notes_enc
    OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
    OR NEW.signed_at IS DISTINCT FROM OLD.signed_at
    OR NEW.started_at IS DISTINCT FROM OLD.started_at
    OR NEW.is_restricted IS DISTINCT FROM OLD.is_restricted
    OR NEW.is_late_entry IS DISTINCT FROM OLD.is_late_entry
    OR NEW.author_membership_id IS DISTINCT FROM OLD.author_membership_id
    OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
    OR NEW.facility_patient_id IS DISTINCT FROM OLD.facility_patient_id
    OR NEW.visit_id IS DISTINCT FROM OLD.visit_id
  ) THEN
    RAISE EXCEPTION 'signed clinical records are locked' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER clinical_consultation_lock BEFORE UPDATE OR DELETE ON clinical_consultation
  FOR EACH ROW EXECUTE FUNCTION clinical_consultation_guard();

CREATE OR REPLACE FUNCTION clinical_diagnosis_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_status text;
  parent uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN parent := OLD.consultation_id; ELSE parent := NEW.consultation_id; END IF;
  SELECT status INTO parent_status FROM clinical_consultation WHERE id = parent;
  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'diagnoses of a signed record are locked'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER clinical_diagnosis_lock BEFORE INSERT OR UPDATE OR DELETE ON clinical_diagnosis
  FOR EACH ROW EXECUTE FUNCTION clinical_diagnosis_guard();

CREATE OR REPLACE FUNCTION clinical_vitals_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'clinical records are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.temperature_c, NEW.systolic_mmhg, NEW.diastolic_mmhg, NEW.pulse_bpm,
      NEW.respiratory_rate, NEW.spo2_pct, NEW.weight_kg, NEW.height_cm, NEW.muac_mm,
      NEW.visit_id, NEW.patient_id, NEW.recorded_by_membership_id, NEW.recorded_at)
     IS DISTINCT FROM
     (OLD.temperature_c, OLD.systolic_mmhg, OLD.diastolic_mmhg, OLD.pulse_bpm,
      OLD.respiratory_rate, OLD.spo2_pct, OLD.weight_kg, OLD.height_cm, OLD.muac_mm,
      OLD.visit_id, OLD.patient_id, OLD.recorded_by_membership_id, OLD.recorded_at)
     OR (OLD.consultation_id IS NOT NULL
         AND NEW.consultation_id IS DISTINCT FROM OLD.consultation_id)
     OR (OLD.entered_in_error_at IS NOT NULL
         AND (NEW.entered_in_error_at, NEW.entered_in_error_reason)
             IS DISTINCT FROM (OLD.entered_in_error_at, OLD.entered_in_error_reason))
  THEN
    RAISE EXCEPTION 'vitals are append-only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER clinical_vitals_lock BEFORE UPDATE OR DELETE ON clinical_vitals
  FOR EACH ROW EXECUTE FUNCTION clinical_vitals_guard();
"""

TRIGGERS_REVERSE = """
DROP TRIGGER IF EXISTS clinical_vitals_lock ON clinical_vitals;
DROP FUNCTION IF EXISTS clinical_vitals_guard();
DROP TRIGGER IF EXISTS clinical_diagnosis_lock ON clinical_diagnosis;
DROP FUNCTION IF EXISTS clinical_diagnosis_guard();
DROP TRIGGER IF EXISTS clinical_consultation_lock ON clinical_consultation;
DROP FUNCTION IF EXISTS clinical_consultation_guard();
"""

FUNCTIONS = """
CREATE OR REPLACE FUNCTION clinical_patient_records(p_account uuid)
RETURNS TABLE (consultation_id uuid, facility_id uuid, patient_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id, c.facility_id, c.patient_id
  FROM clinical_consultation c
  JOIN patients_patientlink l ON l.patient_id = c.patient_id
  WHERE l.account_id = p_account AND l.revoked_at IS NULL
    AND c.status = 'signed'
    AND (l.relationship IN ('self', 'guardian') OR NOT c.is_restricted)
  ORDER BY c.signed_at DESC, c.id
$$;
REVOKE ALL ON FUNCTION clinical_patient_records(uuid) FROM PUBLIC;
"""

FUNCTIONS_REVERSE = "DROP FUNCTION IF EXISTS clinical_patient_records(uuid);"


def seed_permissions(apps, schema_editor):
    Permission = apps.get_model("tenancy", "Permission")
    Role = apps.get_model("tenancy", "Role")
    db = schema_editor.connection.alias
    for code, description in PERMISSIONS.items():
        Permission.objects.using(db).update_or_create(code=code, defaults={"description": description})
    for role_code, codes in GRANTS.items():
        role = Role.objects.using(db).get(code=role_code)
        role.permissions.add(*Permission.objects.using(db).filter(code__in=codes))


def unseed_permissions(apps, schema_editor):
    Permission = apps.get_model("tenancy", "Permission")
    Permission.objects.using(schema_editor.connection.alias).filter(code__in=PERMISSIONS).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("clinical", "0001_initial"),
        ("patients", "0004_definer_read_policy"),
        ("tenancy", "0003_seed_roles_permissions"),
    ]

    operations = [
        EnableFacilityRLS("consultation"),
        EnableFacilityRLS("diagnosis"),
        EnableFacilityRLS("addendum"),
        EnableFacilityRLS("vitals"),
        EnableFacilityRLS("accessreason"),
        append_only("clinical_addendum"),
        append_only("authz_access_reason"),
        migrations.RunSQL(TRIGGERS, TRIGGERS_REVERSE),
        owner_read_policy("clinical_consultation", "clinical_consultation_owner_read"),
        migrations.RunSQL(FUNCTIONS, FUNCTIONS_REVERSE),
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
