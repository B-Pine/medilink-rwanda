"""Upgrade 06 §4: the cashier role takes payments and nothing else (no queue, no clinical data).

The grants are written out here, not read from the live catalogue, so the migration replays the
same way later; tests/test_roles_seed.py keeps them in step with authz/catalogue.py. The three
codes are core permissions, seeded by 0003.
"""

from django.db import migrations, models

CODE = "cashier"
NAME = "Cashier"
GRANTS = ["billing.record_payment", "disputes.comment", "reports.view_own"]


def seed(apps, schema_editor):
    Permission = apps.get_model("tenancy", "Permission")
    Role = apps.get_model("tenancy", "Role")
    db = schema_editor.connection.alias
    role, _ = Role.objects.using(db).update_or_create(code=CODE, defaults={"name": NAME})
    role.permissions.set(Permission.objects.using(db).filter(code__in=GRANTS))


def unseed(apps, schema_editor):
    Role = apps.get_model("tenancy", "Role")
    Role.objects.using(schema_editor.connection.alias).filter(code=CODE).delete()


class Migration(migrations.Migration):
    dependencies = [("tenancy", "0008_facility_identifiers")]

    operations = [
        migrations.AlterField(
            model_name="role",
            name="code",
            field=models.CharField(
                choices=[
                    ("facility_admin", "Facility admin"),
                    ("receptionist", "Receptionist"),
                    ("doctor", "Doctor / clinician"),
                    ("pharmacist", "Pharmacist"),
                    ("cashier", "Cashier"),
                ],
                max_length=32,
                unique=True,
            ),
        ),
        migrations.RunPython(seed, unseed),
    ]
