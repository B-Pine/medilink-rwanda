"""The public Contact page (upgrade 11 §13): a visitor's message lands in the platform inbox."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from medilink.audit.models import AuditEntry
from medilink.support.models import ContactMessage
from tests.conftest import login_staff
from tests.factories import make_staff

pytestmark = pytest.mark.django_db

PUBLIC = "/api/v1/public/contact/"
INBOX = "/api/v1/platform/contact-messages/"


def _message(**extra: Any) -> dict[str, str]:
    return {
        "name": "Aline U.",
        "reach": "aline@example.test",
        "subject": "Facility missing",
        "message": "Our clinic in Huye is not listed yet. How do we join?",
        **extra,
    }


def test_visitor_message_reaches_the_platform_inbox(facility: Any) -> None:
    sent = APIClient().post(PUBLIC, _message(), format="json")
    assert sent.status_code == 201, sent.content
    reference = sent.json()["reference"]
    assert reference.startswith("CM-")
    entry = AuditEntry.objects.get(action="support.contact.received")
    assert entry.metadata == {"reference": reference}  # no name or text in the audit trail

    # health details are refused, as for support requests
    clinical = APIClient().post(
        PUBLIC, _message(message="I have malaria and a fever since Monday."), format="json"
    )
    assert clinical.status_code == 400
    assert ContactMessage.objects.count() == 1

    platform = APIClient()
    login_staff(
        platform, make_staff(None, email="plat.contact@example.test", is_platform_admin=True)
    )
    admin = APIClient()
    login_staff(admin, make_staff(facility, roles=("facility_admin",)))
    assert admin.get(INBOX).status_code == 403
    assert APIClient().get(INBOX).status_code in (401, 403)

    inbox = platform.get(f"{INBOX}?status=new").json()
    assert [row["reference"] for row in inbox["results"]] == [reference]
    row = inbox["results"][0]
    assert row["reach"] == "aline@example.test" and row["handled_by"] is None

    done = platform.post(
        f"{INBOX}{row['id']}/handled/", {"note": "Replied by email"}, format="json"
    )
    assert done.status_code == 200, done.content
    assert done.json()["status"] == "handled" and done.json()["note"] == "Replied by email"
    again = platform.post(f"{INBOX}{row['id']}/handled/", {}, format="json")
    assert again.status_code == 409
    assert platform.get(f"{INBOX}?status=new").json()["results"] == []
    assert platform.get(f"{INBOX}?q={reference}").json()["count"] == 1
