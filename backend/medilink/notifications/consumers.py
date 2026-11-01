"""S9 WebSockets (contract sprint-09 §3.4): `/ws/v1/patient/notifications/` and
`/ws/v1/staff/notifications/`. Notify-then-fetch with IDs only; ping -> pong; more than 30 client
messages a minute closes with 4429. Consumers join the session and user groups, so logout and
password reset close them."""

from __future__ import annotations

import time
from typing import Any

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.utils import timezone

from medilink.core.realtime import CLOSE_UNAUTHENTICATED, session_group, user_group
from medilink.notifications.channels.in_app import inbox_group

CLOSE_RATE_LIMITED = 4429
MAX_MESSAGES_PER_MINUTE = 30


class _NotificationsConsumer(AsyncJsonWebsocketConsumer):
    audience = "patient"
    groups_joined: list[str]

    async def connect(self) -> None:
        principal = self.scope.get("principal")
        if (
            principal is None
            or principal.audience != self.audience
            or not principal.is_authenticated
        ):
            await self.close(code=CLOSE_UNAUTHENTICATED)
            return
        self.groups_joined = [
            session_group(self.scope["session_key"]),
            user_group(principal.user.pk),
            inbox_group(self.audience, principal.user.pk),
        ]
        self._window: list[float] = []
        for group in self.groups_joined:
            await self.channel_layer.group_add(group, self.channel_name)
        await self.accept()

    async def disconnect(self, code: int) -> None:
        for group in getattr(self, "groups_joined", []):
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive_json(self, content: Any, **kwargs: Any) -> None:
        now = time.monotonic()
        self._window = [t for t in self._window if now - t < 60] + [now]
        if len(self._window) > MAX_MESSAGES_PER_MINUTE:
            await self.close(code=CLOSE_RATE_LIMITED)
            return
        if isinstance(content, dict) and content.get("type") == "ping":
            await self.send_json(
                {
                    "type": "pong",
                    "data": {},
                    "sent_at": timezone.now().isoformat().replace("+00:00", "Z"),
                }
            )

    async def relay(self, event: dict[str, Any]) -> None:
        await self.send_json(event["message"])

    async def session_revoked(self, event: dict[str, Any]) -> None:
        await self.close(code=CLOSE_UNAUTHENTICATED)


class PatientNotificationsConsumer(_NotificationsConsumer):
    audience = "patient"


class StaffNotificationsConsumer(_NotificationsConsumer):
    audience = "staff"
