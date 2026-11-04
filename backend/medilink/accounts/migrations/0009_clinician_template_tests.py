from django.db import migrations, models


class Migration(migrations.Migration):
    """W3 (#202): lab tests on an order set, kept for W2 lab orders and not ordered yet."""

    dependencies = [
        ("accounts", "0008_clinician_profile"),
    ]

    operations = [
        migrations.AddField(
            model_name="cliniciantemplate",
            name="tests",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
