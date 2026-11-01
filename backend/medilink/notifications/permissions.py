"""S9 permission codes and role grants (contract sprint-09 §4), registered in the [S9] block of
authz/catalogue.py and seeded by notifications migration 0002 (keep both in step)."""

PERMISSIONS: dict[str, str] = {
    "announcements.manage": "Write, publish and withdraw facility announcements",
}

ROLE_GRANTS: dict[str, frozenset[str]] = {
    "facility_admin": frozenset({"announcements.manage"}),
}
