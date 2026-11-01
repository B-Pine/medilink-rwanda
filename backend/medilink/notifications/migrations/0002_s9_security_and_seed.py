"""S9: facility RLS on announcements plus a policy for platform rows (contract §2.3); seed the
`announcements.manage` permission (contract §4; keep in step with permissions.py)."""

from django.db import migrations

from medilink.tenancy.rls import CreatePolicy, EnableFacilityRLS

PERMISSIONS = {"announcements.manage": "Write, publish and withdraw facility announcements"}
GRANTS = {"facility_admin": ["announcements.manage"]}


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
    dependencies = [
        ("notifications", "0001_s9_notifications"),
        ("tenancy", "0005_s2_security"),
    ]

    operations = [
        EnableFacilityRLS("announcement"),
        CreatePolicy(
            "announcement",
            "platform_rows",
            using="facility_id IS NULL",
            with_check="facility_id IS NULL",
        ),
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
