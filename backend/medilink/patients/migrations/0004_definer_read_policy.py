"""The SECURITY DEFINER helpers (`patients_known_elsewhere`, `patients_facilities_of`) run as the
owner role, and FORCE ROW LEVEL SECURITY applies to the owner too, so without this they would see
only the caller's facility. This SELECT-only policy is granted to the owner role (the role running
migrations). It is never created for the runtime role: when migrations run as that role (a
single-role setup), the policy is skipped and the helpers only see the current facility."""

from typing import Any

from django.conf import settings
from django.db import migrations

POLICY = "patients_fp_owner_read"


def create(apps: Any, schema_editor: Any) -> None:
    if schema_editor.connection.vendor != "postgresql":
        return
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("SELECT current_user")
        if cursor.fetchone()[0] == settings.DATABASE_APP_ROLE:
            return
    schema_editor.execute(
        f"CREATE POLICY {POLICY} ON patients_facility_patient "
        "AS PERMISSIVE FOR SELECT TO CURRENT_USER USING (true)"
    )


def drop(apps: Any, schema_editor: Any) -> None:
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(f"DROP POLICY IF EXISTS {POLICY} ON patients_facility_patient")


class Migration(migrations.Migration):
    dependencies = [("patients", "0003_s3_security_and_data")]

    operations = [migrations.RunPython(create, drop)]
