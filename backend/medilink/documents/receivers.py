"""Sign the consultation's draft letters and requests with it (contract sprint-07 §3.3 CR1).
Runs inside S6's signing transaction: an error here rolls the signature back."""

from __future__ import annotations

from typing import Any

from django.dispatch import receiver

from medilink.clinical.signals import consultation_signed
from medilink.documents import services


@receiver(consultation_signed, dispatch_uid="documents.sign_drafts")
def sign_drafts(sender: Any, consultation: Any, request: Any, **kwargs: Any) -> None:
    services.sign_drafts(consultation, request=request)
