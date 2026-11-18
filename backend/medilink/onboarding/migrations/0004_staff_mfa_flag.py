"""Add the staff two-step sign-in flag (on by default): platform admins can turn it off."""

from typing import Any

from django.db import migrations

from medilink.core.ids import uuid7

CODE = "security.staff_mfa"
DESCRIPTION = (
    "Staff sign in with a password and an authenticator code. Turn off only while testing: "
    "staff then sign in with the password alone."
)


def forwards(apps: Any, schema_editor: Any) -> None:
    flag = apps.get_model("onboarding", "FeatureFlag")
    flag.objects.get_or_create(
        code=CODE, defaults={"id": uuid7(), "description": DESCRIPTION, "default_enabled": True}
    )


def backwards(apps: Any, schema_editor: Any) -> None:
    apps.get_model("onboarding", "FeatureFlag").objects.filter(code=CODE).delete()


class Migration(migrations.Migration):
    dependencies = [("onboarding", "0003_facility_identifiers")]

    operations = [migrations.RunPython(forwards, backwards)]
