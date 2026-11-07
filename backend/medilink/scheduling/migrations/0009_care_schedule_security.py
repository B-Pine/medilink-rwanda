"""W7 (upgrade 13) security for the care schedule:

- forced facility RLS on care-schedule entries, with the owner read policy for the function below
- SECURITY DEFINER scheduling_patient_care_schedule(account): the coming dated items an account
  may read (self and guardian profiles only, never a delegate's): planned vaccinations and
  antenatal visits, and follow-up dates the doctor set that have no booking
- the `care_schedule.manage` permission for clinicians (scheduling/permissions.py; the grants are
  written out here so the migration replays the same way later)
"""

from django.db import migrations

from medilink.facilities.db import owner_read_policy
from medilink.tenancy.rls import EnableFacilityRLS

FUNCTIONS = """
CREATE OR REPLACE FUNCTION scheduling_patient_care_schedule(p_account uuid)
RETURNS TABLE (item_type text, item_id uuid, facility_id uuid, due_on date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT 'care', e.id, e.facility_id, e.due_on FROM scheduling_care_schedule_entry e
  WHERE e.patient_id IN (SELECT patient_id FROM visits_account_patients(p_account))
    AND e.status = 'due'
    AND e.due_on >= (now() AT TIME ZONE 'Africa/Kigali')::date
  UNION ALL
  SELECT 'follow_up', f.id, f.facility_id, f.due_on FROM scheduling_follow_up f
  WHERE f.patient_id IN (SELECT patient_id FROM visits_account_patients(p_account))
    AND f.status IN ('due', 'no_slot')
    AND f.due_on >= (now() AT TIME ZONE 'Africa/Kigali')::date
  ORDER BY 4, 2
  LIMIT 100
$$;
REVOKE ALL ON FUNCTION scheduling_patient_care_schedule(uuid) FROM PUBLIC;
"""

REVERSE = "DROP FUNCTION IF EXISTS scheduling_patient_care_schedule(uuid);"

PERMISSIONS = {
    "care_schedule.manage": "Plan vaccination and antenatal visit dates for a patient",
}
GRANTS = {"doctor": ["care_schedule.manage"]}


def seed(apps, schema_editor):
    Permission = apps.get_model("tenancy", "Permission")
    Role = apps.get_model("tenancy", "Role")
    db = schema_editor.connection.alias
    for code, description in PERMISSIONS.items():
        Permission.objects.using(db).update_or_create(
            code=code, defaults={"description": description}
        )
    for role_code, codes in GRANTS.items():
        role = Role.objects.using(db).get(code=role_code)
        role.permissions.add(*Permission.objects.using(db).filter(code__in=codes))


def unseed(apps, schema_editor):
    Permission = apps.get_model("tenancy", "Permission")
    Permission.objects.using(schema_editor.connection.alias).filter(code__in=PERMISSIONS).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("scheduling", "0008_care_schedule"),
        ("visits", "0002_security"),
        ("tenancy", "0012_lab_technician_role"),
    ]

    operations = [
        EnableFacilityRLS("carescheduleentry"),
        owner_read_policy(
            "scheduling_care_schedule_entry", "scheduling_care_schedule_owner_read"
        ),
        migrations.RunSQL(FUNCTIONS, REVERSE),
        migrations.RunPython(seed, unseed),
    ]
