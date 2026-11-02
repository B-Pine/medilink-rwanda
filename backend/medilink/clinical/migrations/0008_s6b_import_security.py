"""S6b import security (contract sprint-06 §2.1): forced facility RLS on import batches and rows,
and the SECURITY DEFINER list of facilities whose raw import rows are due for purging."""

from django.db import migrations

from medilink.facilities.db import owner_read_policy
from medilink.tenancy.rls import EnableFacilityRLS

FUNCTIONS = """
CREATE OR REPLACE FUNCTION patients_import_purge_facilities()
RETURNS TABLE (facility_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT b.facility_id
  FROM patients_import_batch b
  WHERE b.purged_at IS NULL
    AND (b.rollback_until < now()
         OR (b.confirmed_at IS NULL AND b.created_at < now() - interval '7 days')
         OR (b.status = 'rolled_back' AND b.rolled_back_at < now() - interval '7 days'))
$$;
REVOKE ALL ON FUNCTION patients_import_purge_facilities() FROM PUBLIC;
"""

FUNCTIONS_REVERSE = "DROP FUNCTION IF EXISTS patients_import_purge_facilities();"


class Migration(migrations.Migration):
    dependencies = [("clinical", "0007_s6b_imports")]

    operations = [
        EnableFacilityRLS("importbatch"),
        EnableFacilityRLS("importrow"),
        owner_read_policy("patients_import_batch", "patients_import_batch_owner_read"),
        migrations.RunSQL(FUNCTIONS, FUNCTIONS_REVERSE),
    ]
