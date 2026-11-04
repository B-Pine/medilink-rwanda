"""Upgrade 06 §3 (#201): the laboratory technician sees the lab requests, records samples and
enters results; never diagnoses, notes or other visits, and never releases a result.

The grants are written out here, not read from the live catalogue, so the migration replays the
same way later; tests/test_roles_seed.py keeps them in step with authz/catalogue.py.
`lab.operate` and `lab.result.enter` are new core permissions; the others were seeded by 0003.
"""

from django.db import migrations, models

CODE = "lab_technician"
NAME = "Laboratory technician"
PERMISSIONS = {
    "lab.operate": "See the lab requests, call patients to the lab and record samples",
    "lab.result.enter": "Enter laboratory results",
}
GRANTS = ["lab.operate", "lab.result.enter", "disputes.comment", "reports.view_own"]


def seed(apps, schema_editor):
    Permission = apps.get_model("tenancy", "Permission")
    Role = apps.get_model("tenancy", "Role")
    db = schema_editor.connection.alias
    for code, description in PERMISSIONS.items():
        Permission.objects.using(db).update_or_create(
            code=code, defaults={"description": description}
        )
    role, _ = Role.objects.using(db).update_or_create(code=CODE, defaults={"name": NAME})
    role.permissions.set(Permission.objects.using(db).filter(code__in=GRANTS))


def unseed(apps, schema_editor):
    db = schema_editor.connection.alias
    apps.get_model("tenancy", "Role").objects.using(db).filter(code=CODE).delete()
    apps.get_model("tenancy", "Permission").objects.using(db).filter(
        code__in=PERMISSIONS
    ).delete()


class Migration(migrations.Migration):
    dependencies = [("tenancy", "0011_triage_nurse_role")]

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
                    ("triage_nurse", "Triage nurse"),
                    ("lab_technician", "Laboratory technician"),
                ],
                max_length=32,
                unique=True,
            ),
        ),
        migrations.RunPython(seed, unseed),
    ]
