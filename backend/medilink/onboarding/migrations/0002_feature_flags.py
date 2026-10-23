"""Seed the feature flag catalogue (contract S1-B17)."""

from typing import Any

from django.db import migrations

from medilink.core.ids import uuid7

FLAGS = [
    ("security.pin_unlock", "Unlock an idle-locked session with a PIN", True),
]


def forwards(apps: Any, schema_editor: Any) -> None:
    flag = apps.get_model("onboarding", "FeatureFlag")
    for code, description, default in FLAGS:
        flag.objects.get_or_create(
            code=code, defaults={"id": uuid7(), "description": description, "default_enabled": default}
        )


class Migration(migrations.Migration):
    dependencies = [("onboarding", "0001_initial")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
