"""S7a security and data (contract sprint-07 §2.1, §4, §5):

- forced facility RLS on every pharmacy table
- events, dispense records and dispense lines are append-only
- lock triggers: issued items change only their status, dispensed quantity and cancel reason;
  issued prescriptions keep their number, dates and links; nothing issued is deleted
- SECURITY DEFINER pharmacy_patient_prescriptions(account) for My medicines and
  pharmacy_expiry_facilities() for the expiry job
- the S7 permission code (frozen copy of medilink/pharmacy/permissions.py)
"""

from django.db import migrations

from medilink.facilities.db import append_only, owner_read_policy
from medilink.tenancy.rls import EnableFacilityRLS

PERMISSIONS = {
    "pharmacy.availability": "Mark catalogue drugs available or not at the facility",
}
GRANTS = {
    "pharmacist": ["pharmacy.availability"],
    "facility_admin": ["pharmacy.availability"],
}

TRIGGERS = """
CREATE OR REPLACE FUNCTION pharmacy_prescription_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'issued prescriptions are never deleted'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' AND (
       NEW.status = 'draft'
    OR NEW.number IS DISTINCT FROM OLD.number
    OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.consultation_id IS DISTINCT FROM OLD.consultation_id
    OR NEW.visit_id IS DISTINCT FROM OLD.visit_id
    OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
    OR NEW.facility_patient_id IS DISTINCT FROM OLD.facility_patient_id
    OR NEW.prescriber_membership_id IS DISTINCT FROM OLD.prescriber_membership_id
  ) THEN
    RAISE EXCEPTION 'issued prescriptions are locked' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pharmacy_prescription_lock BEFORE UPDATE OR DELETE ON pharmacy_prescription
  FOR EACH ROW EXECUTE FUNCTION pharmacy_prescription_guard();

CREATE OR REPLACE FUNCTION pharmacy_item_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'issued prescription items are never deleted'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' AND (
       NEW.status = 'draft'
    OR NEW.dispensed_quantity < OLD.dispensed_quantity
    OR (NEW.drug_id, NEW.drug_code, NEW.drug_display, NEW.free_text_drug, NEW.is_off_catalogue,
        NEW.is_controlled, NEW.dose, NEW.frequency_code, NEW.route, NEW.duration_days,
        NEW.quantity, NEW.instructions_enc, NEW.substitution_allowed, NEW.alert_overrides,
        NEW.replaces_item_id, NEW.prescription_id)
       IS DISTINCT FROM
       (OLD.drug_id, OLD.drug_code, OLD.drug_display, OLD.free_text_drug, OLD.is_off_catalogue,
        OLD.is_controlled, OLD.dose, OLD.frequency_code, OLD.route, OLD.duration_days,
        OLD.quantity, OLD.instructions_enc, OLD.substitution_allowed, OLD.alert_overrides,
        OLD.replaces_item_id, OLD.prescription_id)
  ) THEN
    RAISE EXCEPTION 'issued prescription items are locked'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pharmacy_item_lock BEFORE UPDATE OR DELETE ON pharmacy_prescription_item
  FOR EACH ROW EXECUTE FUNCTION pharmacy_item_guard();
"""

TRIGGERS_REVERSE = """
DROP TRIGGER IF EXISTS pharmacy_item_lock ON pharmacy_prescription_item;
DROP FUNCTION IF EXISTS pharmacy_item_guard();
DROP TRIGGER IF EXISTS pharmacy_prescription_lock ON pharmacy_prescription;
DROP FUNCTION IF EXISTS pharmacy_prescription_guard();
"""

FUNCTIONS = """
CREATE OR REPLACE FUNCTION pharmacy_patient_prescriptions(p_account uuid)
RETURNS TABLE (prescription_id uuid, facility_id uuid, patient_id uuid, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id, p.facility_id, p.patient_id, p.status::text
  FROM pharmacy_prescription p
  JOIN clinical_consultation c ON c.id = p.consultation_id
  JOIN patients_patientlink l ON l.patient_id = p.patient_id
  WHERE l.account_id = p_account AND l.revoked_at IS NULL
    AND p.status <> 'draft'
    AND c.status = 'signed'
    AND (l.relationship IN ('self', 'guardian') OR NOT c.is_restricted)
  ORDER BY p.issued_at DESC, p.id
$$;
REVOKE ALL ON FUNCTION pharmacy_patient_prescriptions(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION pharmacy_expiry_facilities()
RETURNS TABLE (facility_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT p.facility_id
  FROM pharmacy_prescription p
  WHERE p.expires_at <= now()
    AND p.status IN ('issued', 'awaiting_payment', 'ready_to_dispense', 'partly_dispensed',
                     'not_available')
$$;
REVOKE ALL ON FUNCTION pharmacy_expiry_facilities() FROM PUBLIC;
"""

FUNCTIONS_REVERSE = """
DROP FUNCTION IF EXISTS pharmacy_expiry_facilities();
DROP FUNCTION IF EXISTS pharmacy_patient_prescriptions(uuid);
"""


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
        ("pharmacy", "0001_initial"),
        ("documents", "0002_security"),
    ]

    operations = [
        EnableFacilityRLS("prescription"),
        EnableFacilityRLS("prescriptionitem"),
        EnableFacilityRLS("prescriptionevent"),
        EnableFacilityRLS("dispenserecord"),
        EnableFacilityRLS("dispenseline"),
        EnableFacilityRLS("drugavailability"),
        EnableFacilityRLS("prescriptionquery"),
        append_only("pharmacy_prescription_event"),
        append_only("pharmacy_dispense_record"),
        append_only("pharmacy_dispense_line"),
        migrations.RunSQL(TRIGGERS, TRIGGERS_REVERSE),
        owner_read_policy("pharmacy_prescription", "pharmacy_prescription_owner_read"),
        migrations.RunSQL(FUNCTIONS, FUNCTIONS_REVERSE),
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
