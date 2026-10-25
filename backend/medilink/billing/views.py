"""Tariff and insurer-rule endpoints (contract sprint-02 §3.4)."""

from __future__ import annotations

from typing import Any

from django.http import Http404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.authz.stepup import RecentAuthRequired
from medilink.billing import services
from medilink.billing.models import InsurerRule, TariffItem
from medilink.facilities import serializers as s
from medilink.facilities.views_base import FacilityView, Needs, query_date

TAGS = ["staff-billing-setup"]
CONFIGURE = "facility.configure"
READ = (CONFIGURE, "billing.record_payment")
STEP_UP_WRITES = RecentAuthRequired(methods=("POST", "PATCH"))


class TariffView(FacilityView):
    permission_classes = [Needs(*READ, methods={"POST": (CONFIGURE,)}), STEP_UP_WRITES]

    @extend_schema(
        operation_id="staff_tariff_items_list",
        tags=TAGS,
        parameters=[OpenApiParameter("on", str)],
        responses={200: s.TariffSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        on = query_date(request, "on", timezone.localdate())
        rows = TariffItem.objects.filter(
            services.current_q(on), facility_id=self.principal().active_facility_id
        ).order_by("code")
        return Response({"results": s.TariffSerializer(rows, many=True).data})

    @extend_schema(
        operation_id="staff_tariff_items_create",
        tags=TAGS,
        request=s.TariffSerializer,
        responses={201: s.TariffSerializer},
    )
    def post(self, request: Request) -> Response:
        body = s.TariffSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        item = services.create_tariff(
            self.facility(), dict(body.validated_data), actor=request.user, request=request
        )
        return Response(s.TariffSerializer(item).data, status=status.HTTP_201_CREATED)


class TariffDetailView(FacilityView):
    permission_classes = [Needs(CONFIGURE), STEP_UP_WRITES]

    @extend_schema(
        operation_id="staff_tariff_items_change",
        tags=TAGS,
        request=s.TariffChangeSerializer,
        responses={200: s.TariffChangeResponseSerializer},
    )
    def patch(self, request: Request, item_id: Any) -> Response:
        item = TariffItem.objects.filter(
            pk=item_id, facility_id=self.principal().active_facility_id
        ).first()
        if item is None:
            raise Http404
        body = s.TariffChangeSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        previous, current = services.change_tariff(
            self.facility(), item, dict(body.validated_data), actor=request.user, request=request
        )
        return Response(
            {
                "previous": s.TariffSerializer(previous).data,
                "current": s.TariffSerializer(current).data,
            }
        )


class TariffHistoryView(FacilityView):
    permission_classes = [Needs(CONFIGURE)]

    @extend_schema(
        operation_id="staff_tariff_items_history",
        tags=TAGS,
        responses={200: s.TariffSerializer(many=True)},
    )
    def get(self, request: Request, code: str) -> Response:
        rows = TariffItem.objects.filter(
            facility_id=self.principal().active_facility_id, code=code
        ).order_by("-valid_from")
        if not rows.exists():
            raise Http404
        return Response({"results": s.TariffSerializer(rows, many=True).data})


class RulesView(FacilityView):
    permission_classes = [Needs(*READ, methods={"POST": (CONFIGURE,)}), STEP_UP_WRITES]

    @extend_schema(
        operation_id="staff_insurer_rules_list",
        tags=TAGS,
        parameters=[OpenApiParameter("on", str)],
        responses={200: s.InsurerRuleSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        on = query_date(request, "on", timezone.localdate())
        rows = InsurerRule.objects.filter(
            services.current_q(on), facility_id=self.principal().active_facility_id
        ).order_by("insurer_code")
        return Response({"results": s.InsurerRuleSerializer(rows, many=True).data})

    @extend_schema(
        operation_id="staff_insurer_rules_create",
        tags=TAGS,
        request=s.InsurerRuleSerializer,
        responses={201: s.InsurerRuleSerializer},
    )
    def post(self, request: Request) -> Response:
        body = s.InsurerRuleSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        rule = services.create_rule(
            self.facility(), dict(body.validated_data), actor=request.user, request=request
        )
        return Response(s.InsurerRuleSerializer(rule).data, status=status.HTTP_201_CREATED)


class RuleDetailView(FacilityView):
    permission_classes = [Needs(CONFIGURE), STEP_UP_WRITES]

    @extend_schema(
        operation_id="staff_insurer_rules_change",
        tags=TAGS,
        request=s.InsurerRuleChangeSerializer,
        responses={200: s.InsurerRuleChangeResponseSerializer},
    )
    def patch(self, request: Request, rule_id: Any) -> Response:
        rule = InsurerRule.objects.filter(
            pk=rule_id, facility_id=self.principal().active_facility_id
        ).first()
        if rule is None:
            raise Http404
        body = s.InsurerRuleChangeSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        previous, current = services.change_rule(
            self.facility(), rule, dict(body.validated_data), actor=request.user, request=request
        )
        return Response(
            {
                "previous": s.InsurerRuleSerializer(previous).data,
                "current": s.InsurerRuleSerializer(current).data,
            }
        )
