from django.contrib.postgres.fields import ArrayField
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("facilities", "0005_emergency_department")]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="photo_public_ids",
            field=ArrayField(
                base_field=models.CharField(max_length=255), blank=True, default=list, size=None
            ),
        ),
        migrations.AddField(
            model_name="profile",
            name="logo_public_id",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
