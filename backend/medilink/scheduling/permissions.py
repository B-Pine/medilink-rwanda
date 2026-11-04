"""W7 permission codes and role grants (upgrade 13 W7), registered in the [W7] block of
authz/catalogue.py and seeded by scheduling migration 0009 (keep both in step).

Only clinicians plan vaccinations and antenatal visits: an antenatal entry says a patient is
pregnant, so reception and the facility admin do not get it."""

PERMISSIONS: dict[str, str] = {
    "care_schedule.manage": "Plan vaccination and antenatal visit dates for a patient",
}

ROLE_GRANTS: dict[str, frozenset[str]] = {
    "doctor": frozenset({"care_schedule.manage"}),
}
