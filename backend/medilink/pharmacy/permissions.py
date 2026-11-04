"""S7 permission codes and role grants (contract sprint-07 §4), registered in the [S7] block of
authz/catalogue.py and seeded by pharmacy migrations 0002 and 0004 (keep them in step)."""

PERMISSIONS: dict[str, str] = {
    "pharmacy.availability": "Mark catalogue drugs available or not at the facility",
    # W5 (upgrade 13 §3): receive stock, adjust it with a reason, set low-stock thresholds
    "pharmacy.stock": "Receive and adjust medicine stock at the facility",
}

ROLE_GRANTS: dict[str, frozenset[str]] = {
    "pharmacist": frozenset({"pharmacy.availability", "pharmacy.stock"}),
    "facility_admin": frozenset({"pharmacy.availability", "pharmacy.stock"}),
}
