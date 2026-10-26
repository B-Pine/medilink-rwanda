"""S4 WebSockets (contract sprint-04 §3.3): notify-then-fetch, IDs only.

Staff and patient sockets are authenticated by the audience cookie (core.realtime middleware);
display sockets by the display token. All join the session/user groups where they have one, so
logout and deactivation close them.
"""

from __future__ import annotations

from typing import Any

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.db import connection

from medilink.core.realtime import CLOSE_UNAUTHENTICATED, session_group, user_group
from medilink.visits import outbox

QUEUE_PERMISSIONS = ("queue.operate", "queue.call", "pharmacy.dispense")


class _Relay(AsyncJsonWebsocketConsumer):
    groups_joined: list[str]

    async def _join(self, groups: list[str]) -> None:
        self.groups_joined = groups
        for group in groups:
            await self.channel_layer.group_add(group, self.channel_name)

    async def disconnect(self, code: int) -> None:
        for group in getattr(self, "groups_joined", []):
            await self.channel_layer.group_discard(group, self.channel_name)

    async def relay(self, event: dict[str, Any]) -> None:
        await self.send_json(event["message"])

    async def session_revoked(self, event: dict[str, Any]) -> None:
        await self.close(code=CLOSE_UNAUTHENTICATED)

    async def receive_json(self, content: Any, **kwargs: Any) -> None:
        if isinstance(content, dict) and content.get("type") == "ping":
            await self.send_json({"type": "pong"})


class StaffQueueConsumer(_Relay):
    async def connect(self) -> None:
        principal = self.scope.get("principal")
        if (
            principal is None
            or principal.audience != "staff"
            or not principal.is_authenticated
            or principal.active_facility_id is None
            or not any(code in principal.permissions for code in QUEUE_PERMISSIONS)
        ):
            await self.close(code=CLOSE_UNAUTHENTICATED)
            return
        await self._join(
            [
                session_group(self.scope["session_key"]),
                user_group(principal.user.pk),
                outbox.queue_group(principal.active_facility_id),
            ]
        )
        await self.accept()


def _patient_ids(account_id: Any) -> list[str]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT patient_id FROM visits_account_patients(%s)", [account_id])
        return [str(row[0]) for row in cursor.fetchall()]


class PatientVisitsConsumer(_Relay):
    async def connect(self) -> None:
        principal = self.scope.get("principal")
        if principal is None or principal.audience != "patient" or not principal.is_authenticated:
            await self.close(code=CLOSE_UNAUTHENTICATED)
            return
        patients = await database_sync_to_async(_patient_ids)(principal.user.pk)
        await self._join(
            [
                session_group(self.scope["session_key"]),
                user_group(principal.user.pk),
                *[outbox.visit_group(p) for p in patients],
            ]
        )
        await self.accept()


def _display_link(token: str) -> tuple[str, list[str]] | None:
    from medilink.visits.views import find_display_link

    link = find_display_link(token)
    if link is None:
        return None
    return str(link.facility_id), [str(s) for s in link.service_ids]


class DisplayConsumer(_Relay):
    services: list[str]

    async def connect(self) -> None:
        token = self.scope.get("url_route", {}).get("kwargs", {}).get("token", "")
        found = await database_sync_to_async(_display_link)(token)
        if found is None:
            await self.close(code=CLOSE_UNAUTHENTICATED)
            return
        facility_id, self.services = found
        await self._join([outbox.display_group(facility_id)])
        await self.accept()

    async def relay(self, event: dict[str, Any]) -> None:
        message = event["message"]
        service_id = message.get("service_id")
        if service_id is None or service_id in self.services:
            await self.send_json({"type": "display.changed"})
