"""Staff two-step sign-in (security.staff_mfa) has one platform-wide value: no facility overrides."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from medilink.onboarding.flags import STAFF_MFA_FLAG

pytestmark = pytest.mark.django_db


def test_facilities_cannot_override_it(platform_client: APIClient, facility: Any) -> None:
    url = f"/api/v1/platform/facilities/{facility.pk}/feature-flags/"
    assert STAFF_MFA_FLAG not in [f["code"] for f in platform_client.get(url).json()]
    put = platform_client.put(f"{url}{STAFF_MFA_FLAG}/", {"is_enabled": False}, format="json")
    assert put.status_code in (403, 404)
