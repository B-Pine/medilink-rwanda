from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("facilities", "0007_listing_cover")]

    operations = [
        migrations.AddField(
            model_name="publiclisting",
            name="logo_public_id",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
