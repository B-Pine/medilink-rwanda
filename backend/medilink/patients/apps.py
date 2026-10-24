from typing import Any

from celery.schedules import crontab
from django.apps import AppConfig
from django.db.models.signals import post_migrate

BEAT_SCHEDULE = {
    "patients.expire_claims": {
        "task": "medilink.patients.tasks.expire_claims",
        "schedule": crontab(minute="*/15"),
    },
    "patients.expire_delegation_invites": {
        "task": "medilink.patients.tasks.expire_delegation_invites",
        "schedule": crontab(hour=0, minute=0),  # 02:00 Kigali
    },
}


class PatientsConfig(AppConfig):
    name = "medilink.patients"
    label = "patients"
    verbose_name = "Patients"

    def ready(self) -> None:
        from config.celery import app
        from medilink.patients import checks  # noqa: F401  (registers system checks)
        from medilink.patients.cards import register_insurance_card_purpose
        from medilink.patients.insurance import on_upload_scanned
        from medilink.uploads.services import upload_scanned

        post_migrate.connect(_grant_functions, sender=self)
        app.conf.beat_schedule = {**(app.conf.beat_schedule or {}), **BEAT_SCHEDULE}
        register_insurance_card_purpose()
        upload_scanned.connect(on_upload_scanned, dispatch_uid="patients.insurance_card")


def _grant_functions(sender: Any = None, using: str = "default", **kwargs: Any) -> None:
    """The runtime role may call the SECURITY DEFINER functions (contract §2.1); the audit link
    and merge events are append-only (UPDATE/DELETE also rejected by triggers)."""
    from django.conf import settings
    from django.db import connections

    connection = connections[using]
    if connection.vendor != "postgresql":
        return
    role = settings.DATABASE_APP_ROLE
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT current_user, EXISTS (SELECT 1 FROM pg_roles WHERE rolname = %s)", [role]
        )
        current_user, exists = cursor.fetchone()
        if not exists or current_user == role:
            return
        cursor.execute("SELECT to_regprocedure('patients_known_elsewhere(uuid, uuid)')")
        if cursor.fetchone()[0] is None:  # migrated back below 0003
            return
        quoted = connection.ops.quote_name(role)
        cursor.execute(
            f"GRANT EXECUTE ON FUNCTION patients_known_elsewhere(uuid, uuid) TO {quoted}"
        )
        cursor.execute(f"GRANT EXECUTE ON FUNCTION patients_facilities_of(uuid) TO {quoted}")
        for table in ("patients_audit_link", "patients_merge_event"):
            cursor.execute(f"REVOKE UPDATE, DELETE, TRUNCATE ON {table} FROM {quoted}")
