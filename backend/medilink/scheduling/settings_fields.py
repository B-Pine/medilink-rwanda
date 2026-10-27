"""Booking and queue settings added by S5 (contract sprint-05 §2.2), in the S2 sections."""

from medilink.facilities.settings_schema import SettingField, register_settings_fields

register_settings_fields(
    "booking",
    {
        "max_active": SettingField("int", 3, minimum=1, maximum=10),
        "remote_join_cutoff": SettingField(
            "choice",
            "11:00",
            choices=("09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"),
        ),
        "disruption_reply_hours": SettingField("int", 24, minimum=1, maximum=72),
    },
)
register_settings_fields(
    "queue",
    {
        "grace_before_minutes": SettingField("int", 30, minimum=0, maximum=120),
        "grace_after_minutes": SettingField("int", 15, minimum=0, maximum=60),
        "booked_ratio": SettingField("choice", "1:2", choices=("1:1", "1:2", "2:1", "1:3")),
        "pass_over_places": SettingField("int", 5, minimum=1, maximum=20),
        "pass_over_limit": SettingField("int", 2, minimum=0, maximum=5),
    },
)
