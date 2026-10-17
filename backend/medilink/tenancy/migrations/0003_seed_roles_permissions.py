"""Seed the four facility roles and the permission catalogue (analysis 02 §3, FR-ACC-01/03).

This is a frozen copy of medilink/authz/catalogue.py at the time of writing. Change the catalogue
through a new data migration; tests/test_roles_seed.py checks that both agree.
"""

from django.db import migrations

PERMISSIONS = {
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

ROLES = {
    "facility_admin": (
        "Facility admin",
        [
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
        ],
    ),
    "receptionist": (
        "Receptionist",
        [
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
        ],
    ),
    "doctor": (
        "Doctor / clinician",
        [
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
        ],
    ),
    "pharmacist": (
        "Pharmacist",
        ["prescription.view", "pharmacy.dispense", "disputes.comment", "reports.view_own"],
    ),
}


def seed(apps, schema_editor):
    Permission = apps.get_model("tenancy", "Permission")
    Role = apps.get_model("tenancy", "Role")
    db = schema_editor.connection.alias
    permissions = {}
    for code, description in PERMISSIONS.items():
        permission, _ = Permission.objects.using(db).update_or_create(
            code=code, defaults={"description": description}
        )
        permissions[code] = permission
    for code, (name, grants) in ROLES.items():
        role, _ = Role.objects.using(db).update_or_create(code=code, defaults={"name": name})
        role.permissions.set([permissions[c] for c in grants])


def unseed(apps, schema_editor):
    apps.get_model("tenancy", "Role").objects.using(schema_editor.connection.alias).filter(
        code__in=ROLES
    ).delete()
    apps.get_model("tenancy", "Permission").objects.using(schema_editor.connection.alias).filter(
        code__in=PERMISSIONS
    ).delete()


class Migration(migrations.Migration):
    dependencies = [("tenancy", "0002_row_level_security")]

    operations = [migrations.RunPython(seed, unseed)]
