"""Security notifications wired in S9 (contract sprint-09 §3.1, security 03 §5), with no Sprint 0
file changes: Django's login/logout signals and the audit log's post_save.

Observers only register `transaction.on_commit` -> a Celery task with IDs; they never raise into
the login, logout or audit flow.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import re
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger("medilink.notifications")

_VERSION = re.compile(r"[\d._]+")


def device_hash(user_id: Any, user_agent: str) -> bytes:
    """HMAC-SHA256 of user ID + user agent with version numbers stripped (updates are not new
    devices)."""
    normalised = _VERSION.sub("", user_agent or "")[:400]
    key = settings.SECRET_KEY.encode("utf-8")
    return hmac.new(key, f"{user_id}|{normalised}".encode(), hashlib.sha256).digest()


def device_label(user_agent: str) -> str:
    """ "Chrome on Android": browser and platform only, never the full user agent."""
    ua = user_agent or ""
    browser = next(
        (
            name
            for token, name in (
                ("Edg/", "Edge"),
                ("OPR/", "Opera"),
                ("Firefox/", "Firefox"),
                ("SamsungBrowser/", "Samsung Internet"),
                ("Chrome/", "Chrome"),
                ("Safari/", "Safari"),
            )
            if token in ua
        ),
        "A browser",
    )
    platform = next(
        (
            name
            for token, name in (
                ("Android", "Android"),
                ("iPhone", "iPhone"),
                ("iPad", "iPad"),
                ("Windows", "Windows"),
                ("Mac OS X", "Mac"),
                ("Linux", "Linux"),
            )
            if token in ua
        ),
        "",
    )
    return (f"{browser} on {platform}" if platform else browser)[:60]


def session_hash(session_key: str) -> bytes:
    return hashlib.sha256(session_key.encode("utf-8")).digest()


def _audience(request: Any) -> str | None:
    from medilink.accounts.sessions import audience_for_path

    audience = audience_for_path(getattr(request, "path", "") or "")
    return audience.name if audience else None


def on_user_logged_in(sender: Any, request: Any, user: Any, **_: Any) -> None:
    try:
        audience = _audience(request)
        if audience is None:
            return
        ua = request.META.get("HTTP_USER_AGENT", "") if request is not None else ""
        args = (str(user.pk), audience, device_hash(user.pk, ua).hex(), device_label(ua))

        from medilink.notifications import tasks

        transaction.on_commit(lambda: tasks.observe_login.delay(*args))
    except Exception:
        logger.warning("notifications.observe_login_failed", exc_info=True)


def on_user_logged_out(sender: Any, request: Any, user: Any, **_: Any) -> None:
    """Patient logout revokes the push subscriptions bound to that session (shared phones)."""
    try:
        if user is None or _audience(request) != "patient":
            return
        session_key = getattr(getattr(request, "session", None), "session_key", None)
        if not session_key:
            return
        revoke_subscriptions(user_id=user.pk, session_key=session_key, reason="logout")
    except Exception:
        logger.warning("notifications.observe_logout_failed", exc_info=True)


def on_audit_entry_saved(sender: Any, instance: Any, created: bool, **_: Any) -> None:
    if not created or instance.action not in WATCHED_ACTIONS:
        return
    try:
        from medilink.notifications import tasks

        entry_id = str(instance.pk)
        transaction.on_commit(lambda: tasks.observe_audit_entry.delay(entry_id))
    except Exception:
        logger.warning("notifications.observe_audit_failed", exc_info=True)


WATCHED_ACTIONS = frozenset({"auth.mfa.enrolled", "auth.password_reset.completed"})


def revoke_subscriptions(*, user_id: Any, reason: str, session_key: str | None = None) -> int:
    from medilink.audit.services import record
    from medilink.notifications.models import PushSubscription

    qs = PushSubscription.objects.filter(user_id=user_id, revoked_at__isnull=True)
    if session_key is not None:
        qs = qs.filter(session_key_hash=session_hash(session_key))
    rows = list(qs)
    now = timezone.now()
    for sub in rows:
        sub.revoked_at = now
        sub.revoked_reason = reason
        sub.save(update_fields=["revoked_at", "revoked_reason", "updated_at"])
        record(
            "notifications.push.unsubscribed",
            actor=None,
            object_type="notifications.push_subscription",
            object_id=sub.pk,
            metadata={
                "subscription_id": str(sub.pk),
                "endpoint_host": sub.endpoint_host,
                "reason": reason,
            },
        )
    return len(rows)


def handle_login(user_id: str, audience: str, digest: bytes, label: str) -> None:
    from medilink.notifications.models import KnownDevice
    from medilink.notifications.recipients import Recipients
    from medilink.notifications.service import notify

    now = timezone.now()
    with transaction.atomic():
        had_device = KnownDevice.objects.filter(user_id=user_id).exists()
        device, created = KnownDevice.objects.get_or_create(
            user_id=user_id,
            device_hash=digest,
            defaults={"label": label, "last_seen_at": now},
        )
        if not created:
            device.last_seen_at = now
            device.save(update_fields=["last_seen_at", "updated_at"])
            return
        if not had_device:  # the first-ever device (sign-up, first login) does not notify
            return
        notify(
            "account.login.new_device",
            Recipients.users(user_id, audience=audience),
            {"device_label": label, "date": now, "time": now, "device_id": device.pk},
        )


def handle_audit_entry(entry_id: Any) -> None:
    from medilink.audit.models import AuditEntry
    from medilink.notifications.recipients import Recipients
    from medilink.notifications.service import notify

    entry = AuditEntry.objects.filter(pk=entry_id).first()
    if entry is None or entry.actor_id is None:
        return
    with transaction.atomic():
        if entry.action == "auth.mfa.enrolled":
            notify(
                "account.mfa.enrolled",
                Recipients.users(entry.actor_id, audience="staff"),
                {"date": entry.occurred_at, "time": entry.occurred_at, "entry_id": entry.pk},
            )
        elif entry.action == "auth.password_reset.completed":
            notify(
                "account.password.changed",
                Recipients.users(entry.actor_id),
                {"date": entry.occurred_at, "time": entry.occurred_at, "entry_id": entry.pk},
            )
            revoke_subscriptions(user_id=entry.actor_id, reason="password_reset")
