"""Upgrade 06 §2 (#200): the triage nurse sees patients between check-in and the doctor, records
vitals and sets their urgency; never diagnoses, notes, prescriptions or bills.

The grants are written out here, not read from the live catalogue, so the migration replays the
same way later; tests/test_roles_seed.py keeps them in step with authz/catalogue.py.
`triage.operate` is a new core permission; the other codes were seeded by 0003.
"""

from django.db import migrations, models

CODE = "triage_nurse"
NAME = "Triage nurse"
PERMISSION = ("triage.operate", "Call patients to triage, record their vitals and set their urgency")
GRANTS = [
    "triage.operate",
    "vitals.record",
    "visit.reason.view",
    "disputes.comment",
    "reports.view_own",
]


def seed(apps, schema_editor):
    Permission = apps.get_model("tenancy", "Permission")
    Role = apps.get_model("tenancy", "Role")
    db = schema_editor.connection.alias
    Permission.objects.using(db).update_or_create(
        code=PERMISSION[0], defaults={"description": PERMISSION[1]}
    )
    role, _ = Role.objects.using(db).update_or_create(code=CODE, defaults={"name": NAME})
    role.permissions.set(Permission.objects.using(db).filter(code__in=GRANTS))


def unseed(apps, schema_editor):
    db = schema_editor.connection.alias
    apps.get_model("tenancy", "Role").objects.using(db).filter(code=CODE).delete()
    apps.get_model("tenancy", "Permission").objects.using(db).filter(code=PERMISSION[0]).delete()


class Migration(migrations.Migration):
    dependencies = [("tenancy", "0010_clinician_profile")]

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
                ],
                max_length=32,
                unique=True,
            ),
        ),
        migrations.RunPython(seed, unseed),
    ]
