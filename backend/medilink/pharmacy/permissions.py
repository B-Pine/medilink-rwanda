"""S7 permission codes and role grants (contract sprint-07 §4), registered in the [S7] block of
authz/catalogue.py and seeded by pharmacy migration 0002 (keep both in step)."""

PERMISSIONS: dict[str, str] = {
    "pharmacy.availability": "Mark catalogue drugs available or not at the facility",
}

ROLE_GRANTS: dict[str, frozenset[str]] = {
    "pharmacist": frozenset({"pharmacy.availability"}),
    "facility_admin": frozenset({"pharmacy.availability"}),
}
