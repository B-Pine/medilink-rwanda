"""Forced RLS on the structured reason for visit; append-only (contract sprint-05 §2.1)."""

from django.db import migrations

from medilink.facilities.db import append_only
from medilink.tenancy.rls import EnableFacilityRLS


class Migration(migrations.Migration):
    dependencies = [("visits", "0003_s5")]

    operations = [
        EnableFacilityRLS("reasonsymptom"),
        append_only("visits_reason_symptom"),
    ]
