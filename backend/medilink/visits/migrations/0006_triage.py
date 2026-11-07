"""Upgrade 06 §2 (#200): the optional triage stage and the triage record on the visit."""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("visits", "0005_r4_queue_fixes"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name="ticket",
            name="stage",
            field=models.CharField(
                choices=[
                    ("reception", "Reception"),
                    ("payment", "Payment"),
                    ("triage", "Triage"),
                    ("consultation", "Consultation"),
                    ("pharmacy", "Pharmacy"),
                ],
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name="visit",
            name="triaged_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="visit",
            name="triaged_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="+",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="visit",
            name="triage_urgency",
            field=models.CharField(blank=True, max_length=12),
        ),
        migrations.AddField(
            model_name="visit",
            name="triage_note_encrypted",
            field=models.BinaryField(blank=True, null=True),
        ),
    ]
