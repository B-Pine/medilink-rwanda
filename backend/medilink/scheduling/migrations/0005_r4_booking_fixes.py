"""R4 booking fixes (#86): service schedules without a named doctor; cross-facility lookups for
the strike limit period and the one-open-hold-per-account rule (SECURITY DEFINER, times or IDs
only)."""

import django.db.models.deletion
from django.db import migrations, models

FUNCTIONS = """
CREATE OR REPLACE FUNCTION scheduling_strike_times(p_patient uuid, p_since timestamptz)
RETURNS SETOF timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.occurred_at FROM scheduling_no_show_strike s
  WHERE s.patient_id = p_patient AND s.reversed_at IS NULL AND s.occurred_at >= p_since
  ORDER BY s.occurred_at
$$;
REVOKE ALL ON FUNCTION scheduling_strike_times(uuid, timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION scheduling_account_holds(p_account uuid)
RETURNS TABLE (hold_id uuid, facility_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT h.id, h.facility_id FROM scheduling_slot_hold h
  WHERE h.account_id = p_account AND h.released_at IS NULL AND h.booking_id IS NULL
$$;
REVOKE ALL ON FUNCTION scheduling_account_holds(uuid) FROM PUBLIC;
"""

REVERSE = """
DROP FUNCTION IF EXISTS scheduling_account_holds(uuid);
DROP FUNCTION IF EXISTS scheduling_strike_times(uuid, timestamptz);
"""


class Migration(migrations.Migration):
    dependencies = [
        ("scheduling", "0004_s5_security"),
    ]

    operations = [
        migrations.AlterField(
            model_name="scheduletemplate",
            name="membership",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="+",
                to="tenancy.facilitymembership",
            ),
        ),
        migrations.RunSQL(FUNCTIONS, REVERSE),
    ]
