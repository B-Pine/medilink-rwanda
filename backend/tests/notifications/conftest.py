"""Notification tests run "in the daytime" unless marked `real_clock`.

Patient deliveries are held during quiet hours (default 21:00-06:00 Africa/Kigali), so a test
that does not fix the clock would fail every evening. Tests that check quiet hours themselves
are marked `real_clock` and set the time they need.
"""

from __future__ import annotations

from collections.abc import Iterator
from unittest import mock

import pytest


@pytest.fixture(autouse=True)
def _daytime(request: pytest.FixtureRequest) -> Iterator[None]:
    if request.node.get_closest_marker("real_clock"):
        yield
        return
    with mock.patch("medilink.notifications.preferences.in_quiet_hours", return_value=False):
        yield
