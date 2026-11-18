from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0010_googleidentity")]

    operations = [
        migrations.AddField(
            model_name="clinicianprofile",
            name="avatar_public_id",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
