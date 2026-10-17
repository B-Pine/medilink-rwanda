"""B14: Celery JSON-only; Channels ASGI app with origin validation and an authenticated consumer."""

from __future__ import annotations

import json
from typing import Any
from unittest import mock

import pytest
from asgiref.sync import async_to_sync
from asgiref.testing import ApplicationCommunicator
from channels.layers import get_channel_layer
from channels.security.websocket import OriginValidator
from rest_framework.test import APIClient

from medilink.core.realtime import build_websocket_application, close_sockets, session_group
from tests.conftest import login_patient, login_staff

pytestmark = pytest.mark.acceptance("B14")

ALLOWED_ORIGIN = b"http://localhost:5173"


def test_b14_celery_is_json_only() -> None:
    from config.celery import app

    assert app.conf.task_serializer == "json"
    assert app.conf.result_serializer == "json"
    assert app.conf.event_serializer == "json"
    assert list(app.conf.accept_content) == ["json"]
    assert list(app.conf.result_accept_content) == ["json"]
    assert app.conf.result_backend is None
    assert app.conf.task_time_limit and app.conf.task_soft_time_limit


def test_b14_account_tasks_are_registered_and_take_ids_only() -> None:
    from config.celery import app
    from medilink.accounts import tasks

    app.loader.import_default_modules()
    assert "medilink.accounts.tasks.send_password_reset_email" in app.tasks
    assert tasks.send_password_reset_email.ignore_result is True
    assert tasks.send_password_reset_email.time_limit == 30


def test_b14_asgi_application_validates_origins() -> None:
    from config.asgi import application

    websocket_app = application.application_mapping["websocket"]
    assert isinstance(websocket_app, OriginValidator)
    assert websocket_app.allowed_origins == ["http://localhost:5173", "http://localhost:5174"]


class WebsocketCommunicator(ApplicationCommunicator):  # type: ignore[misc]
    """Minimal ASGI WebSocket test client (channels.testing needs daphne, which we don't ship)."""

    def __init__(self, application: Any, path: str, headers: list[tuple[bytes, bytes]]) -> None:
        scope = {
            "type": "websocket",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "headers": headers,
            "subprotocols": [],
            "scheme": "ws",
            "server": ("testserver", 80),
            "client": ("127.0.0.1", 50000),
        }
        super().__init__(application, scope)

    async def connect(self, timeout: float = 2) -> tuple[bool, Any]:
        await self.send_input({"type": "websocket.connect"})
        response = await self.receive_output(timeout)
        if response["type"] == "websocket.close":
            return False, response.get("code", 1000)
        return True, response.get("subprotocol")

    async def send_json_to(self, data: Any) -> None:
        await self.send_input({"type": "websocket.receive", "text": json.dumps(data)})

    async def receive_json_from(self, timeout: float = 2) -> Any:
        return json.loads((await self.receive_output(timeout))["text"])

    async def disconnect(self, code: int = 1000, timeout: float = 2) -> None:
        await self.send_input({"type": "websocket.disconnect", "code": code})
        await self.wait(timeout)


def _connect(path: str, origin: bytes, cookie: str | None = None) -> tuple[Any, Any]:
    headers = [(b"origin", origin)]
    if cookie:
        headers.append((b"cookie", cookie.encode()))
    return WebsocketCommunicator(build_websocket_application(), path, headers=headers), None


@pytest.fixture
def ws_db(db: Any) -> Any:
    # channels closes "old" DB connections around database_sync_to_async calls, which would end
    # the test transaction; keep the connection for the duration of the test.
    with mock.patch("channels.db.close_old_connections", return_value=None):
        yield


def test_b14_authenticated_staff_socket_ping_pong_and_revocation(
    ws_db: Any, staff_user: Any
) -> None:
    client = APIClient()
    login_staff(client, staff_user)
    key = client.cookies["ml_staff"].value

    async def scenario() -> None:
        communicator, _ = _connect("/ws/v1/staff/ping/", ALLOWED_ORIGIN, f"ml_staff={key}")
        connected, _ = await communicator.connect()
        assert connected
        await communicator.send_json_to({"type": "ping"})
        message = await communicator.receive_json_from()
        assert message["type"] == "pong" and message["sent_at"].endswith("Z")
        await communicator.send_json_to({"type": "other"})
        assert await communicator.receive_nothing()
        await get_channel_layer().group_send(session_group(key), {"type": "session.revoked"})
        closed = await communicator.receive_output()
        assert closed == {"type": "websocket.close", "code": 4401}
        await communicator.disconnect()

    async_to_sync(scenario)()


def test_b14_disallowed_origin_is_rejected(ws_db: Any, staff_user: Any) -> None:
    client = APIClient()
    login_staff(client, staff_user)
    key = client.cookies["ml_staff"].value

    async def scenario() -> None:
        communicator, _ = _connect("/ws/v1/staff/ping/", b"https://evil.example", f"ml_staff={key}")
        connected, _ = await communicator.connect()
        assert not connected

    async_to_sync(scenario)()


@pytest.mark.parametrize("cookie", [None, "ml_staff=not-a-session"])
def test_b14_anonymous_socket_is_closed(ws_db: Any, cookie: str | None) -> None:
    async def scenario() -> None:
        communicator, _ = _connect("/ws/v1/staff/ping/", ALLOWED_ORIGIN, cookie)
        connected, code = await communicator.connect()
        assert not connected
        assert code == 4401

    async_to_sync(scenario)()


def test_b14_patient_session_cannot_open_staff_socket(ws_db: Any, patient_user: Any) -> None:
    client = APIClient()
    login_patient(client, patient_user)
    key = client.cookies["ml_patient"].value

    async def scenario() -> None:
        communicator, _ = _connect(
            "/ws/v1/staff/ping/", ALLOWED_ORIGIN, f"ml_staff={key}; ml_patient={key}"
        )
        connected, _ = await communicator.connect()
        assert not connected

    async_to_sync(scenario)()


def test_b14_close_sockets_notifies_session_and_user_groups() -> None:
    layer = mock.Mock()
    sent: list[str] = []

    async def group_send(group: str, message: dict[str, Any]) -> None:
        sent.append(group)

    layer.group_send = group_send
    with mock.patch("medilink.core.realtime.get_channel_layer", return_value=layer):
        close_sockets(session_key="abc", user_id="u-1")
    assert sent == [session_group("abc"), "user.u-1"]

    async def broken(group: str, message: dict[str, Any]) -> None:
        raise ConnectionError("redis down")

    layer.group_send = broken
    with mock.patch("medilink.core.realtime.get_channel_layer", return_value=layer):
        close_sockets(session_key="abc")  # never raises: logout must not depend on Redis
    with mock.patch("medilink.core.realtime.get_channel_layer", return_value=None):
        close_sockets(session_key="abc")
