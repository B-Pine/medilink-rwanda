"""S2: forced RLS on invitations and membership service points; `tenancy_find_invitation()` looks
an invitation up by token hash before login (contract §2.1). Its owner reads across facilities
through an owner-only SELECT policy."""

from django.db import migrations

from medilink.facilities.db import owner_read_policy
from medilink.tenancy.rls import EnableFacilityRLS

FIND = """
CREATE OR REPLACE FUNCTION tenancy_find_invitation(p_token_hash bytea)
RETURNS TABLE (
  id uuid, facility_id uuid, email varchar, role_codes varchar[], service_point_ids uuid[],
  expires_at timestamptz, accepted_at timestamptz, revoked_at timestamptz, invited_by_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id, facility_id, email, role_codes, service_point_ids, expires_at, accepted_at,
         revoked_at, invited_by_id
  FROM tenancy_invitation WHERE token_hash = p_token_hash
$$;
REVOKE ALL ON FUNCTION tenancy_find_invitation(bytea) FROM PUBLIC;
"""
FIND_REVERSE = "DROP FUNCTION IF EXISTS tenancy_find_invitation(bytea);"


class Migration(migrations.Migration):
    dependencies = [("tenancy", "0004_facilitymembership_deactivated_by_and_more")]

    operations = [
        EnableFacilityRLS("invitation"),
        EnableFacilityRLS("membershipservicepoint"),
        owner_read_policy("tenancy_invitation", "tenancy_invitation_owner_read"),
        migrations.RunSQL(FIND, FIND_REVERSE),
    ]
