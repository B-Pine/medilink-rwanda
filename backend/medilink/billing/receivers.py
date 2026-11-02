"""Open the bill on check-in and void it when the visit is cancelled (contract sprint-08 D-1).

`on_ticket_event` is sent after the visit's transaction committed, so a failure here must not
break the request: the bill also opens on its first read.
"""

from __future__ import annotations

import logging
from typing import Any

from django.dispatch import receiver

from medilink.visits.services import on_ticket_event

logger = logging.getLogger(__name__)


@receiver(on_ticket_event, dispatch_uid="billing.on_ticket_event")
def on_ticket(sender: Any, *, action: str, visit_id: Any, facility_id: Any, **kwargs: Any) -> None:
    if action not in ("check_in", "cancel"):
        return
    from medilink.billing import bills
    from medilink.tenancy.context import rls_context
    from medilink.visits.models import Visit

    try:
        with rls_context(facility_id=facility_id):
            visit = Visit.objects.filter(pk=visit_id).first()
            if visit is None:
                return
            if action == "check_in":
                bills.open_bill(visit)
            else:
                bills.on_visit_cancelled(visit)
    except Exception:  # the bill opens on first read; never fail the committed request
        logger.exception("billing.on_ticket_event_failed", extra={"visit_id": str(visit_id)})
