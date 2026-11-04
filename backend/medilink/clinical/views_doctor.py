"""Doctor tools API (upgrade 05 §3): questions inbox, my follow-ups, my activity, my templates.

All scoped to the signed-in clinician; nothing here lists another doctor's work.
"""

from __future__ import annotations

from typing import Any, cast

from django.db import IntegrityError
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import exceptions, serializers, status
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.accounts.models import ClinicianTemplate, User
from medilink.accounts.serializers import StrictSerializer
from medilink.authz.stepup import RecentAuthRequired
from medilink.clinical import doctor_tools
from medilink.clinical.views import ClinicalView
from medilink.core.exceptions import Conflict
from medilink.facilities.views_base import Needs, err
from medilink.pharmacy.models import PrescriptionQuery, QueryStatus

TAGS = ["clinical"]
WRITE = "clinical.write"
ISSUE = "prescription.issue"


# ---- serializers ----------------------------------------------------------------------------


class PharmacyQuestionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    status = serializers.ChoiceField(choices=QueryStatus.choices)
    message = serializers.CharField()
    raised_by_name = serializers.CharField()
    raised_at = serializers.DateTimeField()
    answered_at = serializers.DateTimeField(allow_null=True)
    prescription_id = serializers.UUIDField()
    consultation_id = serializers.UUIDField()
    facility_patient_id = serializers.UUIDField()
    patient_display_name = serializers.CharField()
    items = serializers.ListField(child=serializers.CharField())


class QuestionReplySerializer(StrictSerializer):
    body = serializers.CharField(min_length=2, max_length=2000)


class MyFollowUpSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    patient_display_name = serializers.CharField()
    facility_patient_id = serializers.UUIDField()
    service_name_i18n = serializers.DictField()
    due_on = serializers.DateField()
    mode = serializers.CharField()
    status = serializers.CharField()
    state = serializers.ChoiceField(choices=["missed", "today", "upcoming", "attended"])
    booking_starts_at = serializers.DateTimeField(allow_null=True)
    consultation_id = serializers.UUIDField(allow_null=True)


class MyActivityDaySerializer(serializers.Serializer):
    date = serializers.DateField()
    seen = serializers.IntegerField()
    signed = serializers.IntegerField()


class TopDiagnosisSerializer(serializers.Serializer):
    code = serializers.CharField()
    display = serializers.CharField()
    count = serializers.IntegerField()


class MyActivitySerializer(serializers.Serializer):
    days = serializers.IntegerField()
    seen = serializers.IntegerField()
    signed = serializers.IntegerField()
    avg_consult_min = serializers.IntegerField(allow_null=True)
    late_signatures = serializers.IntegerField()
    unsigned_now = serializers.IntegerField()
    follow_ups_set = serializers.IntegerField()
    trend = MyActivityDaySerializer(many=True)
    top_diagnoses = TopDiagnosisSerializer(many=True)


class NoteTemplateItemSerializer(serializers.Serializer):
    drug_code = serializers.CharField(max_length=40, required=False, allow_blank=True, default="")
    free_text_drug = serializers.CharField(
        max_length=120, required=False, allow_blank=True, default=""
    )
    drug_display = serializers.CharField(
        max_length=300, required=False, allow_blank=True, default=""
    )
    dose = serializers.CharField(max_length=60)
    frequency_code = serializers.CharField(max_length=20)
    route = serializers.CharField(max_length=20)
    duration_days = serializers.IntegerField(
        min_value=1, max_value=365, required=False, allow_null=True
    )
    quantity = serializers.IntegerField(
        min_value=1, max_value=10000, required=False, allow_null=True
    )
    instructions = serializers.CharField(
        max_length=500, required=False, allow_blank=True, default=""
    )


class NoteTemplateSectionsSerializer(serializers.Serializer):
    history_text = serializers.CharField(
        max_length=4000, required=False, allow_blank=True, default=""
    )
    examination_text = serializers.CharField(
        max_length=4000, required=False, allow_blank=True, default=""
    )
    plan_text = serializers.CharField(max_length=4000, required=False, allow_blank=True, default="")
    patient_instructions_text = serializers.CharField(
        max_length=4000, required=False, allow_blank=True, default=""
    )


class NoteTemplateTestSerializer(serializers.Serializer):
    """A lab test on an order set (W3 extension point for W2 lab orders; not ordered yet)."""

    code = serializers.CharField(max_length=40)
    name = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class NoteTemplateInputSerializer(StrictSerializer):
    name = serializers.CharField(max_length=80)
    sections = NoteTemplateSectionsSerializer(required=False)
    diagnosis_codes = serializers.ListField(
        child=serializers.CharField(max_length=10), required=False, default=list, max_length=5
    )
    items = NoteTemplateItemSerializer(many=True, required=False, default=list)
    tests = NoteTemplateTestSerializer(many=True, required=False, default=list)

    def validate_items(self, value: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if len(value) > 10:
            raise serializers.ValidationError("At most 10 medicines.")
        return value

    def validate_tests(self, value: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if len(value) > 10:
            raise serializers.ValidationError("At most 10 tests.")
        return value


class TemplateDiagnosisSerializer(serializers.Serializer):
    code = serializers.CharField()
    display = serializers.CharField()
    plain_language = serializers.CharField(allow_blank=True)
    is_sensitive = serializers.BooleanField()
    is_known = serializers.BooleanField(
        help_text="False when the code is not an active ICD-10 code: applying skips it."
    )


class NoteTemplateSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    sections = NoteTemplateSectionsSerializer()
    diagnosis_codes = serializers.ListField(child=serializers.CharField())
    diagnoses = TemplateDiagnosisSerializer(many=True)
    items = NoteTemplateItemSerializer(many=True)
    tests = NoteTemplateTestSerializer(many=True)
    use_count = serializers.IntegerField()
    updated_at = serializers.DateTimeField()


class FavouriteDiagnosisSerializer(serializers.Serializer):
    code = serializers.CharField()
    display = serializers.CharField()
    plain_language = serializers.CharField(allow_blank=True)
    count = serializers.IntegerField()


class FavouriteMedicineSerializer(serializers.Serializer):
    drug_code = serializers.CharField(allow_blank=True)
    free_text_drug = serializers.CharField(allow_blank=True)
    drug_display = serializers.CharField()
    is_controlled = serializers.BooleanField()
    available_here = serializers.BooleanField()
    dose = serializers.CharField()
    frequency_code = serializers.CharField()
    route = serializers.CharField()
    duration_days = serializers.IntegerField(allow_null=True)
    count = serializers.IntegerField()


class FavouritesSerializer(serializers.Serializer):
    window_days = serializers.IntegerField()
    diagnoses = FavouriteDiagnosisSerializer(many=True)
    medicines = FavouriteMedicineSerializer(many=True)


def template_data(
    t: ClinicianTemplate, labels: dict[str, dict[str, Any]] | None = None
) -> dict[str, Any]:
    if labels is None:
        labels = doctor_tools.diagnosis_labels(list(t.diagnosis_codes))
    return {
        "id": t.pk,
        "name": t.name,
        "sections": {
            key: (t.sections or {}).get(key, "")
            for key in (
                "history_text",
                "examination_text",
                "plan_text",
                "patient_instructions_text",
            )
        },
        "diagnosis_codes": t.diagnosis_codes,
        "diagnoses": [
            {**labels[code], "is_known": True}
            if code in labels
            else {
                "code": code,
                "display": code,
                "plain_language": "",
                "is_sensitive": False,
                "is_known": False,
            }
            for code in t.diagnosis_codes
        ],
        "items": t.items,
        "tests": t.tests or [],
        "use_count": t.use_count,
        "updated_at": t.updated_at,
    }


DUPLICATE_NAME = err("You already have a template with this name")


# ---- views ----------------------------------------------------------------------------------


class QuestionsView(ClinicalView):
    permission_classes = [Needs(ISSUE)]

    @extend_schema(
        operation_id="staff_clinical_questions",
        tags=TAGS,
        parameters=[OpenApiParameter("status", str, enum=["open", "answered"])],
        responses={200: PharmacyQuestionSerializer(many=True)},
        summary="Pharmacy questions on my prescriptions: open first, or the last 50 answered",
    )
    def get(self, request: Request) -> Response:
        state = "answered" if request.query_params.get("status") == "answered" else "open"
        rows = doctor_tools.questions(self.facility_id(), self.membership().pk, state)
        return Response(PharmacyQuestionSerializer(rows, many=True).data)


class QuestionReplyView(ClinicalView):
    permission_classes = [Needs(ISSUE), RecentAuthRequired()]

    @extend_schema(
        operation_id="staff_clinical_question_reply",
        tags=TAGS,
        request=QuestionReplySerializer,
        responses={
            200: PharmacyQuestionSerializer,
            403: err("step_up_required or permission_denied"),
            422: err("Not open, not signed, or not your prescription"),
        },
        summary="Answer a pharmacy question: signed addendum and answer in one step",
    )
    def post(self, request: Request, query_id: Any) -> Response:
        if not PrescriptionQuery.objects.filter(
            pk=query_id, facility_id=self.facility_id()
        ).exists():
            raise exceptions.NotFound()
        body = QuestionReplySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        query = doctor_tools.reply(
            query_id,
            membership=self.membership(),
            body=body.validated_data["body"],
            request=request,
        )
        row = (
            PrescriptionQuery.objects.select_related(
                "prescription__patient", "raised_by_membership__user"
            )
            .prefetch_related("prescription__items")
            .get(pk=query.pk)
        )
        return Response(PharmacyQuestionSerializer(doctor_tools.question_data(row)).data)


class MyFollowUpsView(ClinicalView):
    permission_classes = [Needs(WRITE)]

    @extend_schema(
        operation_id="staff_clinical_my_follow_ups",
        tags=TAGS,
        responses={200: MyFollowUpSerializer(many=True)},
        summary="Follow-ups I set: missed (last 30 days), today, the next 14 days, attended",
    )
    def get(self, request: Request) -> Response:
        rows = doctor_tools.follow_ups(self.facility_id(), self.membership().pk)
        return Response(MyFollowUpSerializer(rows, many=True).data)


class MyActivityView(ClinicalView):
    permission_classes = [Needs(WRITE)]

    @extend_schema(
        operation_id="staff_clinical_my_activity",
        tags=TAGS,
        parameters=[OpenApiParameter("days", int, enum=[7, 30])],
        responses={200: MyActivitySerializer},
        summary="My activity over 7 or 30 days: seen, signed, consult time, top diagnoses",
    )
    def get(self, request: Request) -> Response:
        days = 30 if request.query_params.get("days") == "30" else 7
        data = doctor_tools.activity(self.facility_id(), self.membership().pk, days)
        return Response(MyActivitySerializer(data).data)


class _MyTemplates(ClinicalView):
    """Templates belong to the signed-in clinician; another user's id is a 404."""

    permission_classes = [Needs(WRITE)]

    def owner(self) -> User:
        return cast(User, self.request.user)

    def template(self, template_id: Any) -> ClinicianTemplate:
        t = ClinicianTemplate.objects.filter(pk=template_id, user=self.owner()).first()
        if t is None:
            raise exceptions.NotFound()
        return t


class TemplatesView(_MyTemplates):
    @extend_schema(
        operation_id="staff_clinical_templates",
        tags=TAGS,
        responses={200: NoteTemplateSerializer(many=True)},
        summary="My note templates and favourite prescriptions, most used first",
    )
    def get(self, request: Request) -> Response:
        rows = list(ClinicianTemplate.objects.filter(user=self.owner()))
        labels = doctor_tools.diagnosis_labels([c for t in rows for c in t.diagnosis_codes])
        return Response(
            NoteTemplateSerializer([template_data(t, labels) for t in rows], many=True).data
        )

    @extend_schema(
        operation_id="staff_clinical_template_create",
        tags=TAGS,
        request=NoteTemplateInputSerializer,
        responses={201: NoteTemplateSerializer, 409: DUPLICATE_NAME},
        summary="Save a note template, with diagnoses and medicines",
    )
    def post(self, request: Request) -> Response:
        body = NoteTemplateInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        try:
            t = ClinicianTemplate.objects.create(
                user=self.owner(),
                name=data["name"].strip(),
                sections=dict(data.get("sections") or {}),
                diagnosis_codes=[c.upper() for c in data["diagnosis_codes"]],
                items=[dict(i) for i in data["items"]],
                tests=[dict(i) for i in data["tests"]],
            )
        except IntegrityError:
            raise Conflict("You already have a template with this name.") from None
        return Response(
            NoteTemplateSerializer(template_data(t)).data, status=status.HTTP_201_CREATED
        )


class TemplateView(_MyTemplates):
    @extend_schema(
        operation_id="staff_clinical_template_update",
        tags=TAGS,
        request=NoteTemplateInputSerializer,
        responses={200: NoteTemplateSerializer, 409: DUPLICATE_NAME},
        summary="Replace one of my templates",
    )
    def put(self, request: Request, template_id: Any) -> Response:
        t = self.template(template_id)
        body = NoteTemplateInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        t.name = data["name"].strip()
        t.sections = dict(data.get("sections") or {})
        t.diagnosis_codes = [c.upper() for c in data["diagnosis_codes"]]
        t.items = [dict(i) for i in data["items"]]
        t.tests = [dict(i) for i in data["tests"]]
        try:
            t.save()
        except IntegrityError:
            raise Conflict("You already have a template with this name.") from None
        return Response(NoteTemplateSerializer(template_data(t)).data)

    @extend_schema(
        operation_id="staff_clinical_template_delete",
        tags=TAGS,
        request=None,
        responses={204: None},
        summary="Delete one of my templates",
    )
    def delete(self, request: Request, template_id: Any) -> Response:
        self.template(template_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TemplateUsedView(_MyTemplates):
    @extend_schema(
        operation_id="staff_clinical_template_used",
        tags=TAGS,
        request=None,
        responses={200: NoteTemplateSerializer},
        summary="Count one use, so the most used templates come first",
    )
    def post(self, request: Request, template_id: Any) -> Response:
        t = self.template(template_id)
        t.use_count += 1
        t.save(update_fields=["use_count", "updated_at"])
        return Response(NoteTemplateSerializer(template_data(t)).data)


class FavouritesView(ClinicalView):
    """W3 (#202): what the doctor uses most, shown first in the diagnosis and medicine search."""

    permission_classes = [Needs(WRITE)]

    @extend_schema(
        operation_id="staff_clinical_favourites",
        tags=TAGS,
        responses={200: FavouritesSerializer},
        summary="My most used diagnoses and medicines here (last 180 days, used twice or more)",
    )
    def get(self, request: Request) -> Response:
        data = doctor_tools.favourites(self.facility_id(), self.membership().pk)
        return Response(FavouritesSerializer(data).data)
