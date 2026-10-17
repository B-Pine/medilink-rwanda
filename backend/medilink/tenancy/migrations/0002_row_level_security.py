"""Row-level security on facility-owned tables (security 04 §4).

facilitymembership:
  - facility_isolation (ALL): rows of the active facility only; WITH CHECK blocks writing a row
    into another facility
  - membership_self_read (SELECT): a signed-in user can read their *own* memberships across
    facilities (needed for login, StaffMe and the facility picker)
facilitynote (demo facility-owned table): facility_isolation only.
"""

from django.db import migrations

from medilink.tenancy.rls import USER_CONTEXT_SQL, CreatePolicy, EnableFacilityRLS


class Migration(migrations.Migration):
    dependencies = [("tenancy", "0001_initial")]

    operations = [
        EnableFacilityRLS("facilitymembership"),
        CreatePolicy(
            "facilitymembership",
            name="membership_self_read",
            command="SELECT",
            using=f"user_id = {USER_CONTEXT_SQL}",
        ),
        EnableFacilityRLS("facilitynote"),
    ]
