"""Issue the prescription when the consultation is signed (contract sprint-07 D-1). Runs inside
S6's signing transaction: an error here rolls the signature back."""

from __future__ import annotations

from typing import Any

from django.dispatch import receiver

from medilink.clinical.signals import consultation_signed
from medilink.pharmacy import services


@receiver(consultation_signed, dispatch_uid="pharmacy.issue_on_sign")
def issue_on_sign(sender: Any, consultation: Any, request: Any, **kwargs: Any) -> None:
    services.issue(consultation, request=request)
