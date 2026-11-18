from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("facilities", "0006_cloudinary_images")]

    operations = [
        migrations.AddField(
            model_name="publiclisting",
            name="cover_public_id",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
