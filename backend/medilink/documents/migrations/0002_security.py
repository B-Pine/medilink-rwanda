"""S7a: forced facility RLS on the number counter (contract sprint-07 §2.1, D-2)."""

from django.db import migrations

from medilink.tenancy.rls import EnableFacilityRLS


class Migration(migrations.Migration):
    dependencies = [("documents", "0001_initial")]

    operations = [EnableFacilityRLS("numbercounter")]
