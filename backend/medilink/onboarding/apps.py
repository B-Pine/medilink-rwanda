from typing import Any

from django.apps import AppConfig
from django.db.models.signals import post_migrate


class OnboardingConfig(AppConfig):
    name = "medilink.onboarding"
    label = "onboarding"
    verbose_name = "Facility onboarding"

    def ready(self) -> None:
        from medilink.accounts import security_checks  # noqa: F401  (registers the check)

        post_migrate.connect(_revoke_event_writes, sender=self)


def _revoke_event_writes(sender: Any = None, using: str = "default", **kwargs: Any) -> None:
    """Events are never changed by the runtime role. Facility status events are never deleted;
    application events go only with their application (stale draft purge, contract §5)."""
    from medilink.masterdata.db import revoke

    revoke(
        (),
        ("onboarding_facility_status_event",),
        using=using,
        no_update=("onboarding_application_event",),
    )
