"""S10: seed the `support.view_facility` permission (contract sprint-10 §4; keep in step with
permissions.py). Support tables have no facility RLS: `support_request` is a documented exception
(contract §2.5, database design §3.5, tests/test_rls_coverage.py)."""

from django.db import migrations

PERMISSIONS = {"support.view_facility": "See support requests opened by the facility's staff"}
GRANTS = {"facility_admin": ["support.view_facility"]}


def seed_permissions(apps, schema_editor):
    Permission = apps.get_model("tenancy", "Permission")
    Role = apps.get_model("tenancy", "Role")
    db = schema_editor.connection.alias
    for code, description in PERMISSIONS.items():
        Permission.objects.using(db).update_or_create(code=code, defaults={"description": description})
    for role_code, codes in GRANTS.items():
        role = Role.objects.using(db).get(code=role_code)
        role.permissions.add(*Permission.objects.using(db).filter(code__in=codes))


def unseed_permissions(apps, schema_editor):
    Permission = apps.get_model("tenancy", "Permission")
    Permission.objects.using(schema_editor.connection.alias).filter(code__in=PERMISSIONS).delete()


class Migration(migrations.Migration):
    dependencies = [("support", "0001_s10_support")]

    operations = [migrations.RunPython(seed_permissions, unseed_permissions)]
