"""`notify()` (contract sprint-09 §3.1) and the delivery rules of §2.5.

Call it inside the caller's transaction: it writes the notification and attempt rows; socket
messages and sends happen on commit, so a rolled-back business action notifies no one. It never
raises for delivery problems, only for programming errors (`NotifyError`).
"""

from __future__ import annotations

import datetime as dt
import logging
import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone

from medilink.core.ids import uuid7
from medilink.notifications import channels, content_policy, preferences, registry, templates
from medilink.notifications.models import (
    AttemptStatus,
    Audience,
    DeliveryAttempt,
    FailureReason,
    Notification,
    Priority,
)
from medilink.notifications.recipients import Recipient, RecipientSpec
from medilink.notifications.registry import EventDefinition

logger = logging.getLogger("medilink.notifications")

BATCH = 200


class NotifyError(Exception):
    """A programming error: unknown event, undeclared context key, non-ID data, a placeholder kind
    not allowed for a channel, or a call outside a transaction."""


@dataclass
class NotifyResult:
    created: list[Any] = field(default_factory=list)
    duplicates: int = 0
    rate_limited: int = 0


def _is_id(value: Any) -> bool:
    if isinstance(value, uuid.UUID):
        return True
    if isinstance(value, int) and not isinstance(value, bool):
        return True
    if isinstance(value, str):
        try:
            uuid.UUID(value)
            return True
        except ValueError:
            return False
    return False


def _check_context(definition: EventDefinition, context: Mapping[str, Any]) -> dict[str, str]:
    allowed = set(definition.placeholders) | set(definition.data_keys)
    undeclared = set(context) - allowed
    if undeclared:
        raise NotifyError(f"Undeclared context keys for {definition.type}: {sorted(undeclared)}")
    data: dict[str, str] = {}
    for key in definition.data_keys:
        if key not in context:
            continue
        if not _is_id(context[key]):
            raise NotifyError(f"Data key {key!r} must be an ID")
        data[key] = str(context[key])
    return data


def _audience_for(definition: EventDefinition, recipient: Recipient, user: Any) -> str:
    if recipient.audience:
        return recipient.audience
    if definition.audience != "account":
        return definition.audience
    from medilink.accounts.principal import is_staff_member
    from medilink.tenancy.context import rls_context

    with rls_context(user_id=user.pk):
        return Audience.STAFF if is_staff_member(user) else Audience.PATIENT


class _Default(dict[str, Any]):
    def __missing__(self, key: str) -> str:
        raise KeyError(key)


def _dedupe_key(definition: EventDefinition, override: str | None, data: dict[str, str]) -> str:
    pattern = override or definition.dedupe
    values = _Default(type=definition.type, **data)
    if "id" not in values and data:
        values["id"] = next(iter(data.values()))
    try:
        key = pattern.format_map(values)
    except KeyError:
        key = f"{definition.type}:{uuid7()}"  # nothing to dedupe on
    return key[:120]


def _action_path(definition: EventDefinition, notification_id: Any, data: dict[str, str]) -> str:
    try:
        path = definition.action_path.format_map(_Default(id=str(notification_id), **data))
    except KeyError:
        path = f"/notifications/{notification_id}"
    return path if path.startswith("/") else f"/notifications/{notification_id}"


def _rate_limited(definition: EventDefinition, user_id: Any) -> bool:
    limit, window = definition.rate_limit
    since = timezone.now() - window
    return (
        Notification.objects.filter(
            recipient_user_id=user_id, event_type=definition.type, created_at__gte=since
        ).count()
        >= limit
    )


def _expiry(definition: EventDefinition, now: dt.datetime) -> dt.datetime | None:
    return now + definition.ttl if definition.ttl else None


def notify(
    event: str,
    recipients: RecipientSpec | Sequence[RecipientSpec],
    context: Mapping[str, Any],
    *,
    facility_id: Any = None,
    patient_id: Any = None,
    priority: str | None = None,
    is_for_today: bool = False,
    dedupe_key: str | None = None,
    announcement_id: Any = None,
    channels: Sequence[str] | None = None,
) -> NotifyResult:
    if not transaction.get_connection().in_atomic_block:
        raise NotifyError("notify() must run inside the caller's transaction")
    definition = registry.get(event)
    data = _check_context(definition, context)
    narrowed = channels
    level = priority or definition.priority
    if level not in Priority.values:
        raise NotifyError(f"Unknown priority {level!r}")
    specs = [recipients] if isinstance(recipients, RecipientSpec) else list(recipients)
    resolved: list[Recipient] = [r for spec in specs for r in spec.resolve()]

    from medilink.accounts.models import User

    users = {str(u.pk): u for u in User.objects.filter(pk__in={str(r.user_id) for r in resolved})}
    result = NotifyResult()
    now = timezone.now()
    created: list[tuple[Notification, list[DeliveryAttempt]]] = []
    for recipient in resolved:
        user = users.get(str(recipient.user_id))
        if user is None or not user.is_active:
            continue
        key = _dedupe_key(definition, dedupe_key, data)
        if Notification.objects.filter(recipient_user_id=user.pk, dedupe_key=key).exists():
            result.duplicates += 1
            continue
        if _rate_limited(definition, user.pk):
            result.rate_limited += 1
            logger.info("notifications.rate_limited", extra={"event_type": definition.type})
            continue
        audience = _audience_for(definition, recipient, user)
        about = recipient.patient_id or patient_id
        notification = _create(
            definition,
            user=user,
            audience=audience,
            variant=recipient.variant,
            level=level,
            context=context,
            data=data,
            key=key,
            facility_id=facility_id if audience == Audience.STAFF or facility_id else None,
            patient_id=about,
            is_for_today=is_for_today,
            announcement_id=announcement_id,
            now=now,
        )
        if notification is None:
            result.duplicates += 1
            continue
        attempts = _plan_attempts(notification, definition, user, narrowed, now)
        created.append((notification, attempts))
        result.created.append(notification.pk)

    def _on_commit() -> None:
        from medilink.notifications import tasks
        from medilink.notifications.channels.in_app import publish

        for notification, attempts in created:
            publish(
                notification.audience,
                notification.recipient_user_id,
                "notification.created",
                {
                    "id": str(notification.pk),
                    "priority": notification.priority,
                    "patient_id": str(notification.patient_id) if notification.patient_id else None,
                    **(
                        {"facility_id": str(notification.facility_id)}
                        if notification.audience == Audience.STAFF and notification.facility_id
                        else {}
                    ),
                },
            )
            for attempt in attempts:
                if attempt.status == AttemptStatus.QUEUED:
                    tasks.send_attempt.delay(str(attempt.pk))

    transaction.on_commit(_on_commit)
    return result


def _create(
    definition: EventDefinition,
    *,
    user: Any,
    audience: str,
    variant: str,
    level: str,
    context: Mapping[str, Any],
    data: dict[str, str],
    key: str,
    facility_id: Any,
    patient_id: Any,
    is_for_today: bool,
    announcement_id: Any,
    now: dt.datetime,
) -> Notification | None:
    language = (getattr(user, "preferred_language", "") or "rw")[:2]
    template = templates.active(definition.type, "in_app", language, variant)
    if template is None:
        raise NotifyError(f"No in-app template for {definition.type}")
    values = templates.format_context(definition, dict(context), template.language)
    title, body = templates.render_text(template, values)
    if content_policy.clinical_terms(f"{title}\n{body}"):
        raise NotifyError(f"Clinical content in the in-app text of {definition.type}")
    notification_id = uuid7()
    notification = Notification(
        id=notification_id,
        recipient_user=user,
        audience=audience,
        facility_id=facility_id,
        patient_id=patient_id,
        announcement_id=announcement_id,
        event_type=definition.type,
        priority=level,
        template_code=template.code,
        template_version=template.template_version,
        variant=template.variant,
        language=template.language,
        title=title[:120],
        body=body[:1000],
        action_path=_action_path(definition, notification_id, data)[:200],
        data=data,
        placeholder_values=values,
        dedupe_key=key,
        is_for_today=is_for_today,
        expires_at=_expiry(definition, now),
    )
    try:
        with transaction.atomic():
            notification.save(force_insert=True)
    except IntegrityError:  # a concurrent duplicate won the race
        return None
    return notification


def _attempt(
    notification: Notification,
    channel: str,
    status: str,
    now: dt.datetime,
    *,
    scheduled_for: dt.datetime | None = None,
    reason: str | None = None,
    subscription_id: Any = None,
    is_fallback: bool = False,
    attempt_no: int = 1,
) -> DeliveryAttempt:
    finished = status in (AttemptStatus.SKIPPED, AttemptStatus.SENT)
    return DeliveryAttempt.objects.create(
        notification=notification,
        channel=channel,
        attempt_no=attempt_no,
        is_fallback=is_fallback,
        push_subscription_id=subscription_id,
        status=status,
        scheduled_for=scheduled_for or now,
        queued_at=now,
        sent_at=now if status == AttemptStatus.SENT else None,
        finished_at=now if finished else None,
        failure_reason=reason,
    )


def _bypasses_quiet_hours(notification: Notification, definition: EventDefinition) -> bool:
    return (
        definition.mandatory
        or notification.priority == Priority.CRITICAL
        or (notification.priority == Priority.IMPORTANT and notification.is_for_today)
    )


def _plan_attempts(
    notification: Notification,
    definition: EventDefinition,
    user: Any,
    narrowed: Sequence[str] | None,
    now: dt.datetime,
    *,
    channel_list: Sequence[str] | None = None,
    is_fallback: bool = False,
) -> list[DeliveryAttempt]:
    """In-app (always), then each wanted channel: queued, held (quiet hours) or skipped."""
    attempts: list[DeliveryAttempt] = []
    if not is_fallback:
        attempts.append(_attempt(notification, "in_app", AttemptStatus.SENT, now))
    wanted = list(channel_list if channel_list is not None else definition.channels)
    if narrowed is not None:
        wanted = [c for c in wanted if c in narrowed]
    wanted = [c for c in dict.fromkeys(wanted) if c != "in_app"]
    prefs = preferences.effective(user, notification.audience)
    allowed = set(prefs.channels.get(notification.priority, []))
    quiet = notification.audience == Audience.PATIENT and preferences.in_quiet_hours(
        prefs.quiet_hours, now
    )
    for channel in wanted:
        adapter = channels.get(channel)
        if adapter is None or not adapter.is_enabled():
            attempts.append(
                _attempt(
                    notification,
                    channel,
                    AttemptStatus.SKIPPED,
                    now,
                    reason=FailureReason.NO_TARGET,
                    is_fallback=is_fallback,
                )
            )
            continue
        if (
            not definition.mandatory
            and notification.audience == Audience.PATIENT
            and (channel not in allowed)
        ):
            attempts.append(
                _attempt(
                    notification,
                    channel,
                    AttemptStatus.SKIPPED,
                    now,
                    reason=FailureReason.PREFERENCE_OFF,
                    is_fallback=is_fallback,
                )
            )
            continue
        if (
            templates.active(definition.type, channel, notification.language, notification.variant)
            is None
        ):
            attempts.append(
                _attempt(
                    notification,
                    channel,
                    AttemptStatus.SKIPPED,
                    now,
                    reason=FailureReason.NO_TEMPLATE,
                    is_fallback=is_fallback,
                )
            )
            continue
        targets = adapter.targets(notification)
        if not targets:
            attempts.append(
                _attempt(
                    notification,
                    channel,
                    AttemptStatus.SKIPPED,
                    now,
                    reason=FailureReason.NO_TARGET,
                    is_fallback=is_fallback,
                )
            )
            continue
        held = adapter.interrupts and quiet and not _bypasses_quiet_hours(notification, definition)
        status = AttemptStatus.HELD if held else AttemptStatus.QUEUED
        when = (
            preferences.quiet_hours_end(prefs.quiet_hours, now)
            if held and prefs.quiet_hours
            else now
        )
        for target in targets:
            attempts.append(
                _attempt(
                    notification,
                    channel,
                    status,
                    now,
                    scheduled_for=when,
                    subscription_id=target.subscription_id,
                    is_fallback=is_fallback,
                )
            )
    if not is_fallback and notification.priority == Priority.CRITICAL:
        interrupting = [a for a in attempts if a.channel != "in_app"]
        if interrupting and all(a.status == AttemptStatus.SKIPPED for a in interrupting):
            attempts.extend(queue_fallback(notification, definition, user, now))
    return attempts


def fallback_channels(definition: EventDefinition, level: str) -> list[str]:
    extra = channels.CHANNEL_POLICY["extra_fallback"].get(level, ())
    return list(dict.fromkeys([*definition.fallback, *extra]))


def queue_fallback(
    notification: Notification, definition: EventDefinition, user: Any, now: dt.datetime
) -> list[DeliveryAttempt]:
    """Fallback channels once per notification (critical: at once; important: when unread)."""
    if notification.fallback_done_at is not None:
        return []
    wanted = fallback_channels(definition, notification.priority)
    notification.fallback_done_at = now
    notification.save(update_fields=["fallback_done_at", "updated_at"])
    if not wanted:
        return []
    return _plan_attempts(
        notification, definition, user, None, now, channel_list=wanted, is_fallback=True
    )
