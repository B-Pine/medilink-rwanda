"""S7b security (contract sprint-07 §2.1, §4):

- forced facility RLS on documents, versions, referrals, lab requests and sick notes
- verification log append-only; versions append-only except `superseded_at`
- letters and requests locked after signing (only `document_id` may still be set)
- SECURITY DEFINER documents_patient_documents(account) for the patient's documents and
  documents_share_target(token_hash) for public share links
- the `documents.print` permission (frozen copy of medilink/documents/permissions.py)
"""

from django.db import migrations

from medilink.facilities.db import append_only, owner_read_policy
from medilink.tenancy.rls import EnableFacilityRLS

PERMISSIONS = {"documents.print": "Print documents released to the patient"}
GRANTS = {"receptionist": ["documents.print"], "pharmacist": ["documents.print"]}

TRIGGERS = """
CREATE OR REPLACE FUNCTION documents_source_locked() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.signed_at IS NOT NULL THEN
      RAISE EXCEPTION 'signed % rows are never deleted', TG_TABLE_NAME
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.signed_at IS NOT NULL AND (
       to_jsonb(NEW) - 'document_id' - 'updated_at'
       IS DISTINCT FROM to_jsonb(OLD) - 'document_id' - 'updated_at'
     ) THEN
    RAISE EXCEPTION 'signed % rows are locked', TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER clinical_referral_locked BEFORE UPDATE OR DELETE ON clinical_referral
  FOR EACH ROW EXECUTE FUNCTION documents_source_locked();
CREATE TRIGGER clinical_lab_request_locked BEFORE UPDATE OR DELETE ON clinical_lab_request
  FOR EACH ROW EXECUTE FUNCTION documents_source_locked();
CREATE TRIGGER clinical_sick_note_locked BEFORE UPDATE OR DELETE ON clinical_sick_note
  FOR EACH ROW EXECUTE FUNCTION documents_source_locked();

CREATE OR REPLACE FUNCTION documents_version_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.superseded_at IS NOT NULL OR (
       to_jsonb(NEW) - 'superseded_at' IS DISTINCT FROM to_jsonb(OLD) - 'superseded_at'
     ) THEN
    RAISE EXCEPTION 'document versions are append-only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER documents_document_version_guard BEFORE UPDATE OR DELETE
  ON documents_document_version FOR EACH ROW EXECUTE FUNCTION documents_version_guard();
"""

TRIGGERS_REVERSE = """
DROP TRIGGER IF EXISTS documents_document_version_guard ON documents_document_version;
DROP FUNCTION IF EXISTS documents_version_guard();
DROP TRIGGER IF EXISTS clinical_sick_note_locked ON clinical_sick_note;
DROP TRIGGER IF EXISTS clinical_lab_request_locked ON clinical_lab_request;
DROP TRIGGER IF EXISTS clinical_referral_locked ON clinical_referral;
DROP FUNCTION IF EXISTS documents_source_locked();
"""

FUNCTIONS = """
CREATE OR REPLACE FUNCTION documents_patient_documents(p_account uuid)
RETURNS TABLE (document_id uuid, facility_id uuid, patient_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT d.id, d.facility_id, d.patient_id
  FROM documents_document d
  LEFT JOIN clinical_consultation c ON c.id = d.consultation_id
  JOIN patients_patientlink l ON l.patient_id = d.patient_id
  WHERE l.account_id = p_account AND l.revoked_at IS NULL
    AND d.released_at IS NOT NULL
    AND EXISTS (SELECT 1 FROM documents_document_version v WHERE v.document_id = d.id)
    AND (l.relationship IN ('self', 'guardian') OR NOT coalesce(c.is_restricted, false))
  ORDER BY d.document_date DESC, d.created_at DESC, d.id
$$;
REVOKE ALL ON FUNCTION documents_patient_documents(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION documents_share_target(p_token_hash bytea)
RETURNS TABLE (link_id uuid, document_id uuid, facility_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id, d.id, d.facility_id
  FROM documents_share_link s
  JOIN documents_document d ON d.id = s.document_id
  WHERE s.token_hash = p_token_hash AND s.revoked_at IS NULL AND s.expires_at > now()
$$;
REVOKE ALL ON FUNCTION documents_share_target(bytea) FROM PUBLIC;
"""

FUNCTIONS_REVERSE = """
DROP FUNCTION IF EXISTS documents_share_target(bytea);
DROP FUNCTION IF EXISTS documents_patient_documents(uuid);
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
        ("documents", "0003_s7b_documents"),
        ("pharmacy", "0002_security"),
        ("clinical", "0002_security"),
    ]

    operations = [
        EnableFacilityRLS("document"),
        EnableFacilityRLS("documentversion"),
        EnableFacilityRLS("referral"),
        EnableFacilityRLS("labrequest"),
        EnableFacilityRLS("sicknote"),
        append_only("documents_verification_log"),
        migrations.RunSQL(TRIGGERS, TRIGGERS_REVERSE),
        owner_read_policy("documents_document", "documents_document_owner_read"),
        owner_read_policy("documents_document_version", "documents_version_owner_read"),
        migrations.RunSQL(FUNCTIONS, FUNCTIONS_REVERSE),
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
