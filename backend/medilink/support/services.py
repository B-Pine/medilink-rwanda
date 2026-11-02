"""Support request and help article rules (contract sprint-10 §2.3, §2.4, §3.1).

Every function runs inside the request transaction (the tenancy middleware opens it), so the
audit entry, the state change and the notification rows commit or roll back together.
"""

from __future__ import annotations

import re
import secrets
from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions

from medilink.accounts.models import User
from medilink.audit.services import record
from medilink.core.exceptions import BusinessRuleViolation, Conflict
from medilink.notifications.content_policy import clinical_terms
from medilink.notifications.recipients import Recipients
from medilink.notifications.service import notify
from medilink.support import audit_actions as actions
from medilink.support import notification_events as events
from medilink.support.models import (
    ArticleStatus,
    Audience,
    AuthorKind,
    HelpArticle,
    RequestStatus,
    SupportMessage,
    SupportRequest,
)

MAX_OPEN_REQUESTS = 5
REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

HEALTH_DETAILS = _(
    "Please don't include health details here. For questions about your care, contact your "
    "facility."
)
CLOSED_MESSAGE = _("This request is closed. Open a new one if you still need help.")
OPEN_LIMIT = _(
    "You already have 5 open requests. Close one, or add to an open one, before opening another."
)
ALREADY_CLOSED = _("This request is already closed.")


def _invalid(field: str, message: Any) -> exceptions.ValidationError:
    return exceptions.ValidationError({field: [message]})


def clean_text(field: str, value: str) -> str:
    """Refuse control characters and clinical terms (the terms found are not echoed)."""
    if _CONTROL.search(value):
        raise _invalid(field, _("Remove special characters from this text."))
    if clinical_terms(value):
        raise _invalid(field, HEALTH_DETAILS)
    return value


def new_reference() -> str:
    return "SR-" + "".join(secrets.choice(REFERENCE_ALPHABET) for _ in range(6))


def _platform_recipients(request: SupportRequest) -> Any:
    if request.assigned_to_id is not None:
        return Recipients.users(request.assigned_to_id, audience="staff")
    return Recipients.platform_admins()


def _notify_requester(event: str, request: SupportRequest, context: dict[str, Any]) -> None:
    notify(
        event,
        Recipients.users(request.requester_id, audience=request.requester_audience),  # type: ignore[arg-type]
        context,
        facility_id=request.facility_id,
    )


# ---------------------------------------------------------------------------------------------
# Support requests
# ---------------------------------------------------------------------------------------------


def open_request(
    *,
    http_request: Any,
    user: User,
    audience: str,
    facility_id: Any,
    topic: str,
    subject: str,
    body: str,
    client_label: str,
    client_path: str,
) -> SupportRequest:
    subject = clean_text("subject", subject)
    body = clean_text("body", body)
    # Lock the account row, so two parallel posts can't both pass the open-request limit.
    User.objects.select_for_update().filter(pk=user.pk).first()
    open_count = SupportRequest.objects.for_requester(user, audience).active().count()
    if open_count >= MAX_OPEN_REQUESTS:
        raise BusinessRuleViolation(OPEN_LIMIT)
    now = timezone.now()
    support_request: SupportRequest | None = None
    for _attempt in range(5):
        try:
            with transaction.atomic():
                support_request = SupportRequest.objects.create(
                    reference=new_reference(),
                    requester=user,
                    requester_audience=audience,
                    facility_id=facility_id if audience == Audience.STAFF else None,
                    topic=topic,
                    subject=subject,
                    language=(user.preferred_language or "rw")[:2],
                    client_label=client_label[:60],
                    client_path=client_path,
                    last_message_at=now,
                )
            break
        except IntegrityError:  # reference collision: try another one
            continue
    if support_request is None:  # pragma: no cover - 5 collisions in a 31^6 space
        raise RuntimeError("Could not allocate a support request reference")
    SupportMessage.objects.create(
        request=support_request, author=user, author_kind=AuthorKind.REQUESTER, body=body
    )
    record(
        actions.REQUEST_CREATED,
        request=http_request,
        object_type="support_request",
        object_id=support_request.pk,
        metadata={
            "request_id": str(support_request.pk),
            "audience": audience,
            "topic": topic,
        },
    )
    notify(
        events.CREATED,
        Recipients.platform_admins(),
        {"request_id": support_request.pk},
    )
    return support_request


def _locked(support_request: SupportRequest) -> SupportRequest:
    return SupportRequest.objects.select_for_update().get(pk=support_request.pk)


def add_requester_message(
    *, http_request: Any, support_request: SupportRequest, user: User, body: str
) -> SupportRequest:
    body = clean_text("body", body)
    support_request = _locked(support_request)
    if support_request.is_closed:
        raise BusinessRuleViolation(CLOSED_MESSAGE)
    message = SupportMessage.objects.create(
        request=support_request, author=user, author_kind=AuthorKind.REQUESTER, body=body
    )
    support_request.status = RequestStatus.OPEN
    support_request.last_message_at = message.created_at
    support_request.version += 1
    support_request.save(update_fields=["status", "last_message_at", "version", "updated_at"])
    record(
        actions.REQUEST_MESSAGE_ADDED,
        request=http_request,
        object_type="support_request",
        object_id=support_request.pk,
        metadata={"request_id": str(support_request.pk), "message_id": str(message.pk)},
    )
    notify(
        events.FOLLOWED_UP,
        _platform_recipients(support_request),
        {"request_id": support_request.pk, "message_id": message.pk},
    )
    return support_request


def reply(
    *, http_request: Any, support_request: SupportRequest, user: User, body: str
) -> SupportRequest:
    body = clean_text("body", body)
    support_request = _locked(support_request)
    if support_request.is_closed:
        raise BusinessRuleViolation(CLOSED_MESSAGE)
    message = SupportMessage.objects.create(
        request=support_request, author=user, author_kind=AuthorKind.SUPPORT, body=body
    )
    support_request.status = RequestStatus.ANSWERED
    support_request.last_message_at = message.created_at
    support_request.version += 1
    support_request.save(update_fields=["status", "last_message_at", "version", "updated_at"])
    record(
        actions.REQUEST_REPLIED,
        request=http_request,
        object_type="support_request",
        object_id=support_request.pk,
        metadata={"request_id": str(support_request.pk), "message_id": str(message.pk)},
    )
    _notify_requester(
        events.ANSWERED,
        support_request,
        {"request_id": support_request.pk, "message_id": message.pk},
    )
    return support_request


def close(
    *,
    http_request: Any,
    support_request: SupportRequest,
    user: User,
    reason: str,
    by_support: bool,
    body: str = "",
) -> SupportRequest:
    if body:
        body = clean_text("body", body)
    support_request = _locked(support_request)
    if support_request.is_closed:
        raise Conflict(ALREADY_CLOSED)
    now = timezone.now()
    if body:
        message = SupportMessage.objects.create(
            request=support_request, author=user, author_kind=AuthorKind.SUPPORT, body=body
        )
        support_request.last_message_at = message.created_at
    support_request.status = RequestStatus.CLOSED
    support_request.closed_at = now
    support_request.closed_by = user
    support_request.close_reason = reason
    support_request.version += 1
    support_request.save()
    record(
        actions.REQUEST_CLOSED,
        request=http_request,
        object_type="support_request",
        object_id=support_request.pk,
        metadata={
            "request_id": str(support_request.pk),
            "close_reason": reason,
            "by": "support" if by_support else "requester",
        },
    )
    if by_support:
        _notify_requester(events.CLOSED, support_request, {"request_id": support_request.pk})
    return support_request


def triage(
    *,
    http_request: Any,
    support_request: SupportRequest,
    changes: dict[str, Any],
    version: int,
) -> SupportRequest:
    support_request = _locked(support_request)
    if support_request.version != version:
        raise Conflict()
    if support_request.is_closed:
        raise BusinessRuleViolation(_("A closed request can't be changed."))
    if "assigned_to_id" in changes and changes["assigned_to_id"] is not None:
        assignee = User.objects.filter(
            pk=changes["assigned_to_id"], is_platform_admin=True, is_active=True
        ).first()
        if assignee is None:
            raise _invalid("assigned_to_id", _("Choose a MediLink support member."))
    changed = [
        field for field, value in changes.items() if getattr(support_request, field) != value
    ]
    if not changed:
        return support_request
    for field in changed:
        setattr(support_request, field, changes[field])
    support_request.version += 1
    support_request.save(update_fields=[*changed, "version", "updated_at"])
    record(
        actions.REQUEST_TRIAGED,
        request=http_request,
        object_type="support_request",
        object_id=support_request.pk,
        metadata={
            "request_id": str(support_request.pk),
            "fields": sorted(f.removesuffix("_id") for f in changed),
        },
    )
    return support_request


# ---------------------------------------------------------------------------------------------
# Help articles
# ---------------------------------------------------------------------------------------------

ARTICLE_FIELDS = (
    "slug",
    "audience",
    "category",
    "title_i18n",
    "summary_i18n",
    "body_i18n",
    "sort_order",
)


def _article_audit(action: str, http_request: Any, article: HelpArticle, **extra: Any) -> None:
    record(
        action,
        request=http_request,
        object_type="help_article",
        object_id=article.pk,
        metadata={"article_id": str(article.pk), "audience": article.audience, **extra},
    )


def create_article(*, http_request: Any, user: User, data: dict[str, Any]) -> HelpArticle:
    article = HelpArticle.objects.create(
        **{k: v for k, v in data.items() if k in ARTICLE_FIELDS},
        created_by=user,
        updated_by=user,
    )
    _article_audit(actions.ARTICLE_CREATED, http_request, article, fields=sorted(data))
    return article


def update_article(
    *, http_request: Any, article: HelpArticle, user: User, data: dict[str, Any], version: int
) -> HelpArticle:
    article = HelpArticle.objects.select_for_update().get(pk=article.pk)
    if article.version != version:
        raise Conflict()
    changed = [f for f in ARTICLE_FIELDS if f in data and getattr(article, f) != data[f]]
    if not changed:
        return article
    for field in changed:
        setattr(article, field, data[field])
    article.updated_by = user
    article.version += 1
    article.save()
    _article_audit(actions.ARTICLE_UPDATED, http_request, article, fields=sorted(changed))
    return article


def publish_article(*, http_request: Any, article: HelpArticle, user: User) -> HelpArticle:
    article = HelpArticle.objects.select_for_update().get(pk=article.pk)
    if article.status == ArticleStatus.PUBLISHED:
        raise Conflict(_("This article is already published."))
    missing = article.missing_languages()
    if missing:
        raise BusinessRuleViolation(
            _("Add the title, summary and text in every language before publishing: %(langs)s.")
            % {"langs": ", ".join(missing)}
        )
    article.status = ArticleStatus.PUBLISHED
    article.published_at = timezone.now()
    article.updated_by = user
    article.version += 1
    article.save()
    _article_audit(actions.ARTICLE_PUBLISHED, http_request, article)
    return article


def unpublish_article(*, http_request: Any, article: HelpArticle, user: User) -> HelpArticle:
    article = HelpArticle.objects.select_for_update().get(pk=article.pk)
    if article.status == ArticleStatus.DRAFT:
        raise Conflict(_("This article is already a draft."))
    article.status = ArticleStatus.DRAFT
    article.published_at = None
    article.updated_by = user
    article.version += 1
    article.save()
    _article_audit(actions.ARTICLE_UNPUBLISHED, http_request, article)
    return article
