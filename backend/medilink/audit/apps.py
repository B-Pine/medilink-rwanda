from django.apps import AppConfig


class AuditConfig(AppConfig):
    name = "medilink.audit"
    label = "audit"
    verbose_name = "Audit log"
