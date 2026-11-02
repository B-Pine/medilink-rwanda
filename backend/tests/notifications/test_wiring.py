"""S9b catalogue wiring (contract sprint-09 §11): domain signals reach the right people."""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

import pytest

from medilink.notifications import wiring
from medilink.notifications import wiring_events as ev
from medilink.notifications.models import Notification
from medilink.scheduling import booking as svc
from medilink.tenancy.context import rls_context
from tests.factories import UserFactory
from tests.s2.conftest import membership_of
from tests.s4.conftest import (  # noqa: F401
    call_next,
    check_in,
    on_duty,
    patient_account,
)
from tests.s5.conftest import (  # noqa: F401
    Clock,
    admin,
    book,
    bookable,
    catalogue,
    clinic,
    clock,
    desk,
    doctor,
    first_slot,
    patient_client,
)
from tests.s6.conftest import drugs, patient_keys, pharmacist  # noqa: F401
from tests.s7.conftest import AMOX, S, dispense, draft, sign

pytestmark = pytest.mark.django_db


def notices(user: Any, event: str) -> list[Notification]:
    return list(Notification.objects.filter(recipient_user=user, event_type=event))


def test_every_wired_event_is_registered_with_three_languages() -> None:
    from medilink.notifications import registry

    for definition in ev.EVENTS:
        assert registry.get(definition.type) is definition
        languages = {lang for (_c, lang, _v) in definition.templates}
        assert languages == {"rw", "en", "fr"}, definition.type


def test_booking_confirmed_and_staff_cancellation(
    clock: Clock,  # noqa: F811
    clinic: Any,  # noqa: F811
    bookable: dict[str, Any],  # noqa: F811
    doctor: Any,  # noqa: F811
    django_capture_on_commit_callbacks: Any,
) -> None:
    client, user = patient_client("wired@example.test", "Uwase Wired")
    slot = first_slot(clinic, bookable["service_id"], after=clock.now + dt.timedelta(hours=3))
    with django_capture_on_commit_callbacks(execute=True):
        made = book(client, user, slot)
    assert made.status_code == 201, made.content
    [confirmed] = notices(user, ev.BOOKING_CONFIRMED)
    assert "Gisozi Clinic" in confirmed.body or "Gisozi Clinic" in confirmed.title
    booking = made.json()

    # the patient's own cancellation sends nothing; a facility cancellation does
    membership = membership_of(doctor[1], clinic)
    with django_capture_on_commit_callbacks(execute=True), rls_context(facility_id=clinic.pk):
        svc.cancel(
            booking["id"],
            version=booking["version"],
            who=svc.Who(user=doctor[1], membership=membership),
            reason_code="facility_request",
        )
    [cancelled] = notices(user, ev.BOOKING_CANCELLED)
    assert cancelled.facility_id == clinic.pk


def test_pharmacy_and_document_notices(
    clinic: Any,  # noqa: F811
    catalogue: dict[str, Any],  # noqa: F811
    desk: Any,  # noqa: F811
    doctor: Any,  # noqa: F811
    pharmacist: Any,  # noqa: F811
    drugs: Any,  # noqa: F811
    patient_account: tuple[Any, Any],  # noqa: F811
    django_capture_on_commit_callbacks: Any,
) -> None:
    user, record = patient_account
    visit = check_in(desk[0], record, catalogue["service"]["id"]).json()
    c = draft(doctor[0], visit["visit_id"])
    assert (
        doctor[0]
        .post(f"{S}consultations/{c['id']}/prescription/items/", AMOX, format="json")
        .status_code
        == 201
    )
    note = doctor[0].post(
        f"{S}consultations/{c['id']}/sick-notes/",
        {"rest_from": "2026-11-02", "rest_to": "2026-11-03"},
        format="json",
    )
    assert note.status_code == 201, note.content
    with django_capture_on_commit_callbacks(execute=True):
        assert sign(doctor[0], c["id"]).status_code == 200
    [ready] = notices(user, ev.RX_READY)
    assert "Amoxicillin" not in ready.body  # no medicine names in notices
    assert notices(pharmacist[1], ev.RX_TO_DISPENSE)
    assert len(notices(user, ev.DOCUMENT_READY)) == 1  # the sick note, not the prescription

    p = doctor[0].get(f"{S}consultations/{c['id']}/prescription/").json()
    with django_capture_on_commit_callbacks(execute=True):
        raised = pharmacist[0].post(
            f"{S}prescriptions/{p['id']}/queries/", {"message": "Dose?"}, format="json"
        )
    assert raised.status_code == 201, raised.content
    [query] = notices(doctor[1], ev.RX_QUERY)
    assert query.audience == "staff"

    with django_capture_on_commit_callbacks(execute=True):
        given = dispense(pharmacist[0], p, {"item_id": p["items"][0]["id"], "outcome": "full"})
    assert given.status_code == 201, given.content
    assert notices(user, ev.RX_DISPENSED)


def test_call_tells_the_patient_where_to_go(
    clinic: Any,  # noqa: F811
    catalogue: dict[str, Any],  # noqa: F811
    desk: Any,  # noqa: F811
    doctor: Any,  # noqa: F811
    patient_account: tuple[Any, Any],  # noqa: F811
    django_capture_on_commit_callbacks: Any,
) -> None:
    user, record = patient_account
    service_id = catalogue["service"]["id"]
    assert check_in(desk[0], record, service_id).status_code == 201
    on_duty(doctor[0], catalogue["point"]["id"])
    with django_capture_on_commit_callbacks(execute=True):
        called = call_next(doctor[0], service_id)
    assert called.status_code == 200, called.content
    [notice] = notices(user, ev.TICKET_CALLED)
    assert notice.priority == "critical"
    assert catalogue["point"]["name"] in notice.title


def test_receivers_never_raise_and_platform_events_reach_admins() -> None:
    admin_user = UserFactory(is_platform_admin=True)
    # unknown rows: logged, never raised (the domain change already committed)
    wiring.booking_confirmed(None, booking_id=uuid.uuid4(), facility_id=uuid.uuid4())
    wiring.prescription_ready(None, prescription_id=uuid.uuid4(), facility_id=uuid.uuid4())
    merge_id = uuid.uuid4()
    wiring.merge_requested(None, merge_id=merge_id)
    [merge] = notices(admin_user, ev.MERGE_REQUESTED)
    assert merge.audience == "staff"
