from django.apps import AppConfig
from django.db.models.signals import post_migrate

FUNCTIONS = ("reports_platform_figures(date, date)",)


class ReportsConfig(AppConfig):
    name = "medilink.reports"
    label = "reports"
    verbose_name = "Reports"

    def ready(self) -> None:
        from medilink.facilities import db

        post_migrate.connect(db.grant_execute(FUNCTIONS), sender=self, weak=False)
