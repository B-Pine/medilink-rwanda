"""S7 facility settings (contract sprint-07 §7)."""

from medilink.facilities.settings_schema import SettingField, register_settings_fields

register_settings_fields(
    "billing",
    {
        "pay_before_dispensing": SettingField(
            "bool", False, description="Prescriptions wait for payment before the pharmacy"
        ),
    },
)
register_settings_fields(
    "documents",
    {
        "label_language": SettingField("choice", "rw", choices=("rw", "en", "fr")),
    },
)
