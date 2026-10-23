"""S3 permission codes and role grants (contract §4), registered in the [S3] block of
authz/catalogue.py and seeded by patients migration 0003 (keep both in step)."""

PERMISSIONS: dict[str, str] = {
    "patients.view": "Search and view patient records at the facility",
    "patients.identifier_reveal": "Unmask patient identifiers with a reason",
    "patients.insurance_verify": "Mark an insurance card verified or rejected",
    "patients.merge_approve": "Approve, reject or undo patient merges at the facility",
}

ROLE_GRANTS: dict[str, frozenset[str]] = {
    "facility_admin": frozenset(
        {
            "patients.view",
            "patients.identifier_reveal",
            "patients.insurance_verify",
            "patients.merge_approve",
        }
    ),
    "receptionist": frozenset(
        {
            "patients.view",
            "patients.identifier_reveal",
            "patients.insurance_verify",
            "patients.merge_request",
        }
    ),
    "doctor": frozenset({"patients.view"}),
}
