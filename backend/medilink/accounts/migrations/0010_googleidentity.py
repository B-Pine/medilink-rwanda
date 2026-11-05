import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import medilink.core.ids


class Migration(migrations.Migration):
    """Upgrade 17: Sign in with Google for patients; Google's stable account ID per account."""

    dependencies = [
        ("accounts", "0009_clinician_template_tests"),
    ]

    operations = [
        migrations.CreateModel(
            name="GoogleIdentity",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=medilink.core.ids.uuid7,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("subject", models.CharField(max_length=255, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("last_used_at", models.DateTimeField(blank=True, null=True)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="google_identity",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
    ]
