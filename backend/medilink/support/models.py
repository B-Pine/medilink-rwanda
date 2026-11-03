"""Help center articles and support requests (contract sprint-10 §2).

Articles are platform C0 content. Support requests and their messages are a platform queue with
no facility RLS (contract §2.5, database design §3.5): every API read goes through one of the
scoped querysets below (`for_requester`, `for_facility`, `for_platform`).
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.db.models.functions import Length
from django.db.models.lookups import Range

from medilink.core.models import TimeStampedModel

LANGUAGES = ("rw", "en", "fr")


class Audience(models.TextChoices):
    PATIENT = "patient", "Patient"
    STAFF = "staff", "Staff"


class ArticleCategory(models.TextChoices):
    GETTING_STARTED = "getting_started", "Getting started"
    ACCOUNT_SECURITY = "account_security", "Account and sign-in"
    BOOKING_VISITS = "booking_visits", "Bookings and visits"
    FAMILY_PROFILE = "family_profile", "Family and profile"
    NOTIFICATIONS = "notifications", "Notifications"
    PRIVACY = "privacy", "Privacy"
    FACILITY_WORK = "facility_work", "Working at the facility"
    OTHER = "other", "Other"


class ArticleStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PUBLISHED = "published", "Published"


class Topic(models.TextChoices):
    ACCOUNT_ACCESS = "account_access", "Account and sign-in"
    BOOKING_VISITS = "booking_visits", "Bookings and visits"
    FAMILY_PROFILE = "family_profile", "Family and profile"
    NOTIFICATIONS = "notifications", "Notifications"
    PRIVACY = "privacy", "Privacy"
    FACILITY_SETUP = "facility_setup", "Facility setup"
    TECHNICAL = "technical", "Something doesn't work"
    OTHER = "other", "Other"


class RequestStatus(models.TextChoices):
    OPEN = "open", "Open"
    ANSWERED = "answered", "Answered"
    CLOSED = "closed", "Closed"


ACTIVE_STATUSES = (RequestStatus.OPEN, RequestStatus.ANSWERED)


class RequestPriority(models.TextChoices):
    NORMAL = "normal", "Normal"
    HIGH = "high", "High"


class CloseReason(models.TextChoices):
    RESOLVED = "resolved", "Resolved"
    NO_RESPONSE = "no_response", "No response"
    DUPLICATE = "duplicate", "Duplicate"
    REDIRECTED_TO_FACILITY = "redirected_to_facility", "Sent to the facility"
    WITHDRAWN = "withdrawn", "Withdrawn by the requester"


class AuthorKind(models.TextChoices):
    REQUESTER = "requester", "Requester"
    SUPPORT = "support", "Support"


class HelpArticle(TimeStampedModel):
    slug = models.CharField(max_length=80, unique=True)
    audience = models.CharField(max_length=10, choices=Audience.choices)
    category = models.CharField(max_length=30, choices=ArticleCategory.choices)
    title_i18n = models.JSONField(default=dict)
    summary_i18n = models.JSONField(default=dict)
    body_i18n = models.JSONField(default=dict)
    status = models.CharField(
        max_length=10, choices=ArticleStatus.choices, default=ArticleStatus.DRAFT
    )
    sort_order = models.PositiveSmallIntegerField(default=100)
    published_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    version = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = "support_help_article"
        indexes = [
            models.Index(
                fields=["audience", "status", "category", "sort_order"],
                name="support_article_listing_idx",
            )
        ]
        constraints = [
            models.CheckConstraint(
                condition=~Q(status="published") | Q(published_at__isnull=False),
                name="support_article_published_at",
            ),
            models.CheckConstraint(
                condition=Q(slug__regex=r"^[a-z0-9]+(-[a-z0-9]+)*$"),
                name="support_article_slug_format",
            ),
            models.CheckConstraint(
                condition=Q(sort_order__lte=999), name="support_article_sort_order"
            ),
        ]

    def missing_languages(self) -> list[str]:
        """Languages without a title, summary and body (publishing needs all three)."""
        return [
            lang
            for lang in LANGUAGES
            if not all(
                str((getattr(self, f) or {}).get(lang) or "").strip()
                for f in ("title_i18n", "summary_i18n", "body_i18n")
            )
        ]


class SupportRequestQuerySet(models.QuerySet["SupportRequest"]):
    def for_requester(self, user: Any, audience: str) -> SupportRequestQuerySet:
        return self.filter(requester=user, requester_audience=audience)

    def for_facility(self, facility_id: Any) -> SupportRequestQuerySet:
        if facility_id is None:
            return self.none()
        return self.filter(requester_audience=Audience.STAFF, facility_id=facility_id)

    def for_platform(self) -> SupportRequestQuerySet:
        return self.all()

    def active(self) -> SupportRequestQuerySet:
        return self.filter(status__in=ACTIVE_STATUSES)


class SupportRequest(TimeStampedModel):
    reference = models.CharField(max_length=12, unique=True)
    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="support_requests"
    )
    requester_audience = models.CharField(max_length=10, choices=Audience.choices)
    facility = models.ForeignKey(
        "tenancy.Facility", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    topic = models.CharField(max_length=30, choices=Topic.choices)
    subject = models.CharField(max_length=120)
    status = models.CharField(
        max_length=10, choices=RequestStatus.choices, default=RequestStatus.OPEN
    )
    priority = models.CharField(
        max_length=10, choices=RequestPriority.choices, default=RequestPriority.NORMAL
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    language = models.CharField(max_length=2, default="rw")
    client_label = models.CharField(max_length=60, blank=True, default="")
    client_path = models.CharField(max_length=200, blank=True, default="")
    last_message_at = models.DateTimeField()
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    # NULL until closed; the CHECK below ties it to the status.
    close_reason = models.CharField(  # noqa: DJ001
        max_length=30, choices=CloseReason.choices, null=True, blank=True
    )
    version = models.PositiveIntegerField(default=1)

    objects = SupportRequestQuerySet.as_manager()

    class Meta:
        db_table = "support_request"
        indexes = [
            models.Index(
                fields=["status", "priority", "last_message_at"], name="support_request_queue_idx"
            ),
            models.Index(fields=["requester", "created_at"], name="support_request_mine_idx"),
            models.Index(
                fields=["facility", "created_at"],
                name="support_request_facility_idx",
                condition=Q(facility__isnull=False),
            ),
            models.Index(fields=["assigned_to", "status"], name="support_request_assignee_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(Q(requester_audience="staff") & Q(facility__isnull=False))
                | (Q(requester_audience="patient") & Q(facility__isnull=True)),
                name="support_request_facility_audience",
            ),
            models.CheckConstraint(
                condition=(
                    Q(status="closed") & Q(closed_at__isnull=False) & Q(close_reason__isnull=False)
                )
                | (~Q(status="closed") & Q(closed_at__isnull=True) & Q(close_reason__isnull=True)),
                name="support_request_closed_fields",
            ),
        ]

    @property
    def is_closed(self) -> bool:
        return self.status == RequestStatus.CLOSED


class AppendOnlyError(RuntimeError):
    pass


class SupportMessage(TimeStampedModel):
    request = models.ForeignKey(SupportRequest, on_delete=models.CASCADE, related_name="messages")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    author_kind = models.CharField(max_length=10, choices=AuthorKind.choices)
    body = models.TextField()

    class Meta:
        db_table = "support_message"
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["request", "created_at"], name="support_message_thread_idx")
        ]
        constraints = [
            models.CheckConstraint(
                condition=Range(Length("body"), (1, 4000)),
                name="support_message_body_length",
            )
        ]

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise AppendOnlyError("Support messages are append-only.")
        super().save(*args, **kwargs)


class ContactStatus(models.TextChoices):
    NEW = "new", "New"
    HANDLED = "handled", "Handled"


class ContactMessage(TimeStampedModel):
    """A message from the public Contact page (upgrade 11 §13); no account, so no support request.

    Read only by the platform (no facility RLS). Health details are refused at intake, as for
    support requests; `reach` is the email or phone number the visitor asked to be answered on.
    """

    reference = models.CharField(max_length=12, unique=True)
    name = models.CharField(max_length=120)
    reach = models.CharField(max_length=120)
    subject = models.CharField(max_length=120)
    body = models.TextField()
    language = models.CharField(max_length=2, default="rw")
    status = models.CharField(
        max_length=10, choices=ContactStatus.choices, default=ContactStatus.NEW
    )
    handled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    handled_at = models.DateTimeField(null=True, blank=True)
    note = models.CharField(max_length=500, blank=True, default="")

    class Meta:
        db_table = "support_contact_message"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "created_at"])]

    def __str__(self) -> str:
        return self.reference
