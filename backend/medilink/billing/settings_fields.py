"""S8 facility settings (contract sprint-08 §7)."""

from medilink.facilities.settings_schema import SettingField, register_settings_fields

register_settings_fields(
    "billing",
    {
        "waiver_approval_threshold_rwf": SettingField(
            "int",
            0,
            minimum=0,
            maximum=10_000_000,
            description="Waivers above this amount need approval (0: every waiver)",
        ),
    },
)
