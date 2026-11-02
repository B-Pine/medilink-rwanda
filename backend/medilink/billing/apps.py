from django.apps import AppConfig
from django.db.models.signals import post_migrate

FUNCTIONS = ("billing_patient_bills(uuid)",)
APPEND_ONLY = (
    "billing_bill_event",
    "billing_insurance_verification",
    "billing_credit_note",
    "billing_refund_payout",
)


class BillingConfig(AppConfig):
    name = "medilink.billing"
    label = "billing"
    verbose_name = "Billing"

    def ready(self) -> None:
        from medilink.billing import receivers, settings_fields  # noqa: F401
        from medilink.facilities import db

        post_migrate.connect(db.grant_execute(FUNCTIONS, APPEND_ONLY), sender=self, weak=False)
