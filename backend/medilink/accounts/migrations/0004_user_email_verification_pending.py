from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_clinicianprofile"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="email_verification_pending",
            field=models.BooleanField(default=False),
        ),
    ]
