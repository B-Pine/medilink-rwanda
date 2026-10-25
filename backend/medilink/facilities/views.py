"""Facility configuration endpoints (contract sprint-02 §3.1, §3.2)."""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.http import Http404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import exceptions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.audit.services import record
from medilink.authz.stepup import RecentAuthRequired
from medilink.core.pagination import DefaultPagination
from medilink.core.throttling import BurstRateThrottle
from medilink.facilities import calendar, checklist, services, settings_schema
from medilink.facilities import serializers as s
from medilink.facilities.models import (
    CalendarEvent,
    ConfigChange,
    Department,
    OpeningHours,
    Service,
    ServicePoint,
)
from medilink.facilities.views_base import FacilityView, Member, Needs, err, query_date
from medilink.uploads import services as uploads
from medilink.uploads.throttling import UploadRateThrottle
from medilink.uploads.views import rejected

TAGS = ["staff-facility"]
CONFIGURE = "facility.configure"
MAX_PHOTOS = 6


def profile_data(facility: Any) -> dict[str, Any]:
    profile = services.profile_of(facility)
    return s.FacilityProfileSerializer(
        {
            "id": facility.pk,
            "name": facility.name,
            "slug": facility.slug,
            "status": facility.status,
            "facility_type": facility.facility_type,
            "description_i18n": profile.description_i18n,
            "phone": profile.phone,
            "email": profile.email,
            "website": profile.website,
            "address": profile.address,
            "village_code": profile.village_code,
            "latitude": profile.latitude,
            "longitude": profile.longitude,
            "photos": profile.photo_file_ids,
            "level_of_care": profile.level_of_care,
            "version": profile.version,
        }
    ).data


class ProfileView(FacilityView):
    permission_classes = [Needs(methods={"PATCH": (CONFIGURE,)})]

    @extend_schema(
        operation_id="staff_facility_retrieve",
        tags=TAGS,
        responses={200: s.FacilityProfileSerializer},
    )
    def get(self, request: Request) -> Response:
        return Response(profile_data(self.facility()))

    @extend_schema(
        operation_id="staff_facility_update",
        tags=TAGS,
        request=s.FacilityProfileUpdateSerializer,
        responses={200: s.FacilityProfileSerializer, 409: err("conflict")},
    )
    def patch(self, request: Request) -> Response:
        body = s.FacilityProfileUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        facility = self.facility()
        services.update_profile(
            facility, dict(body.validated_data), actor=request.user, request=request
        )
        return Response(profile_data(facility))


class PhotoView(FacilityView):
    permission_classes = [Needs(CONFIGURE)]
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [BurstRateThrottle, UploadRateThrottle]

    @extend_schema(
        operation_id="staff_facility_photos_create",
        tags=TAGS,
        request={"multipart/form-data": s.PhotoSerializer},
        responses={201: s.FacilityProfileSerializer},
    )
    def post(self, request: Request) -> Response:
        body = s.PhotoSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        facility = self.facility()
        profile = services.profile_of(facility)
        if len(profile.photo_file_ids) >= MAX_PHOTOS:
            raise exceptions.ValidationError({"file": ["Up to 6 photos."]})
        try:
            file = uploads.receive(
                actor=request.user,
                audience="staff",
                purpose="facility_photo",
                django_file=body.validated_data["file"],
                facility_id=facility.pk,
                request=request,
            )
        except uploads.UploadRejected as exc:
            raise rejected(exc) from None
        services.set_photos(
            facility, [*profile.photo_file_ids, file.pk], actor=request.user, request=request
        )
        return Response(profile_data(facility), status=status.HTTP_201_CREATED)


class PhotoDeleteView(FacilityView):
    permission_classes = [Needs(CONFIGURE)]

    @extend_schema(operation_id="staff_facility_photos_delete", tags=TAGS, responses={204: None})
    def delete(self, request: Request, upload_id: Any) -> Response:
        facility = self.facility()
        profile = services.profile_of(facility)
        if upload_id not in profile.photo_file_ids:
            raise Http404
        services.set_photos(
            facility,
            [p for p in profile.photo_file_ids if p != upload_id],
            actor=request.user,
            request=request,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


def hours_data(facility: Any, service_id: Any) -> dict[str, Any]:
    rows = OpeningHours.objects.filter(facility=facility, service_id=service_id).order_by("weekday")
    return s.HoursResponseSerializer(
        {
            "service_id": service_id,
            "days": [
                {
                    "weekday": h.weekday,
                    "opens_at": h.opens_at,
                    "closes_at": h.closes_at,
                    "break_starts_at": h.break_starts_at,
                    "break_ends_at": h.break_ends_at,
                }
                for h in rows
            ],
            "version": services.hours_version(facility, service_id),
        }
    ).data


class HoursView(FacilityView):
    permission_classes = [Needs(methods={"PUT": (CONFIGURE,)})]

    @extend_schema(
        operation_id="staff_facility_hours_retrieve",
        tags=TAGS,
        parameters=[OpenApiParameter("service_id", str)],
        responses={200: s.HoursResponseSerializer},
    )
    def get(self, request: Request) -> Response:
        return Response(hours_data(self.facility(), request.query_params.get("service_id") or None))

    @extend_schema(
        operation_id="staff_facility_hours_replace",
        tags=TAGS,
        request=s.HoursSerializer,
        responses={
            200: s.HoursResponseSerializer,
            409: err("conflict"),
            422: err("outside facility hours"),
        },
    )
    def put(self, request: Request) -> Response:
        body = s.HoursSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        facility = self.facility()
        services.replace_hours(
            facility,
            service_id=data.get("service_id"),
            version=data["version"],
            days=[dict(d) for d in data["days"]],
            actor=request.user,
            request=request,
        )
        return Response(hours_data(facility, data.get("service_id")))


def event_data(event: CalendarEvent) -> dict[str, Any]:
    return s.CalendarEventSerializer(event).data


class CalendarEventsView(FacilityView):
    permission_classes = [Needs(methods={"POST": (CONFIGURE, "schedule.manage")})]

    @extend_schema(
        operation_id="staff_facility_calendar_events_list",
        tags=TAGS,
        parameters=[OpenApiParameter("from", str), OpenApiParameter("to", str)],
        responses={200: s.CalendarEventSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        start = query_date(request, "from", timezone.localdate() - dt.timedelta(days=30))
        end = query_date(request, "to", timezone.localdate() + dt.timedelta(days=365))
        events = CalendarEvent.objects.filter(
            facility_id=self.principal().active_facility_id,
            deleted_at__isnull=True,
            starts_at__date__lte=end,
            ends_at__date__gte=start,
        ).order_by("starts_at")
        return Response({"results": [event_data(e) for e in events]})

    @extend_schema(
        operation_id="staff_facility_calendar_events_create",
        tags=TAGS,
        request=s.CalendarEventSerializer,
        responses={201: s.CalendarEventSerializer},
    )
    def post(self, request: Request) -> Response:
        body = s.CalendarEventSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        event = services.save_event(
            self.facility(), dict(body.validated_data), actor=request.user, request=request
        )
        return Response(event_data(event), status=status.HTTP_201_CREATED)


class CalendarEventDetailView(FacilityView):
    permission_classes = [Needs(CONFIGURE, "schedule.manage")]

    def event(self, event_id: Any) -> CalendarEvent:
        event = CalendarEvent.objects.filter(
            pk=event_id, facility_id=self.principal().active_facility_id, deleted_at__isnull=True
        ).first()
        if event is None:
            raise Http404
        return event

    @extend_schema(
        operation_id="staff_facility_calendar_events_update",
        tags=TAGS,
        request=s.CalendarEventSerializer,
        responses={200: s.CalendarEventSerializer},
    )
    def patch(self, request: Request, event_id: Any) -> Response:
        event = self.event(event_id)
        body = s.CalendarEventSerializer(data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        event = services.save_event(
            self.facility(),
            dict(body.validated_data),
            actor=request.user,
            request=request,
            event=event,
        )
        return Response(event_data(event))

    @extend_schema(
        operation_id="staff_facility_calendar_events_delete", tags=TAGS, responses={204: None}
    )
    def delete(self, request: Request, event_id: Any) -> Response:
        services.delete_event(
            self.facility(), self.event(event_id), actor=request.user, request=request
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class CalendarView(FacilityView):
    permission_classes = [Member]

    @extend_schema(
        operation_id="staff_facility_calendar",
        tags=TAGS,
        parameters=[
            OpenApiParameter("from", str),
            OpenApiParameter("to", str),
            OpenApiParameter("service_id", str),
        ],
        responses={200: s.CalendarSerializer},
    )
    def get(self, request: Request) -> Response:
        start = query_date(request, "from", timezone.localdate())
        end = query_date(request, "to", start + dt.timedelta(days=27))
        try:
            days = calendar.effective_calendar(
                self.principal().active_facility_id,
                start,
                end,
                request.query_params.get("service_id") or None,
            )
        except ValueError:
            raise exceptions.ValidationError({"to": ["Use a range of at most 92 days."]}) from None
        return Response(
            {
                "days": [
                    {
                        "date": d.date,
                        "open": [
                            {"starts": a.strftime("%H:%M"), "ends": b.strftime("%H:%M")}
                            for a, b in d.open
                        ],
                        "closed_reason": d.closed_reason,
                        "holiday_name": d.holiday_name,
                        "umuganda": d.umuganda,
                    }
                    for d in days
                ]
            }
        )


def settings_payload(facility: Any) -> dict[str, Any]:
    data = services.settings_data(services.settings_of(facility))
    data["schema"] = {
        section: {
            name: {
                "kind": spec.kind,
                "default": spec.default,
                "minimum": spec.minimum,
                "maximum": spec.maximum,
                "choices": list(spec.choices),
            }
            for name, spec in fields.items()
        }
        for section, fields in settings_schema.schema().items()
    }
    return data


class SettingsView(FacilityView):
    permission_classes = [Needs(methods={"PATCH": (CONFIGURE,)})]

    @extend_schema(
        operation_id="staff_facility_settings_retrieve",
        tags=TAGS,
        responses={200: s.SettingsSerializer},
    )
    def get(self, request: Request) -> Response:
        return Response(settings_payload(self.facility()))

    @extend_schema(
        operation_id="staff_facility_settings_update",
        tags=TAGS,
        request=s.SettingsUpdateSerializer,
        responses={
            200: s.SettingsSerializer,
            403: err("step_up_required (billing)"),
            409: err("conflict"),
        },
    )
    def patch(self, request: Request) -> Response:
        from medilink.authz.stepup import has_recent_auth
        from medilink.core.exceptions import StepUpRequired

        body = s.SettingsUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        if data["section"] == "billing" and not has_recent_auth(request):
            raise StepUpRequired()
        facility = self.facility()
        services.update_settings(
            facility,
            version=data["version"],
            section=data["section"],
            values=data["values"],
            actor=request.user,
            request=request,
        )
        return Response(settings_payload(facility))


def branding_data(facility: Any) -> dict[str, Any]:
    row = services.branding_of(facility)
    return {
        "letterhead_upload_id": row.letterhead_file_id,
        "logo_upload_id": row.logo_file_id,
        "stamp_upload_id": row.stamp_file_id,
        "footer_text": row.footer_text,
        "version": row.version,
    }


class BrandingView(FacilityView):
    permission_classes = [Needs(methods={"PUT": (CONFIGURE,)})]

    @extend_schema(
        operation_id="staff_facility_branding_retrieve",
        tags=TAGS,
        responses={200: s.BrandingResponseSerializer},
    )
    def get(self, request: Request) -> Response:
        return Response(branding_data(self.facility()))

    @extend_schema(
        operation_id="staff_facility_branding_replace",
        tags=TAGS,
        request=s.BrandingSerializer,
        responses={200: s.BrandingResponseSerializer},
    )
    def put(self, request: Request) -> Response:
        from medilink.uploads.models import UploadedFile

        body = s.BrandingSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = dict(body.validated_data)
        facility = self.facility()
        mapping = {
            "letterhead_upload_id": "letterhead_file_id",
            "logo_upload_id": "logo_file_id",
            "stamp_upload_id": "stamp_file_id",
        }
        values: dict[str, Any] = {"version": data["version"]}
        for key, field in mapping.items():
            if key in data:
                upload_id = data[key]
                if (
                    upload_id
                    and not UploadedFile.objects.filter(
                        pk=upload_id,
                        facility_id=facility.pk,
                        purpose="facility_branding",
                        deleted_at__isnull=True,
                    ).exists()
                ):
                    raise exceptions.ValidationError({key: ["Upload the image first."]})
                values[field] = upload_id
        if "footer_text" in data:
            values["footer_text"] = data["footer_text"]
        services.update_branding(facility, values, actor=request.user, request=request)
        return Response(branding_data(facility))


class ConfigChangesView(FacilityView):
    permission_classes = [Needs(CONFIGURE)]

    @extend_schema(
        operation_id="staff_facility_config_changes",
        tags=TAGS,
        parameters=[OpenApiParameter("entity", str), OpenApiParameter("page", int)],
        responses={200: s.ConfigChangeSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        rows = ConfigChange.objects.filter(
            facility_id=self.principal().active_facility_id
        ).select_related("actor")
        entity = request.query_params.get("entity")
        if entity:
            rows = rows.filter(entity=entity)
        rows = rows.order_by("-changed_at")
        paginator = DefaultPagination()
        page: list[ConfigChange] | None = paginator.paginate_queryset(rows, request, view=self)
        return paginator.get_paginated_response(
            [
                {
                    "id": r.pk,
                    "entity": r.entity,
                    "entity_id": r.entity_id,
                    "field": r.field,
                    "old_value": r.old_value,
                    "new_value": r.new_value,
                    "actor_name": r.actor.full_name if r.actor else None,
                    "changed_at": r.changed_at,
                }
                for r in page or []
            ]
        )


class ChecklistView(FacilityView):
    permission_classes = [Needs(CONFIGURE)]

    @extend_schema(
        operation_id="staff_facility_setup_checklist",
        tags=TAGS,
        responses={200: s.ChecklistSerializer},
    )
    def get(self, request: Request) -> Response:
        facility = self.facility()
        items = checklist.checklist(facility)
        return Response(
            {
                "items": [vars(i) for i in items],
                "complete": all(i.done for i in items),
                "status": facility.status,
            }
        )


class GoLiveView(FacilityView):
    permission_classes = [Needs(CONFIGURE), RecentAuthRequired()]

    @extend_schema(
        operation_id="staff_facility_go_live",
        tags=TAGS,
        request=s.GoLiveSerializer,
        responses={200: s.FacilityProfileSerializer, 422: err("failing checks in fields")},
    )
    def post(self, request: Request) -> Response:
        from medilink.onboarding.services import GoLiveFailed, change_facility_status
        from medilink.uploads.views import idempotency_key

        body = s.GoLiveSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        facility = self.facility()
        try:
            facility = change_facility_status(
                facility,
                "go_live",
                version=body.validated_data["version"],
                actor=request.user,
                idempotency_key=idempotency_key(request),
                request=request,
            )
        except GoLiveFailed as exc:
            from medilink.core.exceptions import error_response

            record(
                "facilities.go_live.requested",
                request=request,
                facility_id=facility.pk,
                object_type="facility",
                object_id=facility.pk,
                metadata={"result": "refused"},
            )
            fields = {
                f"checks.{code}": [p["message"] for p in problems]
                for code, problems in exc.failing.items()
            }
            return error_response(422, "business_rule_violation", exc.detail, fields)
        record(
            "facilities.go_live.requested",
            request=request,
            facility_id=facility.pk,
            object_type="facility",
            object_id=facility.pk,
            metadata={"result": "live"},
        )
        return Response(profile_data(facility))


# ---- catalogue -----------------------------------------------------------------------------------

CAT_TAGS = ["staff-facility-catalogue"]


class DepartmentsView(FacilityView):
    permission_classes = [Needs(methods={"POST": (CONFIGURE,)})]

    @extend_schema(
        operation_id="staff_departments_list",
        tags=CAT_TAGS,
        responses={200: s.DepartmentSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        rows = Department.objects.filter(facility_id=self.principal().active_facility_id)
        return Response({"results": s.DepartmentSerializer(rows, many=True).data})

    @extend_schema(
        operation_id="staff_departments_create",
        tags=CAT_TAGS,
        request=s.DepartmentSerializer,
        responses={201: s.DepartmentSerializer},
    )
    def post(self, request: Request) -> Response:
        body = s.DepartmentSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        department = services.save_department(
            self.facility(), dict(body.validated_data), actor=request.user, request=request
        )
        return Response(s.DepartmentSerializer(department).data, status=status.HTTP_201_CREATED)


class DepartmentDetailView(FacilityView):
    permission_classes = [Needs(CONFIGURE)]

    @extend_schema(
        operation_id="staff_departments_update",
        tags=CAT_TAGS,
        request=s.DepartmentUpdateSerializer,
        responses={200: s.DepartmentSerializer},
    )
    def patch(self, request: Request, department_id: Any) -> Response:
        department = Department.objects.filter(
            pk=department_id, facility_id=self.principal().active_facility_id
        ).first()
        if department is None:
            raise Http404
        body = s.DepartmentUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        department = services.save_department(
            self.facility(),
            dict(body.validated_data),
            actor=request.user,
            request=request,
            department=department,
        )
        return Response(s.DepartmentSerializer(department).data)


class ServicesView(FacilityView):
    permission_classes = [Needs(methods={"POST": (CONFIGURE,)})]

    @extend_schema(
        operation_id="staff_services_list",
        tags=CAT_TAGS,
        responses={200: s.ServiceSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        rows = Service.objects.filter(facility_id=self.principal().active_facility_id).order_by(
            "department__sort_order", "created_at"
        )
        return Response({"results": s.ServiceSerializer(rows, many=True).data})

    @extend_schema(
        operation_id="staff_services_create",
        tags=CAT_TAGS,
        request=s.ServiceSerializer,
        responses={201: s.ServiceResponseSerializer, 409: err("ticket prefix taken")},
    )
    def post(self, request: Request) -> Response:
        body = s.ServiceSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        service, warnings = services.save_service(
            self.facility(), dict(body.validated_data), actor=request.user, request=request
        )
        return Response(
            {"service": s.ServiceSerializer(service).data, "warnings": warnings},
            status=status.HTTP_201_CREATED,
        )


class ServiceDetailView(FacilityView):
    permission_classes = [Needs(CONFIGURE)]

    @extend_schema(
        operation_id="staff_services_update",
        tags=CAT_TAGS,
        request=s.ServiceUpdateSerializer,
        responses={200: s.ServiceResponseSerializer},
    )
    def patch(self, request: Request, service_id: Any) -> Response:
        service = Service.objects.filter(
            pk=service_id, facility_id=self.principal().active_facility_id
        ).first()
        if service is None:
            raise Http404
        body = s.ServiceUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        service, warnings = services.save_service(
            self.facility(),
            dict(body.validated_data),
            actor=request.user,
            request=request,
            service=service,
        )
        return Response({"service": s.ServiceSerializer(service).data, "warnings": warnings})


def point_data(point: ServicePoint) -> dict[str, Any]:
    return {
        "id": point.pk,
        "name": point.name,
        "kind": point.kind,
        "service_ids": [str(x) for x in point.services.values_list("pk", flat=True)],
        "is_active": point.is_active,
    }


class ServicePointsView(FacilityView):
    permission_classes = [Needs(methods={"POST": (CONFIGURE,)})]

    @extend_schema(
        operation_id="staff_service_points_list",
        tags=CAT_TAGS,
        responses={200: s.ServicePointSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        rows = ServicePoint.objects.filter(
            facility_id=self.principal().active_facility_id
        ).prefetch_related("services")
        return Response({"results": [point_data(p) for p in rows]})

    @extend_schema(
        operation_id="staff_service_points_create",
        tags=CAT_TAGS,
        request=s.ServicePointSerializer,
        responses={201: s.ServicePointSerializer},
    )
    def post(self, request: Request) -> Response:
        body = s.ServicePointSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        point = services.save_service_point(
            self.facility(), dict(body.validated_data), actor=request.user, request=request
        )
        return Response(point_data(point), status=status.HTTP_201_CREATED)


class ServicePointDetailView(FacilityView):
    permission_classes = [Needs(CONFIGURE)]

    @extend_schema(
        operation_id="staff_service_points_update",
        tags=CAT_TAGS,
        request=s.ServicePointUpdateSerializer,
        responses={200: s.ServicePointSerializer},
    )
    def patch(self, request: Request, point_id: Any) -> Response:
        point = ServicePoint.objects.filter(
            pk=point_id, facility_id=self.principal().active_facility_id
        ).first()
        if point is None:
            raise Http404
        body = s.ServicePointUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        point = services.save_service_point(
            self.facility(),
            dict(body.validated_data),
            actor=request.user,
            request=request,
            point=point,
        )
        return Response(point_data(point))
