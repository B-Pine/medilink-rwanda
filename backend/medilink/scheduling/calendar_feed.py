"""Private calendar subscription feed (contract sprint-05 §2.2 Calendar, FR-SCH-11, D-6). The token
is 32 random bytes, shown once and stored as SHA-256; one active feed per account; revocable. The
feed lists the confirmed bookings of the account's own and guarded profiles, with facility,
service, time and booking code only."""

from __future__ import annotations

import hashlib
import secrets
from typing import Any

from django.db import connection, transaction
from django.utils import timezone

from medilink.audit.services import record
from medilink.scheduling.models import CalendarFeed
from medilink.tenancy.context import rls_context


def hash_token(token: str) -> bytes:
    return hashlib.sha256(token.encode("utf-8")).digest()


def active(account: Any) -> CalendarFeed | None:
    with rls_context(user_id=account.pk):
        return CalendarFeed.objects.filter(account=account, revoked_at__isnull=True).first()


def _revoke(feed: CalendarFeed, request: Any) -> None:
    feed.revoked_at = timezone.now()
    feed.save(update_fields=["revoked_at", "updated_at"])
    record(
        "scheduling.calendar_feed.revoke",
        request=request,
        object_type="scheduling.calendar_feed",
        object_id=feed.pk,
    )


def create(account: Any, request: Any) -> tuple[CalendarFeed, str]:
    """A new link; the previous one stops working."""
    token = secrets.token_urlsafe(32)
    with transaction.atomic(), rls_context(user_id=account.pk):
        for old in CalendarFeed.objects.select_for_update().filter(
            account=account, revoked_at__isnull=True
        ):
            _revoke(old, request)
        feed = CalendarFeed.objects.create(account=account, token_hash=hash_token(token))
    record(
        "scheduling.calendar_feed.create",
        request=request,
        object_type="scheduling.calendar_feed",
        object_id=feed.pk,
    )
    return feed, token


def revoke(account: Any, request: Any) -> bool:
    with transaction.atomic(), rls_context(user_id=account.pk):
        feeds = list(
            CalendarFeed.objects.select_for_update().filter(
                account=account, revoked_at__isnull=True
            )
        )
        for feed in feeds:
            _revoke(feed, request)
    return bool(feeds)


def find(token: str) -> Any:
    """The account of an active feed token, or None (SECURITY DEFINER lookup by hash)."""
    if not token or len(token) > 100:
        return None
    with connection.cursor() as cursor:
        cursor.execute("SELECT scheduling_find_feed(%s)", [hash_token(token)])
        row = cursor.fetchone()
    return row[0] if row else None


def touch(account_id: Any) -> None:
    with rls_context(user_id=account_id):
        CalendarFeed.objects.filter(account_id=account_id, revoked_at__isnull=True).update(
            last_accessed_at=timezone.now()
        )


def booking_refs(account_id: Any) -> list[tuple[Any, Any]]:
    """(booking_id, facility_id) of the confirmed bookings for the feed."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT booking_id, facility_id FROM scheduling_feed_bookings(%s)", [account_id]
        )
        return cursor.fetchall()
