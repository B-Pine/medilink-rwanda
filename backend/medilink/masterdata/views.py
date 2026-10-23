"""Master data endpoints (contract §3.2, §3.3, §3.5; S1-D11).

    /public/master-data/{kind}/      five public kinds, localised, cacheable
    /staff/master-data/{kind}/       all nine kinds, localised, read-only
    /platform/master-data/{kind}/    super admin: list, create, read, update (retire/restore),
                                     change history, CSV imports (preview, confirm)

One view class per (audience, kind) is generated, so the OpenAPI schema has a typed operation
for every kind.
"""

from __future__ import annotations

import hashlib
import json
from datetime import timedelta
from typing import Any

from django.contrib.postgres.search import TrigramSimilarity
from django.db import transaction
from django.db.models import Exists, OuterRef, Q, QuerySet
from django.db.models.fields.json import KeyTextTransform
from django.http import Http404
from django.utils import timezone
from django.utils.cache import patch_vary_headers
from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import exceptions, status
from rest_framework.generics import GenericAPIView
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from medilink.authz.permissions import IsStaffAuthenticated, PublicEndpoint, get_principal
from medilink.authz.platform import PlatformAdmin
from medilink.authz.stepup import RecentAuthRequired
from medilink.core.exceptions import BusinessRuleViolation
from medilink.core.pagination import DefaultPagination
from medilink.core.serializers import ErrorSerializer
from medilink.masterdata import models as m
from medilink.masterdata import services
from medilink.masterdata.kinds import KINDS, LANGUAGES, Kind
from medilink.masterdata.serializers import (
    ImportCreateSerializer,
    MasterDataChangeSerializer,
    MasterDataImportSerializer,
    localised_serializer,
    platform_serializer,
)
from medilink.uploads import services as upload_services
from medilink.uploads.throttling import UploadRateThrottle

IMPORT_TTL = timedelta(hours=24)
IMPORT_PURPOSE = "masterdata_import"
NOT_PREVIEWED = _("Only a previewed import without errors can be applied.")
IMPORT_EXPIRED = _("This preview has expired. Upload the file again.")


def _err(description: str) -> OpenApiResponse:
    return OpenApiResponse(response=ErrorSerializer, description=description)


def _bool_param(value: str) -> bool:
    return value.lower() in ("1", "true", "yes")


def _i18n_search(field_name: str, q: str) -> Q:
    query = Q()
    for code in LANGUAGES:
        query |= Q(**{f"{field_name}__{code}__icontains": q})
    return query


def _search(kind: Kind, qs: QuerySet[Any], q: str, rank: bool) -> QuerySet[Any]:
    condition = Q()
    for name in kind.search:
        if name.endswith("_i18n"):
            if name == "synonyms_i18n":
                condition |= Q(synonyms_i18n__icontains=q)
            else:
                condition |= _i18n_search(name, q)
        else:
            condition |= Q(**{f"{name}__icontains": q})
    if rank and kind.trigram:
        target: Any = (
            kind.trigram if kind.trigram != "title_en" else KeyTextTransform("en", "title_i18n")
        )
        qs = qs.annotate(similarity=TrigramSimilarity(target, q))
        return qs.filter(condition | Q(similarity__gt=0.3)).order_by("-similarity", *kind.ordering)
    return qs.filter(condition)


def _filtered(kind: Kind, request: Request, qs: QuerySet[Any], rank: bool = False) -> QuerySet[Any]:
    params = request.query_params
    model_fields = {f.name: f for f in kind.model._meta.get_fields() if hasattr(f, "attname")}
    for name in kind.filters:
        if name in params:
            field = model_fields[name]
            value: Any = params[name]
            if field.get_internal_type() == "BooleanField":
                value = _bool_param(value)
            qs = qs.filter(**{name: value})
    if kind.slug == "locations":
        if "parent" in params:
            qs = qs.filter(parent__code=params["parent"])
        elif "level" not in params and "q" not in params:
            qs = qs.filter(level=m.LocationLevel.PROVINCE)
        qs = qs.select_related("parent").annotate(
            has_children=Exists(m.Location.objects.filter(parent=OuterRef("pk"), is_active=True))
        )
    if kind.slug == "public-holidays" and params.get("year", "").isdigit():
        qs = qs.filter(holiday_date__year=int(params["year"]))
    q = params.get("q", "").strip()[:100]
    return _search(kind, qs, q, rank) if q else qs.order_by(*kind.ordering)


def _list_parameters(kind: Kind, platform: bool = False) -> list[OpenApiParameter]:
    params = [OpenApiParameter("q", str, description="Search")]
    for name in kind.filters:
        params.append(OpenApiParameter(name, str))
    if kind.slug == "locations":
        params.append(OpenApiParameter("parent", str, description="Parent location code"))
    if kind.slug == "public-holidays":
        params.append(OpenApiParameter("year", int))
    if platform:
        params.append(OpenApiParameter("is_active", bool))
        params.append(OpenApiParameter("missing_language", str, enum=list(LANGUAGES)))
    return params


class _LocalisedList(GenericAPIView):
    kind: Kind
    pagination_class = DefaultPagination
    public = False

    def get_queryset(self) -> QuerySet[Any]:
        qs = self.kind.model.objects.filter(is_active=True)
        return _filtered(self.kind, self.request, qs, rank=not self.public)

    def list_response(self, request: Request) -> Response:
        page = self.paginate_queryset(self.get_queryset())
        data = self.get_serializer(page, many=True).data
        response = self.get_paginated_response(data)
        if self.public:
            body = json.dumps(response.data, sort_keys=True, default=str).encode()
            etag = '"' + hashlib.sha256(body).hexdigest()[:32] + '"'
            response["Cache-Control"] = "public, max-age=3600"
            response["ETag"] = etag
            if request.headers.get("If-None-Match") == etag:
                response = Response(status=status.HTTP_304_NOT_MODIFIED)
                response["ETag"] = etag
                response["Cache-Control"] = "public, max-age=3600"
        patch_vary_headers(response, ("Accept-Language",))
        return response


class _PlatformBase(GenericAPIView):
    kind: Kind
    permission_classes = [PlatformAdmin, RecentAuthRequired(methods=("POST", "PATCH"))]


class _PlatformList(_PlatformBase):
    pagination_class = DefaultPagination
    parser_classes = [JSONParser]

    def get_queryset(self) -> QuerySet[Any]:
        qs = self.kind.model.objects.all()
        params = self.request.query_params
        if "is_active" in params:
            qs = qs.filter(is_active=_bool_param(params["is_active"]))
        language = params.get("missing_language")
        if language in LANGUAGES and self.kind.i18n_fields:
            name = next(n for n in self.kind.i18n_fields if n != "synonyms_i18n")
            qs = qs.filter(
                Q(**{f"{name}__{language}__isnull": True}) | Q(**{f"{name}__{language}": ""})
            )
        if self.kind.slug == "locations":
            qs = qs.select_related("parent")
            if "parent" in params:
                qs = qs.filter(parent__code=params["parent"])
        return _filtered_platform(self.kind, self.request, qs)

    def list_response(self, request: Request) -> Response:
        page = self.paginate_queryset(self.get_queryset())
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    def create_response(self, request: Request) -> Response:
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        principal = get_principal(request)
        row = services.create(
            self.kind,
            _write_values(serializer.validated_data),
            actor=principal.user if principal else None,
            request=request,
        )
        return Response(self.get_serializer(row).data, status=status.HTTP_201_CREATED)


def _filtered_platform(kind: Kind, request: Request, qs: QuerySet[Any]) -> QuerySet[Any]:
    params = request.query_params
    model_fields = {f.name: f for f in kind.model._meta.get_fields() if hasattr(f, "attname")}
    for name in kind.filters:
        if name in params:
            value: Any = params[name]
            if model_fields[name].get_internal_type() == "BooleanField":
                value = _bool_param(value)
            qs = qs.filter(**{name: value})
    if kind.slug == "public-holidays" and params.get("year", "").isdigit():
        qs = qs.filter(holiday_date__year=int(params["year"]))
    q = params.get("q", "").strip()[:100]
    return _search(kind, qs, q, rank=False) if q else qs.order_by(*kind.ordering)


def _write_values(validated: dict[str, Any]) -> dict[str, Any]:
    values = dict(validated)
    values.pop("missing_languages", None)
    return values


class _PlatformDetail(_PlatformBase):
    parser_classes = [JSONParser]

    def get_object(self) -> Any:
        row = self.kind.model.objects.filter(pk=self.kwargs["item_id"]).first()
        if row is None:
            raise Http404
        return row

    def update_response(self, request: Request) -> Response:
        row = self.get_object()
        version = request.data.get("version") if isinstance(request.data, dict) else None
        if not isinstance(version, int):
            raise exceptions.ValidationError({"version": [str(_("This field is required."))]})
        serializer = self.get_serializer(instance=row, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        principal = get_principal(request)
        row = services.update(
            self.kind,
            row,
            _write_values(serializer.validated_data),
            version=version,
            actor=principal.user if principal else None,
            request=request,
        )
        return Response(self.get_serializer(row).data)


class _PlatformChanges(_PlatformBase):
    pagination_class = DefaultPagination
    serializer_class = MasterDataChangeSerializer

    def list_response(self, request: Request, item_id: Any) -> Response:
        if not self.kind.model.objects.filter(pk=item_id).exists():
            raise Http404
        qs = (
            m.MasterDataChange.objects.filter(kind=self.kind.slug, row_id=item_id)
            .select_related("actor")
            .order_by("-changed_at")
        )
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(self.get_serializer(page, many=True).data)


class _ImportCreate(APIView):
    kind: Kind
    permission_classes = [PlatformAdmin]
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [UploadRateThrottle]

    def create_response(self, request: Request) -> Response:
        body = ImportCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        principal = get_principal(request)
        actor = principal.user if principal else None
        if actor is None:  # PlatformAdmin guarantees it
            raise exceptions.NotAuthenticated()
        try:
            upload = upload_services.receive(
                actor=actor,
                audience="platform",
                purpose=IMPORT_PURPOSE,
                django_file=body.validated_data["file"],
                request=request,
            )
        except upload_services.UploadRejected as exc:
            raise exceptions.ValidationError({"file": [str(exc.message)]}) from None
        job = m.MasterDataImport.objects.create(
            kind=self.kind.slug,
            file=upload,
            mode=body.validated_data["mode"],
            created_by=actor,
            expires_at=timezone.now() + IMPORT_TTL,
        )
        return Response(MasterDataImportSerializer(job).data, status=status.HTTP_202_ACCEPTED)


class _ImportDetail(APIView):
    kind: Kind
    permission_classes = [PlatformAdmin]

    def get_job(self, import_id: Any) -> m.MasterDataImport:
        job = m.MasterDataImport.objects.filter(pk=import_id, kind=self.kind.slug).first()
        if job is None:
            raise Http404
        if job.status == m.ImportStatus.PREVIEWED and job.expires_at <= timezone.now():
            job.status = m.ImportStatus.EXPIRED
            job.save(update_fields=["status"])
        return job

    def detail_response(self, request: Request, import_id: Any) -> Response:
        return Response(MasterDataImportSerializer(self.get_job(import_id)).data)


class _ImportConfirm(_ImportDetail):
    permission_classes = [PlatformAdmin, RecentAuthRequired()]

    def confirm_response(self, request: Request, import_id: Any) -> Response:
        key = request.headers.get("Idempotency-Key", "").strip()[:200]
        with transaction.atomic():
            job = self.get_job(import_id)
            job = m.MasterDataImport.objects.select_for_update().get(pk=job.pk)
            replay = key and job.idempotency_key == key
            if replay and job.status in (m.ImportStatus.APPLYING, m.ImportStatus.APPLIED):
                return Response(
                    MasterDataImportSerializer(job).data, status=status.HTTP_202_ACCEPTED
                )
            if job.status == m.ImportStatus.EXPIRED:
                raise BusinessRuleViolation(IMPORT_EXPIRED)
            if job.status != m.ImportStatus.PREVIEWED or job.summary.get("errors"):
                raise BusinessRuleViolation(NOT_PREVIEWED)
            principal = get_principal(request)
            job.status = m.ImportStatus.APPLYING
            job.confirmed_by = principal.user if principal else None
            job.confirmed_at = timezone.now()
            job.idempotency_key = key
            job.save(update_fields=["status", "confirmed_by", "confirmed_at", "idempotency_key"])
            from medilink.masterdata.tasks import apply_import

            job_id = str(job.pk)
            transaction.on_commit(lambda: apply_import.delay(job_id))
        return Response(MasterDataImportSerializer(job).data, status=status.HTTP_202_ACCEPTED)


# ---- per-kind classes ---------------------------------------------------------------------------


def _class_name(kind: Kind, suffix: str) -> str:
    return "".join(part.title() for part in kind.slug.split("-")) + suffix


def build_views(kind: Kind) -> dict[str, Any]:
    tag = ["master-data"]
    localised = localised_serializer(kind.slug)
    platform = platform_serializer(kind.slug)
    views: dict[str, Any] = {}

    if kind.public:

        def public_get(self: Any, request: Request) -> Response:
            return self.list_response(request)

        views["public"] = type(
            _class_name(kind, "PublicList"),
            (_LocalisedList,),
            {
                "kind": kind,
                "public": True,
                "serializer_class": localised,
                "permission_classes": [PublicEndpoint],
                "get": extend_schema(
                    tags=tag,
                    operation_id=f"public_master_data_{kind.slug.replace('-', '_')}_list",
                    parameters=_list_parameters(kind),
                    responses={200: localised(many=True)},
                )(public_get),
            },
        )

    def staff_get(self: Any, request: Request) -> Response:
        return self.list_response(request)

    views["staff"] = type(
        _class_name(kind, "StaffList"),
        (_LocalisedList,),
        {
            "kind": kind,
            "serializer_class": localised,
            "permission_classes": [IsStaffAuthenticated],
            "get": extend_schema(
                tags=tag,
                operation_id=f"staff_master_data_{kind.slug.replace('-', '_')}_list",
                parameters=_list_parameters(kind),
                responses={200: localised(many=True)},
            )(staff_get),
        },
    )

    slug_id = kind.slug.replace("-", "_")

    def platform_list(self: Any, request: Request) -> Response:
        return self.list_response(request)

    def platform_create(self: Any, request: Request) -> Response:
        return self.create_response(request)

    views["platform_list"] = type(
        _class_name(kind, "PlatformList"),
        (_PlatformList,),
        {
            "kind": kind,
            "serializer_class": platform,
            "get": extend_schema(
                tags=tag,
                operation_id=f"platform_master_data_{slug_id}_list",
                parameters=_list_parameters(kind, platform=True),
                responses={200: platform(many=True)},
            )(platform_list),
            "post": extend_schema(
                tags=tag,
                operation_id=f"platform_master_data_{slug_id}_create",
                request=platform,
                responses={
                    201: platform,
                    400: _err("Validation error"),
                    403: _err("Step-up required"),
                },
            )(platform_create),
        },
    )

    def platform_detail(self: Any, request: Request, item_id: Any) -> Response:
        return Response(self.get_serializer(self.get_object()).data)

    def platform_update(self: Any, request: Request, item_id: Any) -> Response:
        return self.update_response(request)

    views["platform_detail"] = type(
        _class_name(kind, "PlatformDetail"),
        (_PlatformDetail,),
        {
            "kind": kind,
            "serializer_class": platform,
            "get": extend_schema(
                tags=tag,
                operation_id=f"platform_master_data_{slug_id}_retrieve",
                responses={200: platform, 404: _err("Not found")},
            )(platform_detail),
            "patch": extend_schema(
                tags=tag,
                operation_id=f"platform_master_data_{slug_id}_update",
                request=platform,
                responses={
                    200: platform,
                    400: _err("Validation error"),
                    403: _err("Step-up required"),
                    409: _err("Version conflict"),
                },
            )(platform_update),
        },
    )

    def platform_changes(self: Any, request: Request, item_id: Any) -> Response:
        return self.list_response(request, item_id)

    views["platform_changes"] = type(
        _class_name(kind, "PlatformChanges"),
        (_PlatformChanges,),
        {
            "kind": kind,
            "get": extend_schema(
                tags=tag,
                operation_id=f"platform_master_data_{slug_id}_changes",
                responses={200: MasterDataChangeSerializer(many=True), 404: _err("Not found")},
            )(platform_changes),
        },
    )

    if kind.importable:

        def import_create(self: Any, request: Request) -> Response:
            return self.create_response(request)

        def import_detail(self: Any, request: Request, import_id: Any) -> Response:
            return self.detail_response(request, import_id)

        def import_confirm(self: Any, request: Request, import_id: Any) -> Response:
            return self.confirm_response(request, import_id)

        views["import_create"] = type(
            _class_name(kind, "ImportCreate"),
            (_ImportCreate,),
            {
                "kind": kind,
                "post": extend_schema(
                    tags=tag,
                    operation_id=f"platform_master_data_{slug_id}_import_create",
                    request={"multipart/form-data": ImportCreateSerializer},
                    responses={202: MasterDataImportSerializer, 400: _err("File refused")},
                )(import_create),
            },
        )
        views["import_detail"] = type(
            _class_name(kind, "ImportDetail"),
            (_ImportDetail,),
            {
                "kind": kind,
                "get": extend_schema(
                    tags=tag,
                    operation_id=f"platform_master_data_{slug_id}_import_retrieve",
                    responses={200: MasterDataImportSerializer, 404: _err("Not found")},
                )(import_detail),
            },
        )
        views["import_confirm"] = type(
            _class_name(kind, "ImportConfirm"),
            (_ImportConfirm,),
            {
                "kind": kind,
                "post": extend_schema(
                    tags=tag,
                    operation_id=f"platform_master_data_{slug_id}_import_confirm",
                    request=None,
                    parameters=[OpenApiParameter("Idempotency-Key", str, OpenApiParameter.HEADER)],
                    responses={
                        202: MasterDataImportSerializer,
                        403: _err("Step-up required"),
                        422: _err("Not previewed, has errors or expired"),
                    },
                )(import_confirm),
            },
        )
    return views


VIEWS: dict[str, dict[str, Any]] = {slug: build_views(kind) for slug, kind in KINDS.items()}
