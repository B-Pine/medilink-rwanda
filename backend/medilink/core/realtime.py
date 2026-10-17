"""WebSockets (Django Channels), security 06 §8:

- origin must be in WS_ALLOWED_ORIGINS (the frontend allowlist, same as CORS)
- authenticated with the audience session cookie (staff cookie for /ws/v1/staff/...)
- notify-then-fetch messages only; sockets are closed on logout / session revocation

Sprint 0 ships one placeholder authenticated consumer: /ws/v1/staff/ping/ (ping -> pong).
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any

from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.layers import get_channel_layer
from channels.middleware import BaseMiddleware
from channels.routing import URLRouter
from channels.security.websocket import OriginValidator
from channels.sessions import CookieMiddleware
from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.db import transaction
from django.urls import path
from django.utils import timezone

logger = logging.getLogger(__name__)

CLOSE_UNAUTHENTICATED = 4401


def session_group(session_key: str) -> str:
    return "session." + hashlib.sha256(session_key.encode("utf-8")).hexdigest()[:48]


def user_group(user_id: Any) -> str:
    return f"user.{user_id}"


def close_sockets(*, session_key: str | None = None, user_id: Any = None) -> None:
    """Ask every consumer of a session (logout) or of a user (password reset) to disconnect."""
    layer = get_channel_layer()
    if layer is None:
        return
    groups = []
    if session_key:
        groups.append(session_group(session_key))
    if user_id:
        groups.append(user_group(user_id))
    for group in groups:
        try:
            async_to_sync(layer.group_send)(group, {"type": "session.revoked"})
        except Exception:  # never block logout on the channel layer
            logger.warning("Could not notify WebSocket consumers", exc_info=True)


def _resolve_ws_principal(cookies: dict[str, str], path_: str) -> tuple[Any, str | None]:
    from medilink.accounts.principal import Principal, resolve_principal
    from medilink.accounts.session_store import SessionStore
    from medilink.accounts.sessions import audience_for_path, enforce_session_timeouts

    audience = audience_for_path(path_)
    if audience is None:
        return Principal.anonymous(None), None
    session_key = cookies.get(audience.cookie_name)
    session = SessionStore(session_key, audience=audience.name)
    if not enforce_session_timeouts(session, audience):
        return Principal.anonymous(audience.name), None
    with transaction.atomic():
        principal = resolve_principal(session, audience.name)
    if session.modified and not session.is_empty() and session.session_key:
        session.save()
    return principal, session.session_key


class AudienceSessionAuthMiddleware(BaseMiddleware):
    """Puts `principal`, `user` and `session_key` into the scope from the audience cookie."""

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> Any:
        scope = dict(scope)
        principal, session_key = await database_sync_to_async(_resolve_ws_principal)(
            scope.get("cookies", {}), scope.get("path", "")
        )
        scope["principal"] = principal
        scope["user"] = principal.user if principal.is_authenticated else AnonymousUser()
        scope["session_key"] = session_key
        return await super().__call__(scope, receive, send)


class StaffPingConsumer(AsyncJsonWebsocketConsumer):  # type: ignore[misc]
    """Placeholder authenticated staff socket: proves origin checks, session auth and revocation."""

    groups_joined: list[str]

    async def connect(self) -> None:
        principal = self.scope.get("principal")
        if principal is None or principal.audience != "staff" or not principal.is_authenticated:
            await self.close(code=CLOSE_UNAUTHENTICATED)
            return
        self.groups_joined = [
            session_group(self.scope["session_key"]),
            user_group(principal.user.pk),
        ]
        for group in self.groups_joined:
            await self.channel_layer.group_add(group, self.channel_name)
        await self.accept()

    async def disconnect(self, code: int) -> None:
        for group in getattr(self, "groups_joined", []):
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive_json(self, content: Any, **kwargs: Any) -> None:
        if isinstance(content, dict) and content.get("type") == "ping":
            await self.send_json(
                {
                    "type": "pong",
                    "data": {},
                    "sent_at": timezone.now().isoformat().replace("+00:00", "Z"),
                }
            )

    async def session_revoked(self, event: dict[str, Any]) -> None:
        await self.close(code=CLOSE_UNAUTHENTICATED)


websocket_urlpatterns = [
    path("ws/v1/staff/ping/", StaffPingConsumer.as_asgi()),
]


def build_websocket_application() -> Any:
    return OriginValidator(
        CookieMiddleware(AudienceSessionAuthMiddleware(URLRouter(websocket_urlpatterns))),
        list(settings.WS_ALLOWED_ORIGINS),
    )
