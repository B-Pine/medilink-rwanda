"""S10 part 1 permission codes and role grants (contract sprint-10 §4), registered in the [S10]
block of authz/catalogue.py and seeded by support migration 0002 (keep both in step)."""

PERMISSIONS: dict[str, str] = {
    "support.view_facility": "See support requests opened by the facility's staff",
}

ROLE_GRANTS: dict[str, frozenset[str]] = {
    "facility_admin": frozenset({"support.view_facility"}),
}
