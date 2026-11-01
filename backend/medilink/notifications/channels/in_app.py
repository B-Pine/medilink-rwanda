"""In-app channel: the inbox row is the delivery; a `notification.created` socket message goes to
`notifications.<audience>.<user_id>` on commit (notify-then-fetch, IDs only)."""

from __future__ import annotations

import logging
from typing import Any, ClassVar

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.utils import timezone

from medilink.notifications.channels import Message, SendResult, Target
from medilink.notifications.templates import LIMITS, TextLimits

logger = logging.getLogger(__name__)


def inbox_group(audience: str, user_id: Any) -> str:
    return f"notifications.{audience}.{user_id}"


def publish(audience: str, user_id: Any, message_type: str, data: dict[str, Any]) -> None:
    layer = get_channel_layer()
    if layer is None:
        return
    try:
        async_to_sync(layer.group_send)(
            inbox_group(audience, user_id),
            {
                "type": "relay",
                "message": {
                    "type": message_type,
                    "data": data,
                    "sent_at": timezone.now().isoformat().replace("+00:00", "Z"),
                },
            },
        )
    except Exception:  # the inbox row exists; the client refetches on reconnect
        logger.warning("notifications.socket_publish_failed", exc_info=True)


class InAppAdapter:
    channel: ClassVar[str] = "in_app"
    interrupts: ClassVar[bool] = False
    limits: ClassVar[TextLimits] = LIMITS["in_app"]

    def is_enabled(self) -> bool:
        return True

    def targets(self, notification: Any) -> list[Target]:
        return [Target(address=str(notification.recipient_user_id))]

    def send(self, message: Message, target: Target) -> SendResult:
        return SendResult(status="sent")
