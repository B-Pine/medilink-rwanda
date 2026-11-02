"""P5 `POST /public/triage/` (contract public-pages-and-triage §2.2)."""

from __future__ import annotations

from typing import Any

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.authz.permissions import PublicEndpoint
from medilink.masterdata.models import Symptom
from medilink.patients.errors import PatientsAPIView
from medilink.triage import rules
from medilink.triage.models import TriageLog
from medilink.uploads.throttling import EnvRateThrottle


class TriageThrottle(EnvRateThrottle):
    scope = "triage"
    env_var = "THROTTLE_RATE_TRIAGE"
    default_rate = "20/min"

    def get_ident_for(self, request: Any, view: Any) -> str | None:
        return self.get_ident(request)


class TriageRequestSerializer(serializers.Serializer):
    symptoms = serializers.ListField(
        child=serializers.CharField(max_length=40), min_length=1, max_length=8
    )
    duration = serializers.ChoiceField(choices=rules.DURATIONS)
    age_group = serializers.ChoiceField(choices=rules.AGE_GROUPS)
    pregnant = serializers.BooleanField(default=False)

    def validate_symptoms(self, value: list[str]) -> list[str]:
        known = set(
            Symptom.objects.filter(code__in=value, is_active=True).values_list("code", flat=True)
        )
        unknown = sorted(set(value) - known)
        if unknown:
            raise serializers.ValidationError(f"Unknown symptom codes: {', '.join(unknown)}.")
        return sorted(set(value))

    def to_internal_value(self, data: Any) -> Any:
        extra = set(data) - set(self.fields) if isinstance(data, dict) else set()
        if extra:
            raise serializers.ValidationError({key: ["Unknown field."] for key in sorted(extra)})
        return super().to_internal_value(data)


class TriageResultSerializer(serializers.Serializer):
    urgency = serializers.ChoiceField(choices=rules.URGENCY_ORDER)
    service_code = serializers.CharField()
    # the search filter's values (S5 P1): primary, secondary or tertiary
    level_of_care = serializers.CharField()
    red_flags = serializers.ListField(child=serializers.CharField())
    reasons = serializers.ListField(child=serializers.CharField())
    rules_version = serializers.CharField()
    signed_off = serializers.BooleanField()


class TriageView(PatientsAPIView):
    permission_classes = [PublicEndpoint]
    authentication_classes: list[Any] = []
    throttle_classes = [TriageThrottle]

    @extend_schema(
        operation_id="public_triage",
        tags=["public"],
        request=TriageRequestSerializer,
        responses={200: TriageResultSerializer},
        description=(
            "Rules-based care navigation, not a diagnosis (analysis 11): an urgency, a service "
            "and a level of care. No account and no personal data; each answer is logged "
            "de-identified."
        ),
    )
    def post(self, request: Request) -> Response:
        body = TriageRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        answers = rules.Answers(
            symptoms=frozenset(data["symptoms"]),
            duration=data["duration"],
            age_group=data["age_group"],
            pregnant=data["pregnant"],
        )
        red = Symptom.objects.filter(is_red_flag=True, is_active=True).values_list(
            "code", flat=True
        )
        result = rules.triage(answers, set(red))
        TriageLog.objects.create(
            symptoms=sorted(answers.symptoms),
            duration=answers.duration,
            age_group=answers.age_group,
            pregnant=answers.can_be_pregnant,
            urgency=result.urgency,
            service_code=result.service_code,
            level_of_care=result.level_of_care,
            rule=result.rule,
            rules_version=rules.RULES_VERSION,
        )
        response = Response(
            {
                "urgency": result.urgency,
                "service_code": result.service_code,
                "level_of_care": result.level_of_care,
                "red_flags": list(result.red_flags),
                "reasons": list(result.reasons),
                "rules_version": rules.RULES_VERSION,
                "signed_off": rules.SIGNED_OFF,
            }
        )
        response["Cache-Control"] = "no-store"
        return response
