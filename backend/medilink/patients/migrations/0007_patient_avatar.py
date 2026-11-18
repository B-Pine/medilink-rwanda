from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("patients", "0006_patient_photo")]

    operations = [
        migrations.AddField(
            model_name="patient",
            name="avatar_public_id",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
