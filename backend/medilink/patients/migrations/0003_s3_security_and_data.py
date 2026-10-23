"""S3 security and data (contract §2.1, §4):

- forced facility RLS on patients_facility_patient
- append-only trigger on patients_audit_link (as audit 0002) and patients_merge_event
- SECURITY DEFINER functions patients_known_elsewhere() and patients_facilities_of()
- S3 permission codes and role grants (frozen copy of medilink/patients/permissions.py)
- backfill: MediLink numbers, normalised names, link granted_at, consent patient
"""

import re
import secrets
import unicodedata

from django.db import migrations

from medilink.tenancy.rls import EnableFacilityRLS

PERMISSIONS = {
    "patients.view": "Search and view patient records at the facility",
    "patients.identifier_reveal": "Unmask patient identifiers with a reason",
    "patients.insurance_verify": "Mark an insurance card verified or rejected",
    "patients.merge_approve": "Approve, reject or undo patient merges at the facility",
}
GRANTS = {
    "facility_admin": ["patients.view", "patients.identifier_reveal", "patients.insurance_verify", "patients.merge_approve"],
    "receptionist": ["patients.view", "patients.identifier_reveal", "patients.insurance_verify", "patients.merge_request"],
    "doctor": ["patients.view"],
}

APPEND_ONLY_SQL = """
CREATE OR REPLACE FUNCTION patients_reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER patients_audit_link_no_update_delete BEFORE UPDATE OR DELETE ON patients_audit_link
  FOR EACH ROW EXECUTE FUNCTION patients_reject_mutation();
CREATE TRIGGER patients_merge_event_no_update_delete BEFORE UPDATE OR DELETE ON patients_merge_event
  FOR EACH ROW EXECUTE FUNCTION patients_reject_mutation();
"""
APPEND_ONLY_REVERSE = """
DROP TRIGGER IF EXISTS patients_merge_event_no_update_delete ON patients_merge_event;
DROP TRIGGER IF EXISTS patients_audit_link_no_update_delete ON patients_audit_link;
DROP FUNCTION IF EXISTS patients_reject_mutation();
"""

FUNCTIONS_SQL = """
CREATE OR REPLACE FUNCTION patients_known_elsewhere(p_patient uuid, p_facility uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(*)::integer FROM patients_facility_patient
  WHERE patient_id = p_patient AND facility_id <> p_facility AND is_active
$$;
CREATE OR REPLACE FUNCTION patients_facilities_of(p_patient uuid) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT facility_id FROM patients_facility_patient WHERE patient_id = p_patient AND is_active
$$;
REVOKE ALL ON FUNCTION patients_known_elsewhere(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION patients_facilities_of(uuid) FROM PUBLIC;
"""
FUNCTIONS_REVERSE = """
DROP FUNCTION IF EXISTS patients_facilities_of(uuid);
DROP FUNCTION IF EXISTS patients_known_elsewhere(uuid, uuid);
"""

CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def _luhn32(chars):
    factor, total, n = 2, 0, len(CROCKFORD)
    for char in reversed(chars):
        addend = factor * CROCKFORD.index(char)
        factor = 1 if factor == 2 else 2
        total += addend // n + addend % n
    return CROCKFORD[(n - total % n) % n]


def _number(taken):
    while True:
        body = "".join(secrets.choice(CROCKFORD) for _ in range(7))
        raw = body + _luhn32(body)
        number = f"ML-{raw[:4]}-{raw[4:]}"
        if number not in taken:
            taken.add(number)
            return number


def _normalize_name(value):
    plain = "".join(c for c in unicodedata.normalize("NFKD", value or "") if not unicodedata.combining(c)).lower()
    return " ".join(sorted(re.findall(r"[a-z0-9']+", plain)))


def backfill(apps, schema_editor):
    Patient = apps.get_model("patients", "Patient")
    PatientLink = apps.get_model("patients", "PatientLink")
    taken = set(Patient.objects.exclude(medilink_number=None).values_list("medilink_number", flat=True))
    for patient in Patient.objects.filter(medilink_number=None):
        patient.medilink_number = _number(taken)
        patient.name_normalized = _normalize_name(patient.full_name)
        patient.save(update_fields=["medilink_number", "name_normalized"])
    for link in PatientLink.objects.filter(granted_at=None):
        link.granted_at = link.created_at
        link.save(update_fields=["granted_at"])


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
    Role = apps.get_model("tenancy", "Role")
    db = schema_editor.connection.alias
    receptionist = Role.objects.using(db).get(code="receptionist")
    receptionist.permissions.remove(*Permission.objects.using(db).filter(code="patients.merge_request"))
    Permission.objects.using(db).filter(code__in=PERMISSIONS).delete()


class Migration(migrations.Migration):
    dependencies = [("patients", "0002_s3_identity")]

    operations = [
        EnableFacilityRLS("facilitypatient"),
        migrations.RunSQL(APPEND_ONLY_SQL, APPEND_ONLY_REVERSE),
        migrations.RunSQL(FUNCTIONS_SQL, FUNCTIONS_REVERSE),
        migrations.RunPython(seed_permissions, unseed_permissions),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
