"""#203 security: forced facility RLS on insurance claims; a claim keeps its bill and facility and is
never deleted (its outcome changes, each change is in the audit log)."""

from django.db import migrations

from medilink.tenancy.rls import EnableFacilityRLS

TRIGGERS = """
CREATE OR REPLACE FUNCTION billing_claim_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'insurance claims are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.bill_id, NEW.facility_id) IS DISTINCT FROM (OLD.bill_id, OLD.facility_id) THEN
    RAISE EXCEPTION 'insurance claims keep their bill' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER billing_claim_lock BEFORE UPDATE OR DELETE ON billing_insurance_claim
  FOR EACH ROW EXECUTE FUNCTION billing_claim_guard();
"""

TRIGGERS_REVERSE = """
DROP TRIGGER IF EXISTS billing_claim_lock ON billing_insurance_claim;
DROP FUNCTION IF EXISTS billing_claim_guard();
"""


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0006_insurance_claim"),
    ]

    operations = [
        EnableFacilityRLS("insuranceclaim"),
        migrations.RunSQL(TRIGGERS, TRIGGERS_REVERSE),
    ]
