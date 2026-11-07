"""Upgrade 06 §3 (#201): the laboratory stage, a loop out of the consultation."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("visits", "0006_triage")]

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
                    ("lab", "Laboratory"),
                    ("pharmacy", "Pharmacy"),
                ],
                max_length=12,
            ),
        ),
    ]
