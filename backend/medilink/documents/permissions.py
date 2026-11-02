"""S7b permission codes and role grants (contract sprint-07 §4), registered in the [S7] block of
authz/catalogue.py and seeded by documents migration 0004 (keep both in step)."""

PERMISSIONS: dict[str, str] = {
    "documents.print": "Print documents released to the patient",
}

ROLE_GRANTS: dict[str, frozenset[str]] = {
    "receptionist": frozenset({"documents.print"}),
    "pharmacist": frozenset({"documents.print"}),
}
