"""Forced facility RLS on tariffs and insurer rules (contract §2.1)."""

from django.db import migrations

from medilink.tenancy.rls import EnableFacilityRLS


class Migration(migrations.Migration):
    dependencies = [("billing", "0002_initial")]

    operations = [EnableFacilityRLS("tariffitem"), EnableFacilityRLS("insurerrule")]
