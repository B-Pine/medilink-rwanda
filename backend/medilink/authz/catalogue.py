"""Permission catalogue: the permission matrix of analysis 02 §3 as data.

Roles and permissions are seeded into the database by tenancy migration 0002, which holds a
frozen copy of this data. tests/test_roles_seed.py fails if the two drift apart, so a change here
needs a new data migration.
"""

from __future__ import annotations

PERMISSIONS: dict[str, str] = {
    "facility.configure": "Configure the facility: services, rules, tariffs, insurers",
    "staff.manage": "Invite staff and assign roles",
    "schedule.manage": "Manage schedules, leave and closures",
    "schedule.view": "View schedules",
    "leave.request": "Request own leave",
    "booking.manage": "Book, reschedule and cancel on behalf of patients",
    "patient.register": "Register walk-in patients",
    "queue.operate": "Check in, issue tickets, set priority, reorder the queue with a reason",
    "queue.call": "Call next and start consultations",
    "vitals.record": "Record vitals",
    "visit.reason.view": "View the reason for visit",
    "clinical.view": "View clinical records at the facility",
    "clinical.write": "Write clinical records",
    "clinical.sign": "Sign clinical records",
    "clinical.amend_own": "Amend own signed records",
    "prescription.issue": "Issue prescriptions",
    "prescription.view": "View prescriptions and allergies for dispensing",
    "pharmacy.dispense": "Dispense medicines",
    "billing.record_payment": "Create bills, record payments, issue receipts",
    "billing.approve": "Approve voids and refunds",
    "documents.upload": "Upload documents",
    "records.import": "Import legacy records",
    "records.import_clinical": "Enter legacy clinical history",
    "patients.merge_request": "Request a merge of duplicate patients",
    "disputes.raise": "Raise a dispute against the platform",
    "disputes.handle": "Handle facility disputes",
    "disputes.comment": "Comment on disputes assigned to me",
    "reports.view": "View facility reports",
    "reports.view_own": "View reports on my own shift or activity",
    "audit.view": "View the facility audit log",
    "subscription.view": "View and pay the facility subscription",
}

ROLES: dict[str, str] = {
    "facility_admin": "Facility admin",
    "receptionist": "Receptionist",
    "doctor": "Doctor / clinician",
    "pharmacist": "Pharmacist",
}

ROLE_GRANTS: dict[str, frozenset[str]] = {
    "facility_admin": frozenset(
        {
            "facility.configure",
            "staff.manage",
            "schedule.manage",
            "schedule.view",
            "patient.register",
            "queue.operate",
            "visit.reason.view",
            "billing.record_payment",
            "billing.approve",
            "documents.upload",
            "records.import",
            "patients.merge_request",
            "disputes.raise",
            "disputes.handle",
            "reports.view",
            "audit.view",
            "subscription.view",
        }
    ),
    "receptionist": frozenset(
        {
            "schedule.view",
            "booking.manage",
            "patient.register",
            "queue.operate",
            "vitals.record",
            "visit.reason.view",
            "billing.record_payment",
            "documents.upload",
            "disputes.comment",
            "reports.view_own",
        }
    ),
    "doctor": frozenset(
        {
            "leave.request",
            "patient.register",
            "queue.call",
            "vitals.record",
            "visit.reason.view",
            "clinical.view",
            "clinical.write",
            "clinical.sign",
            "clinical.amend_own",
            "prescription.issue",
            "prescription.view",
            "documents.upload",
            "records.import_clinical",
            "disputes.comment",
            "reports.view_own",
        }
    ),
    "pharmacist": frozenset(
        {"prescription.view", "pharmacy.dispense", "disputes.comment", "reports.view_own"}
    ),
}


# ---- Sprint extensions ------------------------------------------------------------------------
# Each sprint keeps its new permission codes and role grants in its own app, in
# `medilink/<app>/permissions.py` exporting `PERMISSIONS: dict[str, str]` and
# `ROLE_GRANTS: dict[str, frozenset[str]]`, seeds them with a data migration in that app, and
# registers them here ONLY between its own markers, e.g.:
#     from medilink.notifications import permissions as _s9   (mark the import noqa E402)
#     extend(_s9.PERMISSIONS, _s9.ROLE_GRANTS)
# Shared-file protocol: docs/architecture/contracts/README.md


def extend(permissions: dict[str, str], role_grants: dict[str, frozenset[str]]) -> None:
    """Add a sprint's permission codes and role grants to the catalogue."""
    clash = set(permissions) & set(PERMISSIONS)
    if clash:
        raise ValueError(f"Permission codes already defined: {sorted(clash)}")
    known = PERMISSIONS.keys() | permissions.keys()
    for role, codes in role_grants.items():  # validate everything before changing anything
        if role not in ROLES:
            raise ValueError(f"Unknown role {role!r}")
        unknown = codes - known
        if unknown:
            raise ValueError(f"Grants for unknown permissions: {sorted(unknown)}")
    PERMISSIONS.update(permissions)
    for role, codes in role_grants.items():
        ROLE_GRANTS[role] = ROLE_GRANTS[role] | codes


# [S1]
# [/S1]
# [S3]
# [/S3]
# [S9]
# [/S9]
