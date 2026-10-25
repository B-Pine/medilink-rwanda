"""Schedule endpoints (contract sprint-02 §3.3)."""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.http import Http404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import exceptions, status
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.facilities import serializers as s
from medilink.facilities.views_base import FacilityView, Needs, query_date
from medilink.scheduling import services
from medilink.scheduling.models import ScheduleException, ScheduleTemplate
from medilink.tenancy.models import FacilityMembership

TAGS = ["staff-schedules"]
MANAGE = "schedule.manage"
READ = (MANAGE, "schedule.view", "leave.request")


class ScheduleView(FacilityView):
    def own_membership(self) -> FacilityMembership | None:
        return self.principal().membership

    def readable(self, qs: Any) -> Any:
        """Managers and viewers see everyone; doctors (leave.request) only themselves."""
        if self.can(MANAGE, "schedule.view"):
            return qs
        own = self.own_membership()
        return qs.filter(membership_id=own.pk if own else None)


def template_data(t: ScheduleTemplate) -> dict[str, Any]:
    return s.TemplateSerializer(t).data


class TemplatesView(ScheduleView):
    permission_classes = [Needs(*READ, methods={"POST": (MANAGE,)})]

    @extend_schema(
        operation_id="staff_schedule_templates_list",
        tags=TAGS,
        parameters=[OpenApiParameter("membership_id", str), OpenApiParameter("service_id", str)],
        responses={200: s.TemplateSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        rows = self.readable(
            ScheduleTemplate.objects.filter(
                facility_id=self.principal().active_facility_id, ended_at__isnull=True
            )
        )
        for name in ("membership_id", "service_id"):
            if request.query_params.get(name):
                rows = rows.filter(**{name: request.query_params[name]})
        return Response(
            {"results": [template_data(t) for t in rows.order_by("weekday", "starts_at")]}
        )

    @extend_schema(
        operation_id="staff_schedule_templates_create",
        tags=TAGS,
        request=s.TemplateSerializer,
        responses={201: s.TemplateResponseSerializer},
    )
    def post(self, request: Request) -> Response:
        body = s.TemplateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        template, warnings = services.save_template(
            self.facility(), dict(body.validated_data), actor=request.user, request=request
        )
        return Response(
            {"template": template_data(template), "warnings": warnings},
            status=status.HTTP_201_CREATED,
        )


class TemplateDetailView(ScheduleView):
    permission_classes = [Needs(MANAGE)]

    def template(self, template_id: Any) -> ScheduleTemplate:
        found = ScheduleTemplate.objects.filter(
            pk=template_id, facility_id=self.principal().active_facility_id, ended_at__isnull=True
        ).first()
        if found is None:
            raise Http404
        return found

    @extend_schema(
        operation_id="staff_schedule_templates_update",
        tags=TAGS,
        request=s.TemplateUpdateSerializer,
        responses={200: s.TemplateResponseSerializer},
    )
    def patch(self, request: Request, template_id: Any) -> Response:
        body = s.TemplateUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        template, warnings = services.save_template(
            self.facility(),
            dict(body.validated_data),
            actor=request.user,
            request=request,
            template=self.template(template_id),
        )
        return Response({"template": template_data(template), "warnings": warnings})

    @extend_schema(operation_id="staff_schedule_templates_end", tags=TAGS, responses={204: None})
    def delete(self, request: Request, template_id: Any) -> Response:
        services.end_template(
            self.facility(), self.template(template_id), actor=request.user, request=request
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


def exception_data(e: ScheduleException) -> dict[str, Any]:
    data = s.ExceptionSerializer(e).data
    data["member_name"] = e.membership.user.full_name
    return data


class ExceptionsView(ScheduleView):
    permission_classes = [Needs(*READ, methods={"POST": (MANAGE, "leave.request")})]

    @extend_schema(
        operation_id="staff_schedule_exceptions_list",
        tags=TAGS,
        parameters=[OpenApiParameter(n, str) for n in ("status", "membership_id", "from", "to")],
        responses={200: s.ExceptionSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        rows = self.readable(
            ScheduleException.objects.filter(facility_id=self.principal().active_facility_id)
        ).select_related("membership__user")
        if request.query_params.get("status"):
            rows = rows.filter(status=request.query_params["status"])
        if request.query_params.get("membership_id"):
            rows = rows.filter(membership_id=request.query_params["membership_id"])
        start, end = query_date(request, "from"), query_date(request, "to")
        if start:
            rows = rows.filter(ends_at__date__gte=start)
        if end:
            rows = rows.filter(starts_at__date__lte=end)
        return Response({"results": [exception_data(e) for e in rows.order_by("starts_at")]})

    @extend_schema(
        operation_id="staff_schedule_exceptions_create",
        tags=TAGS,
        request=s.ExceptionSerializer,
        responses={201: s.ExceptionResponseSerializer},
    )
    def post(self, request: Request) -> Response:
        body = s.ExceptionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        exception, warnings = services.create_exception(
            self.facility(),
            dict(body.validated_data),
            actor=request.user,
            membership_of_actor=self.own_membership(),
            can_manage=self.can(MANAGE),
            request=request,
        )
        exception = ScheduleException.objects.select_related("membership__user").get(
            pk=exception.pk
        )
        return Response(
            {"exception": exception_data(exception), "warnings": warnings},
            status=status.HTTP_201_CREATED,
        )


class ExceptionActionView(ScheduleView):
    permission_classes = [Needs(MANAGE, "leave.request")]

    @extend_schema(
        operation_id="staff_schedule_exceptions_action",
        tags=TAGS,
        request=s.ExceptionDecisionSerializer,
        responses={200: s.ExceptionSerializer},
    )
    def post(self, request: Request, exception_id: Any, action: str) -> Response:
        if action not in ("approve", "reject", "cancel"):
            raise Http404
        exception = (
            self.readable(
                ScheduleException.objects.filter(
                    pk=exception_id, facility_id=self.principal().active_facility_id
                )
            )
            .select_related("membership__user")
            .first()
        )
        if exception is None:
            raise Http404
        body = s.ExceptionDecisionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        exception = services.decide_exception(
            exception,
            action=action,
            actor=request.user,
            note=body.validated_data["decision_note"],
            request=request,
            can_manage=self.can(MANAGE),
        )
        return Response(exception_data(exception))


class OverviewView(ScheduleView):
    permission_classes = [Needs(*READ)]

    @extend_schema(
        operation_id="staff_schedule_overview",
        tags=TAGS,
        parameters=[OpenApiParameter("from", str), OpenApiParameter("to", str)],
        responses={200: s.ScheduleOverviewSerializer},
    )
    def get(self, request: Request) -> Response:
        start = query_date(request, "from", timezone.localdate())
        end = query_date(request, "to", start + dt.timedelta(days=6))
        if end < start or (end - start).days > 31:
            raise exceptions.ValidationError({"to": ["Use a range of at most 31 days."]})
        facility_id = self.principal().active_facility_id
        blocks = services.blocks(facility_id, start, end)
        members = (
            FacilityMembership.objects.filter(
                facility_id=facility_id, is_active=True, roles__code="doctor"
            )
            .distinct()
            .select_related("user")
        )
        if not self.can(MANAGE, "schedule.view"):  # doctors see only themselves
            members = members.filter(
                pk=getattr(self.own_membership(), "pk", None)  # type: ignore[misc]
            )
        exceptions_ = list(
            ScheduleException.objects.filter(
                facility_id=facility_id, starts_at__date__lte=end, ends_at__date__gte=start
            ).select_related("membership__user")
        )
        return Response(
            {
                "members": [
                    {
                        "membership_id": m.pk,
                        "full_name": m.user.full_name,
                        "blocks": [b for b in blocks if b["membership_id"] == str(m.pk)],
                        "exceptions": [
                            exception_data(e) for e in exceptions_ if e.membership_id == m.pk
                        ],
                    }
                    for m in members
                ]
            }
        )
