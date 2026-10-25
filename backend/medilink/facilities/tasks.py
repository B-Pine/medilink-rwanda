"""S2 periodic jobs (contract §5). Tasks take no personal data."""

from celery import shared_task

from medilink.facilities import staff


@shared_task(name="medilink.facilities.tasks.expire_invitations")
def expire_invitations() -> int:
    return staff.expire_invitations()
