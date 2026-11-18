"""Background image work: the Google profile photo as a patient's first avatar."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from celery import shared_task

from medilink.images import services

logger = logging.getLogger(__name__)


@shared_task(name="medilink.images.tasks.import_google_photo", ignore_result=True)
def import_google_photo(user_id: str, picture_url: str) -> bool:
    """Copy the Google photo to Cloudinary and make it the account's own profile photo, only while
    that profile has no photo yet (a photo the patient chose is never replaced). True when set."""
    from medilink.patients import photos
    from medilink.patients.models import PatientLink, Relationship
    from medilink.tenancy.context import rls_context

    if not picture_url or not services.is_configured():
        return False
    with rls_context(user_id=user_id):
        link = (
            PatientLink.objects.select_related("patient")
            .filter(account_id=UUID(user_id), relationship=Relationship.SELF)
            .first()
        )
        patient: Any = link.patient if link else None
        if patient is None or patient.avatar_public_id or patient.photo_file_id:
            return False
    try:
        public_id = services.import_remote(picture_url, "patient_avatar")
    except Exception:  # Cloudinary or Google unreachable: the patient can add a photo later
        logger.warning("Google photo import failed", exc_info=True)
        return False
    with rls_context(user_id=user_id):
        patient.refresh_from_db(fields=["avatar_public_id", "photo_file", "version"])
        if patient.avatar_public_id or patient.photo_file_id:
            return False  # the patient chose one meanwhile
        return photos.set_avatar(patient, public_id)
