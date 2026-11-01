from django.apps import AppConfig
from django.db.models.signals import post_migrate

FUNCTIONS = ("clinical_patient_records(uuid)",)
APPEND_ONLY = ("clinical_addendum", "authz_access_reason")


class ClinicalConfig(AppConfig):
    name = "medilink.clinical"
    label = "clinical"
    verbose_name = "Clinical record"

    def ready(self) -> None:
        from medilink.clinical import signals  # noqa: F401  (completion guard, contract D-6)
        from medilink.facilities import db

        post_migrate.connect(db.grant_execute(FUNCTIONS, APPEND_ONLY), sender=self, weak=False)
