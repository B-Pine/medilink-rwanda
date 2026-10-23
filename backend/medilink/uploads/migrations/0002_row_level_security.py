"""Row-level security on uploads_file (contract §2.6).

- facility_isolation (ALL): rows of the active facility only (S2 onwards).
- unowned_rows (ALL): rows without a facility (applications, platform, patients) are visible in
  any context; the purpose's policy functions decide who may read them.
"""

from django.db import migrations

from medilink.tenancy.rls import CreatePolicy, EnableFacilityRLS


class Migration(migrations.Migration):
    dependencies = [("uploads", "0001_initial")]

    operations = [
        EnableFacilityRLS("uploadedfile"),
        CreatePolicy(
            "uploadedfile",
            name="unowned_rows",
            using="facility_id IS NULL",
            with_check="facility_id IS NULL",
        ),
    ]
