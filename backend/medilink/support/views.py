"""S10 part 1 endpoints (contract sprint-10 §3.2): help articles and support requests for the
public, patients, staff and the platform."""

from __future__ import annotations

import uuid
from typing import Any, cast

from django.db.models import Case, Count, IntegerField, Q, QuerySet, Value, When
from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import exceptions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from medilink.accounts.models import User
from medilink.authz.permissions import IsPatientAuthenticated, PublicEndpoint, get_principal
from medilink.authz.platform import PlatformAdmin
from medilink.authz.stepup import RecentAuthRequired
from medilink.core.net import user_agent
from medilink.core.pagination import DefaultPagination
from medilink.core.throttling import BurstRateThrottle
from medilink.facilities.views_base import Needs, err
from medilink.notifications.observers import device_label
from medilink.support import serializers as s
from medilink.support import services
from medilink.support.models import (
    ArticleCategory,
    ArticleStatus,
    Audience,
    CloseReason,
    ContactMessage,
    ContactStatus,
    HelpArticle,
    RequestPriority,
    RequestStatus,
    SupportRequest,
    Topic,
)
from medilink.support.throttling import ContactIPThrottle, SupportWriteThrottle

HELP_TAGS = ["help"]
SUPPORT_TAGS = ["support"]
VIEW_FACILITY = "support.view_facility"

StaffMember = Needs()


def _user(request: Request) -> User:
    return cast(User, request.user)


def _bad(field: str, message: Any) -> exceptions.ValidationError:
    return exceptions.ValidationError({field: [message]})


def _choice(request: Request, name: str, allowed: list[str] | tuple[str, ...]) -> str | None:
    value = request.query_params.get(name)
    if not value:
        return None
    if value not in allowed:
        raise _bad(name, _("Choose one of: %(values)s.") % {"values": ", ".join(allowed)})
    return value


def _search(request: Request) -> str | None:
    q = (request.query_params.get("q") or "").strip()
    if not q:
        return None
    if not 2 <= len(q) <= 100:
        raise _bad("q", _("Search with 2 to 100 characters."))
    return q


def _paginate(view: APIView, request: Request, rows: Any, serializer: Any) -> Response:
    paginator = DefaultPagination()
    page: list[Any] = paginator.paginate_queryset(rows, request, view=view) or []
    return paginator.get_paginated_response(serializer(page, many=True).data)


# ---------------------------------------------------------------------------------------------
# Help articles (public = patient audience, staff = staff audience)
# ---------------------------------------------------------------------------------------------

LANG_FIELDS = [
    f"{field}__{lang}__icontains"
    for field in ("title_i18n", "summary_i18n", "body_i18n")
    for lang in ("rw", "en", "fr")
]
TITLE_FIELDS = [f"title_i18n__{lang}__icontains" for lang in ("rw", "en", "fr")]


def search_articles(rows: QuerySet[HelpArticle], q: str) -> QuerySet[HelpArticle]:
    """Substring search in every language; title matches first (contract §2.4, S10-D4)."""
    anywhere = Q()
    for lookup in LANG_FIELDS:
        anywhere |= Q(**{lookup: q})
    in_title = Q()
    for lookup in TITLE_FIELDS:
        in_title |= Q(**{lookup: q})
    return rows.filter(anywhere).annotate(
        title_rank=Case(
            When(in_title, then=Value(0)), default=Value(1), output_field=IntegerField()
        )
    )


ARTICLE_LIST_PARAMS = [
    OpenApiParameter("q", str, description="Search text, 2-100 characters"),
    OpenApiParameter("category", str, enum=ArticleCategory.values),
]


class _ArticleList(APIView):
    audience: str = Audience.PATIENT
    pagination_class = DefaultPagination

    def get(self, request: Request) -> Response:
        rows = HelpArticle.objects.filter(audience=self.audience, status=ArticleStatus.PUBLISHED)
        category = _choice(request, "category", ArticleCategory.values)
        if category:
            rows = rows.filter(category=category)
        q = _search(request)
        order = ["sort_order", "slug"]
        if q:
            rows = search_articles(rows, q)
            order = ["title_rank", *order]
        return _paginate(self, request, rows.order_by(*order), s.HelpArticleSummarySerializer)


class _ArticleDetail(APIView):
    audience: str = Audience.PATIENT

    def get(self, request: Request, slug: str) -> Response:
        article = HelpArticle.objects.filter(
            slug=slug, audience=self.audience, status=ArticleStatus.PUBLISHED
        ).first()
        if article is None:
            raise exceptions.NotFound()
        return Response(s.HelpArticleSerializer(article).data)


class PublicArticleListView(_ArticleList):
    permission_classes = [PublicEndpoint]

    @extend_schema(
        tags=HELP_TAGS,
        parameters=ARTICLE_LIST_PARAMS,
        responses={200: s.HelpArticleSummarySerializer(many=True), 400: err("Bad filter")},
    )
    def get(self, request: Request) -> Response:
        return super().get(request)


class PublicArticleDetailView(_ArticleDetail):
    permission_classes = [PublicEndpoint]

    @extend_schema(
        tags=HELP_TAGS, responses={200: s.HelpArticleSerializer, 404: err("Not published")}
    )
    def get(self, request: Request, slug: str) -> Response:
        return super().get(request, slug)


class StaffArticleListView(_ArticleList):
    audience = Audience.STAFF
    permission_classes = [StaffMember]

    @extend_schema(
        tags=HELP_TAGS,
        parameters=ARTICLE_LIST_PARAMS,
        responses={200: s.HelpArticleSummarySerializer(many=True), 400: err("Bad filter")},
    )
    def get(self, request: Request) -> Response:
        return super().get(request)


class StaffArticleDetailView(_ArticleDetail):
    audience = Audience.STAFF
    permission_classes = [StaffMember]

    @extend_schema(
        tags=HELP_TAGS, responses={200: s.HelpArticleSerializer, 404: err("Not published")}
    )
    def get(self, request: Request, slug: str) -> Response:
        return super().get(request, slug)


# ---------------------------------------------------------------------------------------------
# Support requests: requesters (patients and staff)
# ---------------------------------------------------------------------------------------------


def _with_detail(rows: QuerySet[SupportRequest]) -> QuerySet[SupportRequest]:
    return rows.select_related("facility", "requester").prefetch_related("messages__author")


def _for_list(rows: QuerySet[SupportRequest]) -> QuerySet[SupportRequest]:
    return rows.select_related("facility", "requester").annotate(message_count=Count("messages"))


def _status_filter(request: Request, rows: QuerySet[SupportRequest]) -> QuerySet[SupportRequest]:
    wanted = _choice(request, "status", ("active", "closed"))
    if wanted == "active":
        return rows.active()  # type: ignore[attr-defined]
    if wanted == "closed":
        return rows.filter(status=RequestStatus.CLOSED)
    return rows


class _Requester(APIView):
    """Shared by the patient and staff requester endpoints."""

    audience: str = Audience.PATIENT

    def facility_id(self) -> Any:
        if self.audience != Audience.STAFF:
            return None
        principal = get_principal(self.request)
        return principal.active_facility_id if principal else None

    def can_view_facility(self) -> bool:
        principal = get_principal(self.request)
        return self.audience == Audience.STAFF and bool(
            principal and VIEW_FACILITY in principal.permissions
        )

    def own(self) -> QuerySet[SupportRequest]:
        return SupportRequest.objects.for_requester(_user(self.request), self.audience)

    def visible(self) -> QuerySet[SupportRequest]:
        rows = self.own()
        if self.can_view_facility():
            rows = rows | SupportRequest.objects.for_facility(self.facility_id())
        return rows

    def get_visible(self, request_id: Any) -> SupportRequest:
        row = _with_detail(self.visible()).filter(pk=request_id).first()
        if row is None:
            raise exceptions.NotFound()
        return row

    def get_own(self, request_id: Any) -> SupportRequest:
        row = self.get_visible(request_id)
        if row.requester_id != self.request.user.pk:
            raise exceptions.PermissionDenied(
                _("Only the person who opened this request can change it.")
            )
        return row

    def detail(self, request_id: Any, code: int = status.HTTP_200_OK) -> Response:
        return Response(s.SupportRequestSerializer(self.get_visible(request_id)).data, status=code)


LIST_PARAMS = [OpenApiParameter("status", str, enum=["active", "closed"])]
STAFF_LIST_PARAMS = [
    *LIST_PARAMS,
    OpenApiParameter("scope", str, enum=["mine", "facility"], description="Default mine"),
]


class _RequestListView(_Requester):
    pagination_class = DefaultPagination
    throttle_classes = [BurstRateThrottle, SupportWriteThrottle]

    def get(self, request: Request) -> Response:
        rows = self.own()
        if self.audience == Audience.STAFF:
            scope = _choice(request, "scope", ("mine", "facility")) or "mine"
            if scope == "facility":
                if not self.can_view_facility():
                    raise exceptions.PermissionDenied()
                rows = SupportRequest.objects.for_facility(self.facility_id())
        rows = _status_filter(request, rows)
        return _paginate(
            self,
            request,
            _for_list(rows).order_by("-last_message_at"),
            s.SupportRequestListSerializer,
        )

    def post(self, request: Request) -> Response:
        data = s.SupportRequestCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        row = services.open_request(
            http_request=request,
            user=_user(request),
            audience=self.audience,
            facility_id=self.facility_id(),
            topic=data.validated_data["topic"],
            subject=data.validated_data["subject"],
            body=data.validated_data["body"],
            client_label=device_label(user_agent(request)),
            client_path=data.validated_data["client_path"],
        )
        return self.detail(row.pk, status.HTTP_201_CREATED)


class _RequestDetailView(_Requester):
    def get(self, request: Request, request_id: Any) -> Response:
        return self.detail(request_id)


class _RequestMessagesView(_Requester):
    throttle_classes = [BurstRateThrottle, SupportWriteThrottle]

    def post(self, request: Request, request_id: Any) -> Response:
        row = self.get_own(request_id)
        data = s.MessageCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.add_requester_message(
            http_request=request,
            support_request=row,
            user=_user(request),
            body=data.validated_data["body"],
        )
        return self.detail(row.pk, status.HTTP_201_CREATED)


class _RequestCloseView(_Requester):
    def post(self, request: Request, request_id: Any) -> Response:
        row = self.get_own(request_id)
        services.close(
            http_request=request,
            support_request=row,
            user=_user(request),
            reason=CloseReason.WITHDRAWN,
            by_support=False,
        )
        return self.detail(row.pk)


CREATE_ERRORS = {
    400: err("Invalid fields, or health details in the text"),
    422: err("Too many open requests"),
    429: err("Too many requests"),
}


def _requester_views(audience: str, permission: Any) -> dict[str, type[APIView]]:
    perms = [permission]
    list_params = STAFF_LIST_PARAMS if audience == Audience.STAFF else LIST_PARAMS
    prefix = "Staff" if audience == Audience.STAFF else "Patient"

    class ListView(_RequestListView):
        permission_classes = perms

        @extend_schema(
            tags=SUPPORT_TAGS,
            parameters=list_params,
            responses={200: s.SupportRequestListSerializer(many=True), 403: err("Scope")},
            operation_id=f"{audience}_support_requests_list",
        )
        def get(self, request: Request) -> Response:
            return super().get(request)

        @extend_schema(
            tags=SUPPORT_TAGS,
            request=s.SupportRequestCreateSerializer,
            responses={201: s.SupportRequestSerializer, **CREATE_ERRORS},
            operation_id=f"{audience}_support_requests_create",
        )
        def post(self, request: Request) -> Response:
            return super().post(request)

    class DetailView(_RequestDetailView):
        permission_classes = perms

        @extend_schema(
            tags=SUPPORT_TAGS,
            responses={200: s.SupportRequestSerializer, 404: err("Not visible")},
            operation_id=f"{audience}_support_request",
        )
        def get(self, request: Request, request_id: Any) -> Response:
            return super().get(request, request_id)

    class MessagesView(_RequestMessagesView):
        permission_classes = perms

        @extend_schema(
            tags=SUPPORT_TAGS,
            request=s.MessageCreateSerializer,
            responses={
                201: s.SupportRequestSerializer,
                400: err("Invalid text"),
                403: err("Read-only"),
                404: err("Not visible"),
                422: err("Closed"),
                429: err("Too many requests"),
            },
            operation_id=f"{audience}_support_request_message",
        )
        def post(self, request: Request, request_id: Any) -> Response:
            return super().post(request, request_id)

    class CloseView(_RequestCloseView):
        permission_classes = perms

        @extend_schema(
            tags=SUPPORT_TAGS,
            request=s.RequesterCloseSerializer,
            responses={
                200: s.SupportRequestSerializer,
                403: err("Read-only"),
                404: err("Not visible"),
                409: err("Already closed"),
            },
            operation_id=f"{audience}_support_request_close",
        )
        def post(self, request: Request, request_id: Any) -> Response:
            return super().post(request, request_id)

    views: dict[str, type[APIView]] = {
        "list": ListView,
        "detail": DetailView,
        "messages": MessagesView,
        "close": CloseView,
    }
    for key, view in views.items():
        view.audience = audience  # type: ignore[attr-defined]
        view.__name__ = f"{prefix}SupportRequest{key.title()}View"
        view.__qualname__ = view.__name__
    return views


PATIENT_REQUESTS = _requester_views(Audience.PATIENT, IsPatientAuthenticated)
STAFF_REQUESTS = _requester_views(Audience.STAFF, StaffMember)


# ---------------------------------------------------------------------------------------------
# Platform: support queue and help articles
# ---------------------------------------------------------------------------------------------


def _platform_request(request_id: Any) -> SupportRequest:
    row = (
        _with_detail(SupportRequest.objects.for_platform())
        .select_related("assigned_to", "closed_by")
        .filter(pk=request_id)
        .first()
    )
    if row is None:
        raise exceptions.NotFound()
    return row


def _platform_detail(request_id: Any, code: int = status.HTTP_200_OK) -> Response:
    return Response(
        s.PlatformSupportRequestSerializer(_platform_request(request_id)).data, status=code
    )


class PlatformRequestListView(APIView):
    permission_classes = [PlatformAdmin]
    pagination_class = DefaultPagination

    @extend_schema(
        tags=SUPPORT_TAGS,
        parameters=[
            OpenApiParameter("status", str, enum=["active", *RequestStatus.values]),
            OpenApiParameter("topic", str, enum=Topic.values),
            OpenApiParameter("audience", str, enum=Audience.values),
            OpenApiParameter("priority", str, enum=RequestPriority.values),
            OpenApiParameter("facility_id", str),
            OpenApiParameter("assigned", str, enum=["me", "none"]),
            OpenApiParameter("q", str, description="Reference or subject"),
        ],
        responses={200: s.PlatformSupportRequestListSerializer(many=True), 400: err("Filter")},
    )
    def get(self, request: Request) -> Response:
        rows = SupportRequest.objects.for_platform()
        wanted = _choice(request, "status", ["active", *RequestStatus.values])
        if wanted == "active":
            rows = rows.active()
        elif wanted:
            rows = rows.filter(status=wanted)
        for name, allowed in (
            ("topic", Topic.values),
            ("audience", Audience.values),
            ("priority", RequestPriority.values),
        ):
            value = _choice(request, name, allowed)
            if value:
                rows = rows.filter(**{"requester_audience" if name == "audience" else name: value})
        facility_id = request.query_params.get("facility_id")
        if facility_id:
            try:
                rows = rows.filter(facility_id=uuid.UUID(facility_id))
            except ValueError:
                raise _bad("facility_id", _("Not a valid ID.")) from None
        assigned = _choice(request, "assigned", ("me", "none"))
        if assigned == "me":
            rows = rows.filter(assigned_to=_user(request))
        elif assigned == "none":
            rows = rows.filter(assigned_to__isnull=True)
        q = _search(request)
        if q:
            rows = rows.filter(Q(reference__iexact=q) | Q(subject__icontains=q))
        ordered = (
            _for_list(rows)
            .select_related("assigned_to", "closed_by")
            .annotate(
                priority_rank=Case(
                    When(priority=RequestPriority.HIGH, then=Value(0)),
                    default=Value(1),
                    output_field=IntegerField(),
                )
            )
            .order_by("priority_rank", "last_message_at")
        )
        return _paginate(self, request, ordered, s.PlatformSupportRequestListSerializer)


class PlatformRequestDetailView(APIView):
    permission_classes = [PlatformAdmin]

    @extend_schema(
        tags=SUPPORT_TAGS,
        responses={200: s.PlatformSupportRequestSerializer, 404: err("Unknown")},
    )
    def get(self, request: Request, request_id: Any) -> Response:
        return _platform_detail(request_id)

    @extend_schema(
        tags=SUPPORT_TAGS,
        request=s.TriageSerializer,
        responses={
            200: s.PlatformSupportRequestSerializer,
            400: err("Invalid fields"),
            404: err("Unknown"),
            409: err("Stale version"),
            422: err("Closed"),
        },
    )
    def patch(self, request: Request, request_id: Any) -> Response:
        row = _platform_request(request_id)
        data = s.TriageSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        changes = {k: v for k, v in data.validated_data.items() if k != "version"}
        services.triage(
            http_request=request,
            support_request=row,
            changes=changes,
            version=data.validated_data["version"],
        )
        return _platform_detail(row.pk)


class PlatformRequestReplyView(APIView):
    permission_classes = [PlatformAdmin]

    @extend_schema(
        tags=SUPPORT_TAGS,
        request=s.MessageCreateSerializer,
        responses={
            201: s.PlatformSupportRequestSerializer,
            400: err("Invalid text"),
            404: err("Unknown"),
            422: err("Closed"),
        },
    )
    def post(self, request: Request, request_id: Any) -> Response:
        row = _platform_request(request_id)
        data = s.MessageCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.reply(
            http_request=request,
            support_request=row,
            user=_user(request),
            body=data.validated_data["body"],
        )
        return _platform_detail(row.pk, status.HTTP_201_CREATED)


class PlatformRequestCloseView(APIView):
    permission_classes = [PlatformAdmin]

    @extend_schema(
        tags=SUPPORT_TAGS,
        request=s.SupportCloseSerializer,
        responses={
            200: s.PlatformSupportRequestSerializer,
            400: err("Invalid reason"),
            404: err("Unknown"),
            409: err("Already closed"),
        },
    )
    def post(self, request: Request, request_id: Any) -> Response:
        row = _platform_request(request_id)
        data = s.SupportCloseSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.close(
            http_request=request,
            support_request=row,
            user=_user(request),
            reason=data.validated_data["reason"],
            body=data.validated_data["body"],
            by_support=True,
        )
        return _platform_detail(row.pk)


def _platform_article(article_id: Any) -> HelpArticle:
    article = (
        HelpArticle.objects.select_related("created_by", "updated_by").filter(pk=article_id).first()
    )
    if article is None:
        raise exceptions.NotFound()
    return article


def _article_response(article_id: Any, code: int = status.HTTP_200_OK) -> Response:
    return Response(
        s.PlatformHelpArticleSerializer(_platform_article(article_id)).data, status=code
    )


class PlatformArticleListView(APIView):
    permission_classes = [PlatformAdmin]
    pagination_class = DefaultPagination

    @extend_schema(
        tags=HELP_TAGS,
        parameters=[
            *ARTICLE_LIST_PARAMS,
            OpenApiParameter("audience", str, enum=Audience.values),
            OpenApiParameter("status", str, enum=ArticleStatus.values),
        ],
        responses={200: s.PlatformHelpArticleSummarySerializer(many=True), 400: err("Filter")},
    )
    def get(self, request: Request) -> Response:
        rows = HelpArticle.objects.select_related("created_by", "updated_by")
        for name, allowed in (
            ("audience", Audience.values),
            ("status", ArticleStatus.values),
            ("category", ArticleCategory.values),
        ):
            value = _choice(request, name, allowed)
            if value:
                rows = rows.filter(**{name: value})
        q = _search(request)
        order = ["audience", "sort_order", "slug"]
        if q:
            rows = search_articles(rows, q)
            order = ["title_rank", *order]
        return _paginate(
            self, request, rows.order_by(*order), s.PlatformHelpArticleSummarySerializer
        )

    @extend_schema(
        tags=HELP_TAGS,
        request=s.HelpArticleWriteSerializer,
        responses={201: s.PlatformHelpArticleSerializer, 400: err("Invalid fields")},
    )
    def post(self, request: Request) -> Response:
        data = s.HelpArticleWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if not data.validated_data["title_i18n"]:
            raise _bad("title_i18n", _("Give a title in at least one language."))
        article = services.create_article(
            http_request=request, user=_user(request), data=dict(data.validated_data)
        )
        return _article_response(article.pk, status.HTTP_201_CREATED)


class PlatformArticleDetailView(APIView):
    permission_classes = [PlatformAdmin]

    @extend_schema(
        tags=HELP_TAGS, responses={200: s.PlatformHelpArticleSerializer, 404: err("Unknown")}
    )
    def get(self, request: Request, article_id: Any) -> Response:
        return _article_response(article_id)

    @extend_schema(
        tags=HELP_TAGS,
        request=s.HelpArticleWriteSerializer,
        responses={
            200: s.PlatformHelpArticleSerializer,
            400: err("Invalid fields"),
            404: err("Unknown"),
            409: err("Stale version"),
        },
    )
    def patch(self, request: Request, article_id: Any) -> Response:
        article = _platform_article(article_id)
        data = s.HelpArticleWriteSerializer(
            data=request.data, partial=True, context={"instance": article}
        )
        data.is_valid(raise_exception=True)
        values = dict(data.validated_data)
        version = values.pop("version")
        if "title_i18n" in values and not values["title_i18n"]:
            raise _bad("title_i18n", _("Give a title in at least one language."))
        services.update_article(
            http_request=request,
            article=article,
            user=_user(request),
            data=values,
            version=version,
        )
        return _article_response(article.pk)


ACTION_ERRORS = {404: err("Unknown"), 409: err("Already in that state")}


class PlatformArticlePublishView(APIView):
    permission_classes = [PlatformAdmin, RecentAuthRequired()]

    @extend_schema(
        tags=HELP_TAGS,
        request=None,
        responses={
            200: s.PlatformHelpArticleSerializer,
            403: err("Step-up required"),
            422: err("Missing languages"),
            **ACTION_ERRORS,
        },
    )
    def post(self, request: Request, article_id: Any) -> Response:
        article = _platform_article(article_id)
        services.publish_article(http_request=request, article=article, user=_user(request))
        return _article_response(article.pk)


class PlatformArticleUnpublishView(APIView):
    permission_classes = [PlatformAdmin]

    @extend_schema(
        tags=HELP_TAGS,
        request=None,
        responses={200: s.PlatformHelpArticleSerializer, **ACTION_ERRORS},
    )
    def post(self, request: Request, article_id: Any) -> Response:
        article = _platform_article(article_id)
        services.unpublish_article(http_request=request, article=article, user=_user(request))
        return _article_response(article.pk)


# ---------------------------------------------------------------------------------------------
# The public Contact page (upgrade 11 §13): no account, so a platform inbox, not a request
# ---------------------------------------------------------------------------------------------


class PublicContactView(APIView):
    permission_classes = [PublicEndpoint]
    authentication_classes: list[Any] = []
    throttle_classes = [BurstRateThrottle, ContactIPThrottle]

    @extend_schema(
        tags=SUPPORT_TAGS,
        request=s.PublicContactSerializer,
        responses={201: s.ContactReceiptSerializer, 400: err("Invalid fields or health details")},
    )
    def post(self, request: Request) -> Response:
        data = s.PublicContactSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        fields = data.validated_data
        message = services.receive_contact(
            http_request=request,
            name=fields["name"].strip(),
            reach=fields["reach"].strip(),
            subject=fields["subject"].strip(),
            body=fields["message"].strip(),
            language=(request.LANGUAGE_CODE or "rw")[:2],
        )
        return Response({"reference": message.reference}, status=status.HTTP_201_CREATED)


class PlatformContactListView(APIView):
    permission_classes = [PlatformAdmin]
    pagination_class = DefaultPagination

    @extend_schema(
        tags=SUPPORT_TAGS,
        parameters=[
            OpenApiParameter("status", str, enum=ContactStatus.values),
            OpenApiParameter("q", str, description="Reference, name or subject"),
        ],
        responses={200: s.PlatformContactMessageSerializer(many=True), 400: err("Filter")},
    )
    def get(self, request: Request) -> Response:
        rows = ContactMessage.objects.select_related("handled_by")
        wanted = _choice(request, "status", ContactStatus.values)
        if wanted:
            rows = rows.filter(status=wanted)
        q = _search(request)
        if q:
            rows = rows.filter(
                Q(reference__iexact=q) | Q(name__icontains=q) | Q(subject__icontains=q)
            )
        return _paginate(
            self, request, rows.order_by("-created_at"), s.PlatformContactMessageSerializer
        )


class PlatformContactHandleView(APIView):
    permission_classes = [PlatformAdmin]

    @extend_schema(
        tags=SUPPORT_TAGS,
        request=s.ContactHandleSerializer,
        responses={
            200: s.PlatformContactMessageSerializer,
            404: err("Unknown"),
            409: err("Already handled"),
        },
    )
    def post(self, request: Request, message_id: Any) -> Response:
        message = ContactMessage.objects.filter(pk=message_id).first()
        if message is None:
            raise exceptions.NotFound()
        data = s.ContactHandleSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        done = services.handle_contact(
            http_request=request,
            message=message,
            user=_user(request),
            note=data.validated_data["note"].strip(),
        )
        return Response(s.PlatformContactMessageSerializer(done).data)
