"""S8 security (contract sprint-08 §2.1):

- forced facility RLS on every new billing table
- bill events, insurance verifications, credit notes and refund payouts are append-only
- lock triggers: payments change only their void columns, receipts only their void columns and
  document, exemptions only their approval columns, bill lines only their split and removal
  columns (and a removed line not at all); none of them is ever deleted
- SECURITY DEFINER billing_patient_bills(account) for My bills
"""

from django.db import migrations

from medilink.facilities.db import append_only, owner_read_policy
from medilink.tenancy.rls import EnableFacilityRLS

TABLES = (
    "bill",
    "billline",
    "billevent",
    "insuranceverification",
    "cashshift",
    "payment",
    "receipt",
    "exemption",
    "approvalrequest",
    "creditnote",
    "refundpayout",
)

TRIGGERS = """
CREATE OR REPLACE FUNCTION billing_payment_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payments are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.bill_id, NEW.shift_id, NEW.method, NEW.amount_rwf, NEW.reference,
      NEW.ebm_receipt_number, NEW.received_by_membership_id, NEW.received_at,
      NEW.idempotency_key, NEW.facility_id)
     IS DISTINCT FROM
     (OLD.bill_id, OLD.shift_id, OLD.method, OLD.amount_rwf, OLD.reference,
      OLD.ebm_receipt_number, OLD.received_by_membership_id, OLD.received_at,
      OLD.idempotency_key, OLD.facility_id)
     OR OLD.status = 'voided'
  THEN
    RAISE EXCEPTION 'payments are locked' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER billing_payment_lock BEFORE UPDATE OR DELETE ON billing_payment
  FOR EACH ROW EXECUTE FUNCTION billing_payment_guard();

CREATE OR REPLACE FUNCTION billing_receipt_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'receipts are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.payment_id, NEW.number, NEW.issued_at, NEW.facility_id)
     IS DISTINCT FROM (OLD.payment_id, OLD.number, OLD.issued_at, OLD.facility_id)
     OR (OLD.status = 'voided' AND NEW.status <> 'voided')
  THEN
    RAISE EXCEPTION 'receipts are locked' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER billing_receipt_lock BEFORE UPDATE OR DELETE ON billing_receipt
  FOR EACH ROW EXECUTE FUNCTION billing_receipt_guard();

CREATE OR REPLACE FUNCTION billing_exemption_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'exemptions are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.bill_id, NEW.reason_code, NEW.reason_text, NEW.amount_rwf,
      NEW.applied_by_membership_id, NEW.facility_id)
     IS DISTINCT FROM
     (OLD.bill_id, OLD.reason_code, OLD.reason_text, OLD.amount_rwf,
      OLD.applied_by_membership_id, OLD.facility_id)
     OR OLD.applied_at IS NOT NULL
     OR (OLD.approval_request_id IS NOT NULL
         AND NEW.approval_request_id IS DISTINCT FROM OLD.approval_request_id)
  THEN
    RAISE EXCEPTION 'exemptions are locked' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER billing_exemption_lock BEFORE UPDATE OR DELETE ON billing_exemption
  FOR EACH ROW EXECUTE FUNCTION billing_exemption_guard();

CREATE OR REPLACE FUNCTION billing_line_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'bill lines are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.bill_id, NEW.kind, NEW.tariff_item_id, NEW.code, NEW.name, NEW.unit_price_rwf,
      NEW.quantity, NEW.total_rwf, NEW.prescription_item_id, NEW.added_by_membership_id,
      NEW.facility_id)
     IS DISTINCT FROM
     (OLD.bill_id, OLD.kind, OLD.tariff_item_id, OLD.code, OLD.name, OLD.unit_price_rwf,
      OLD.quantity, OLD.total_rwf, OLD.prescription_item_id, OLD.added_by_membership_id,
      OLD.facility_id)
     OR OLD.removed_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'bill lines are locked' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER billing_line_lock BEFORE UPDATE OR DELETE ON billing_bill_line
  FOR EACH ROW EXECUTE FUNCTION billing_line_guard();

CREATE OR REPLACE FUNCTION billing_bill_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'bills are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.visit_id, NEW.patient_id, NEW.facility_patient_id, NEW.facility_id)
     IS DISTINCT FROM (OLD.visit_id, OLD.patient_id, OLD.facility_patient_id, OLD.facility_id)
  THEN
    RAISE EXCEPTION 'bills keep their visit and patient' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER billing_bill_lock BEFORE UPDATE OR DELETE ON billing_bill
  FOR EACH ROW EXECUTE FUNCTION billing_bill_guard();
"""

TRIGGERS_REVERSE = """
DROP TRIGGER IF EXISTS billing_bill_lock ON billing_bill;
DROP FUNCTION IF EXISTS billing_bill_guard();
DROP TRIGGER IF EXISTS billing_line_lock ON billing_bill_line;
DROP FUNCTION IF EXISTS billing_line_guard();
DROP TRIGGER IF EXISTS billing_exemption_lock ON billing_exemption;
DROP FUNCTION IF EXISTS billing_exemption_guard();
DROP TRIGGER IF EXISTS billing_receipt_lock ON billing_receipt;
DROP FUNCTION IF EXISTS billing_receipt_guard();
DROP TRIGGER IF EXISTS billing_payment_lock ON billing_payment;
DROP FUNCTION IF EXISTS billing_payment_guard();
"""

FUNCTIONS = """
CREATE OR REPLACE FUNCTION billing_patient_bills(p_account uuid)
RETURNS TABLE (bill_id uuid, facility_id uuid, patient_id uuid, balance_rwf integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT b.id, b.facility_id, b.patient_id, b.balance_rwf
  FROM billing_bill b
  JOIN patients_patientlink l ON l.patient_id = b.patient_id
  WHERE l.account_id = p_account AND l.revoked_at IS NULL
    AND b.status <> 'voided'
    AND (
      l.relationship IN ('self', 'guardian')
      OR NOT EXISTS (
        SELECT 1 FROM clinical_consultation c
        WHERE c.visit_id = b.visit_id AND c.is_restricted
      )
    )
  ORDER BY b.created_at DESC, b.id
$$;
REVOKE ALL ON FUNCTION billing_patient_bills(uuid) FROM PUBLIC;
"""

FUNCTIONS_REVERSE = "DROP FUNCTION IF EXISTS billing_patient_bills(uuid);"


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0004_s8_bills"),
        ("clinical", "0002_security"),
    ]

    operations = [
        *(EnableFacilityRLS(name) for name in TABLES),
        append_only("billing_bill_event"),
        append_only("billing_insurance_verification"),
        append_only("billing_credit_note"),
        append_only("billing_refund_payout"),
        migrations.RunSQL(TRIGGERS, TRIGGERS_REVERSE),
        owner_read_policy("billing_bill", "billing_bill_owner_read"),
        migrations.RunSQL(FUNCTIONS, FUNCTIONS_REVERSE),
    ]
