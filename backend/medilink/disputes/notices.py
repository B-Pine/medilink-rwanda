"""After-commit notices for disputes (contract sprint-10b §4). Never raises."""

from __future__ import annotations

import logging
from typing import Any

from medilink.disputes import notification_events as ev
from medilink.notifications.recipients import Recipients
from medilink.notifications.service import notify
from medilink.tenancy.context import rls_context

logger = logging.getLogger(__name__)


def send(kind: str, *, dispute_id: Any, facility_id: Any, user_id: Any = None) -> None:
    try:
        _send(kind, dispute_id, facility_id, user_id)
    except Exception:
        logger.exception("dispute notice failed", extra={"kind": kind})


def _send(kind: str, dispute_id: Any, facility_id: Any, user_id: Any) -> None:
    from medilink.disputes.models import Dispute
    from medilink.tenancy.models import Facility

    with rls_context(facility_id=facility_id):
        d = Dispute.objects.get(pk=dispute_id)
        event_id = d.events.order_by("-occurred_at").values_list("pk", flat=True).first() or d.pk
        name = str(Facility.objects.values_list("name", flat=True).get(pk=facility_id))
        if kind == "updated":
            notify(
                ev.UPDATED,
                Recipients.patient(d.patient_id),
                {"facility_name": name, "dispute_id": d.pk, "event_id": event_id},
                facility_id=facility_id,
                patient_id=d.patient_id,
            )
        elif kind == "opened":
            target = (
                Recipients.platform_admins()
                if d.handler_level == "platform"
                else Recipients.facility_staff(facility_id, permission="disputes.handle")
            )
            notify(
                ev.OPENED,
                target,
                {"dispute_id": d.pk, "event_id": event_id},
                facility_id=facility_id,
            )
        elif kind == "comment_requested":
            req = d.comment_requests.order_by("-created_at").first()
            notify(
                ev.COMMENT_REQUESTED,
                Recipients.users(user_id, audience="staff"),
                {"dispute_id": d.pk, "request_id": req.pk if req else d.pk},
                facility_id=facility_id,
            )
        elif kind == "escalated":
            notify(
                ev.ESCALATED,
                Recipients.platform_admins(),
                {"facility_name": name, "dispute_id": d.pk, "event_id": event_id},
            )
