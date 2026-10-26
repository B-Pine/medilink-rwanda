"""Queue settings added by S4 (contract §2.2), in the S2 `queue` section."""

from medilink.facilities.settings_schema import SettingField, register_settings_fields

register_settings_fields(
    "queue",
    {
        "start_stage": SettingField(
            "choice", "consultation", choices=("consultation", "reception")
        ),
        "no_response_places": SettingField("int", 3, minimum=1, maximum=10),
        "no_response_limit": SettingField("int", 2, minimum=0, maximum=5),
        "return_priority": SettingField("bool", True),
        "step_out_max_minutes": SettingField("int", 30, minimum=5, maximum=120),
        "end_of_day_minutes": SettingField("int", 60, minimum=0, maximum=240),
    },
)
