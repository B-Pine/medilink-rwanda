"""#207 (upgrade 13 W8): when to take a medicine with respect to food, for the label pictograms.
The item lock trigger also locks it once the prescription is issued."""

import importlib

from django.db import migrations, models

SECURITY = importlib.import_module("medilink.pharmacy.migrations.0002_security")
OLD_COLUMNS = "NEW.quantity, NEW.instructions_enc,"
OLD_COLUMNS_OLD = "OLD.quantity, OLD.instructions_enc,"
LOCKED = SECURITY.TRIGGERS.replace(
    OLD_COLUMNS, "NEW.quantity, NEW.meal_timing, NEW.instructions_enc,"
).replace(OLD_COLUMNS_OLD, "OLD.quantity, OLD.meal_timing, OLD.instructions_enc,")
assert "NEW.meal_timing" in LOCKED and "OLD.meal_timing" in LOCKED


def _function_only(sql: str) -> str:
    """The item guard function alone, without its CREATE TRIGGER (the trigger already exists)
    and without the prescription guard that comes before it in 0002."""
    start = sql.index("CREATE OR REPLACE FUNCTION pharmacy_item_guard()")
    end = sql.index("CREATE TRIGGER pharmacy_item_lock", start)
    return sql[start:end]


class Migration(migrations.Migration):
    dependencies = [
        ("pharmacy", "0004_stock_security"),
    ]

    operations = [
        migrations.AddField(
            model_name="prescriptionitem",
            name="meal_timing",
            field=models.CharField(
                blank=True,
                choices=[
                    ("before_food", "Before food"),
                    ("with_food", "With food"),
                    ("after_food", "After food"),
                ],
                default="",
                max_length=12,
            ),
        ),
        migrations.RunSQL(_function_only(LOCKED), _function_only(SECURITY.TRIGGERS)),
    ]
