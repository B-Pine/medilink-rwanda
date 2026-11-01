"""S6 permission codes and role grants (contract sprint-06 §4), registered in the [S6] block of
authz/catalogue.py and seeded by clinical migration 0002 (keep both in step)."""

PERMISSIONS: dict[str, str] = {
    "clinical.unsigned_list": "See the list of unsigned clinical records, without content",
}

ROLE_GRANTS: dict[str, frozenset[str]] = {
    "facility_admin": frozenset({"clinical.unsigned_list"}),
    "doctor": frozenset({"clinical.unsigned_list"}),
}
