"""Completion guard (contract sprint-06 §2.2 Completion, D-6, FR-CLN-05).

A consultation-stage ticket cannot complete or move to the next stage while its visit has a
draft consultation. Implemented as a `pre_save` receiver so the S4 queue code stays unchanged;
the raised 422 rolls back the whole ticket action.
"""

from __future__ import annotations

from typing import Any

from django.db.models.signals import pre_save
from django.dispatch import Signal, receiver
from django.utils.translation import gettext_lazy as _

from medilink.core.exceptions import BusinessRuleViolation

UNSIGNED = _("Sign the consultation or mark the draft entered in error before finishing.")
_CLOSING = ("completed", "moved_to_next_stage")


@receiver(pre_save, sender="visits.Ticket", dispatch_uid="clinical-completion-guard")
def refuse_close_with_draft(
    sender: Any, instance: Any, update_fields: Any = None, **_: Any
) -> None:
    if instance.stage != "consultation" or instance.state not in _CLOSING:
        return
    if update_fields is not None and "state" not in update_fields:
        return
    from medilink.clinical.models import Consultation, ConsultationStatus

    if Consultation.objects.filter(
        visit_id=instance.visit_id, status=ConsultationStatus.DRAFT
    ).exists():
        raise BusinessRuleViolation(UNSIGNED)


# [S7] Sent by services.sign() inside its transaction, after the record is locked
# (contract sprint-07 D-1): kwargs `consultation`, `request`. A receiver that raises rolls the
# signing back, so S7 issues the prescription atomically with the signature.
consultation_signed = Signal()
# [/S7]
