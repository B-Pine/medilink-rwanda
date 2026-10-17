"""Make the audit table append-only at the database level (security 05 §6, B11).

A trigger rejects UPDATE, DELETE and TRUNCATE for every role, including the owner. In addition,
medilink.core.db revokes UPDATE/DELETE/TRUNCATE on this table from the runtime role after every
migrate, so the app role only has SELECT + INSERT.
"""

from django.db import migrations

FORWARD = """
CREATE OR REPLACE FUNCTION audit_reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit log is append-only: % on % is not allowed', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER audit_entry_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_auditentry
  FOR EACH ROW EXECUTE FUNCTION audit_reject_mutation();

CREATE TRIGGER audit_entry_no_truncate
  BEFORE TRUNCATE ON audit_auditentry
  FOR EACH STATEMENT EXECUTE FUNCTION audit_reject_mutation();
"""

BACKWARD = """
DROP TRIGGER IF EXISTS audit_entry_no_truncate ON audit_auditentry;
DROP TRIGGER IF EXISTS audit_entry_no_update_delete ON audit_auditentry;
DROP FUNCTION IF EXISTS audit_reject_mutation();
"""


class Migration(migrations.Migration):
    dependencies = [("audit", "0001_initial")]

    operations = [migrations.RunSQL(FORWARD, BACKWARD)]
