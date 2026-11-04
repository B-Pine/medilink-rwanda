"""W5 stock security (upgrade 13 §3):

- forced facility RLS on the stock card, batch and movement tables
- stock movements are append-only (the ledger behind every count)
- the `pharmacy.stock` permission for pharmacists and facility admins (frozen copy of
  medilink/pharmacy/permissions.py)
"""

from django.db import migrations

from medilink.facilities.db import append_only
from medilink.tenancy.rls import EnableFacilityRLS

PERMISSIONS = {
    "pharmacy.stock": "Receive and adjust medicine stock at the facility",
}
GRANTS = {
    "pharmacist": ["pharmacy.stock"],
    "facility_admin": ["pharmacy.stock"],
}


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
        ("pharmacy", "0003_stock"),
    ]

    operations = [
        EnableFacilityRLS("stockitem"),
        EnableFacilityRLS("stockbatch"),
        EnableFacilityRLS("stockmovement"),
        append_only("pharmacy_stock_movement"),
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
