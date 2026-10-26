"""S4-B14, B15: outbox publishing and WebSocket auth/groups (notify-then-fetch, IDs only)."""

from __future__ import annotations

from typing import Any

from asgiref.sync import async_to_sync, sync_to_async
from rest_framework.test import APIClient

from medilink.tenancy.context import rls_context
from medilink.visits import outbox
from medilink.visits.models import OutboxEvent
from tests.conftest import login_patient
from tests.s4.conftest import S, check_in, register
from tests.test_b14_celery_channels import ALLOWED_ORIGIN, _connect, ws_db  # noqa: F401


def _publish_pending(clinic: Any) -> None:
    for event in OutboxEvent.objects.filter(published_at__isnull=True).order_by("created_at"):
        outbox.publish(event.pk)


def test_rolled_back_change_publishes_nothing(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    django_capture_on_commit_callbacks: Any,
) -> None:
    with django_capture_on_commit_callbacks(execute=False) as callbacks:
        response = check_in(
            desk[0], register(clinic, desk[1], "Ana One"), catalogue["service"]["id"]
        )
    assert response.status_code == 201
    assert len(callbacks) >= 2  # published only after commit
    payloads = list(OutboxEvent.objects.values_list("payload", flat=True))
    assert all("Ana" not in str(p) for p in payloads)  # IDs only


def test_staff_socket_gets_queue_changes_and_rejects_patients(
    ws_db: Any,  # noqa: F811
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    patient_account: tuple[Any, Any],
) -> None:
    key = desk[0].cookies["ml_staff"].value
    user, record = patient_account
    patient = APIClient()
    login_patient(patient, user)
    patient_key = patient.cookies["ml_patient"].value

    def do_check_in() -> dict[str, Any]:
        ticket = check_in(desk[0], record, catalogue["service"]["id"]).json()["ticket"]
        with rls_context(facility_id=clinic.pk):
            _publish_pending(clinic)
        return ticket

    async def scenario() -> None:
        wrong, _ = _connect("/ws/v1/staff/queue/", ALLOWED_ORIGIN, f"ml_patient={patient_key}")
        assert not (await wrong.connect())[0]
        staff_socket, _ = _connect("/ws/v1/staff/queue/", ALLOWED_ORIGIN, f"ml_staff={key}")
        assert (await staff_socket.connect())[0]
        patient_socket, _ = _connect(
            "/ws/v1/patient/visits/", ALLOWED_ORIGIN, f"ml_patient={patient_key}"
        )
        assert (await patient_socket.connect())[0]
        ticket = await sync_to_async(do_check_in)()
        message = await staff_socket.receive_json_from()
        assert message == {
            "type": "queue.changed",
            "service_id": ticket["service_id"],
            "stage": "consultation",
        }
        visit = await patient_socket.receive_json_from()
        assert visit == {"type": "visit.changed", "visit_id": ticket["visit_id"]}
        await staff_socket.disconnect()
        await patient_socket.disconnect()

    async_to_sync(scenario)()


def test_display_socket_needs_a_valid_token(
    ws_db: Any,  # noqa: F811
    clinic: Any,
    catalogue: dict[str, Any],
    admin: tuple[APIClient, Any],
    desk: tuple[APIClient, Any],
) -> None:
    token = (
        admin[0]
        .post(
            f"{S}display-links/",
            {"label": "Hall", "service_ids": [catalogue["service"]["id"]]},
            format="json",
        )
        .json()["token"]
    )

    def do_check_in() -> None:
        check_in(desk[0], register(clinic, desk[1], "Ana One"), catalogue["service"]["id"])
        with rls_context(facility_id=clinic.pk):
            _publish_pending(clinic)

    async def scenario() -> None:
        bad, _ = _connect("/ws/v1/display/wrong/", ALLOWED_ORIGIN)
        assert not (await bad.connect())[0]
        socket, _ = _connect(f"/ws/v1/display/{token}/", ALLOWED_ORIGIN)
        assert (await socket.connect())[0]
        await sync_to_async(do_check_in)()
        assert await socket.receive_json_from() == {"type": "display.changed"}
        await socket.disconnect()

    async_to_sync(scenario)()
