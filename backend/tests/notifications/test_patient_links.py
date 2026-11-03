"""Upgrade 12: booking, queue, medicine and document notifications open pages of the patient
/dashboard app; staff links are unchanged."""

from __future__ import annotations

import uuid

from django.test import override_settings

from medilink.notifications import tasks, wiring_events


def test_patient_event_links_point_into_the_dashboard() -> None:
    patient = [e for e in wiring_events.EVENTS if e.audience == "patient"]
    assert patient
    for event in patient:
        assert event.action_path.startswith("/dashboard/"), event.type
    by_type = {e.type: e.action_path for e in wiring_events.EVENTS}
    assert by_type[wiring_events.BOOKING_CONFIRMED] == "/dashboard/appointments/{booking_id}"
    assert by_type[wiring_events.TICKET_CALLED] == "/dashboard/queue/{visit_id}"
    assert by_type[wiring_events.RX_TO_DISPENSE] == "/pharmacy/prescriptions/{prescription_id}"


@override_settings(PATIENT_APP_URL="https://app.example/", STAFF_APP_URL="https://staff.example")
def test_inbox_links_per_app() -> None:
    nid = uuid.uuid4()
    assert tasks.inbox_url("patient", nid) == f"https://app.example/dashboard/notifications/{nid}"
    assert tasks.inbox_url("staff", nid) == f"https://staff.example/notifications/{nid}"
