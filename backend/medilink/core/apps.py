from django.apps import AppConfig
from django.db.models.signals import post_migrate


class CoreConfig(AppConfig):
    name = "medilink.core"
    label = "core"
    verbose_name = "Core"

    def ready(self) -> None:
        from medilink.core import checks  # noqa: F401  (registers system checks)
        from medilink.core.db import grant_app_role_privileges

        post_migrate.connect(grant_app_role_privileges, sender=self)
