# Patient profile photo (decision 2026-11-05).

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('patients', '0005_r2_dependent_idempotency'),
        ('uploads', '0002_row_level_security'),
    ]

    operations = [
        migrations.AddField(
            model_name='patient',
            name='photo_file',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='uploads.uploadedfile'),
        ),
    ]
