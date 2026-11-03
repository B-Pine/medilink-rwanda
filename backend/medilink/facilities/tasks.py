"""S2 periodic jobs (contract §5). Tasks take no personal data."""

from celery import shared_task

from medilink.facilities import clinician, staff


@shared_task(name="medilink.facilities.tasks.expire_invitations")
def expire_invitations() -> int:
    return staff.expire_invitations()


@shared_task(name="medilink.facilities.tasks.check_clinician_licences")
def check_clinician_licences() -> dict[str, int]:
    from medilink.tenancy.context import rls_context

    with rls_context():
        return clinician.check_licences()
