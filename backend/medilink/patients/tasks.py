"""S3 periodic jobs (contract §5). Tasks take no personal data."""

from __future__ import annotations

from celery import shared_task

from medilink.patients import claims, self_service


@shared_task(name="medilink.patients.tasks.expire_claims")
def expire_claims() -> int:
    return claims.expire_due()


@shared_task(name="medilink.patients.tasks.expire_delegation_invites")
def expire_delegation_invites() -> int:
    return self_service.expire_invites()
