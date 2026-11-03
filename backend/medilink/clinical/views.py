"""S6a staff endpoints (contract sprint-06 §3.1): consultation, vitals, history, access, alerts.

Every read of clinical content about a patient passes `access.require_access()` (treatment
relationship or a recent reason) and is audited with a patient link.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db.models import Count, Prefetch, QuerySet
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import exceptions, serializers, status
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.authz.stepup import RecentAuthRequired
from medilink.clinical import access, alerts, services
from medilink.clinical import serializers as s
from medilink.clinical.models import (
    Addendum,
    Consultation,
    ConsultationStatus,
    Diagnosis,
    Vitals,
)
from medilink.clinical.reason import reason_for_visit, vitals_flags
from medilink.core.pagination import DefaultPagination
from medilink.facilities.views_base import FacilityView, Needs, err, query_date
from medilink.masterdata.models import Drug
from medilink.patients.audit import record_patient_event
from medilink.patients.models import FacilityPatient
from medilink.patients.normalize import age_years

TAGS = ["clinical"]
VIEW, WRITE, SIGN, AMEND, VITALS, UNSIGNED = (
    "clinical.view",
    "clinical.write",
    "clinical.sign",
    "clinical.amend_own",
    "vitals.record",
    "clinical.unsigned_list",
)
REASON_REQUIRED = err("access_reason_required: give a reason for this patient first (A1)")
OVERDUE_AFTER = dt.timedelta(hours=24)


def _paginated(name: str, item: type[serializers.Serializer]) -> serializers.Serializer:
    return inline_serializer(
        name=name,
        fields={
            "count": serializers.IntegerField(),
            "next": serializers.URLField(allow_null=True),
            "previous": serializers.URLField(allow_null=True),
            "results": item(many=True),
        },
    )


def display_name(patient: Any) -> str:
    return str(patient.preferred_name or patient.full_name)


def vitals_data(row: Vitals) -> dict[str, Any]:
    user = row.recorded_by_membership.user if row.recorded_by_membership_id else None
    return {
        "id": row.pk,
        "visit_id": row.visit_id,
        "recorded_at": row.recorded_at,
        "recorded_by_name": user.full_name if user else None,
        "temperature_c": row.temperature_c,
        "systolic_mmhg": row.systolic_mmhg,
        "diastolic_mmhg": row.diastolic_mmhg,
        "pulse_bpm": row.pulse_bpm,
        "respiratory_rate": row.respiratory_rate,
        "spo2_pct": row.spo2_pct,
        "weight_kg": row.weight_kg,
        "height_cm": row.height_cm,
        "muac_mm": row.muac_mm,
        "flags": vitals_flags(row),
        "is_entered_in_error": row.entered_in_error_at is not None,
    }


def _attributes(patient_id: Any) -> dict[str, Any]:
    from medilink.clinical.records import attributes_data

    return attributes_data(patient_id)


def allergy_data(patient: Any) -> list[dict[str, Any]]:
    return [
        {
            "id": a.pk,
            "category": a.category,
            "substance": a.substance_text,
            "reaction": a.reaction,
            "severity": a.severity,
            "verification_status": a.verification_status,
        }
        for a in alerts.active_allergies(patient)
    ]


def addendum_data(row: Addendum) -> dict[str, Any]:
    return {
        "id": row.pk,
        "author_name": row.author_membership.user.full_name,
        "is_by_author": row.is_by_author,
        "reason": row.reason,
        "body": services.addendum_body(row),
        "signed_at": row.signed_at,
        "content_hash": bytes(row.content_hash).hex(),
    }


def consultation_data(c: Consultation, principal: Any) -> dict[str, Any]:
    patient = c.patient
    diagnoses = list(c.diagnoses.order_by("-rank", "code"))
    diagnoses.sort(key=lambda d: (d.rank != "primary", d.code))
    vitals = (
        Vitals.objects.filter(visit_id=c.visit_id, entered_in_error_at__isnull=True)
        .select_related("recorded_by_membership__user")
        .order_by("recorded_at")
    )
    addenda = c.addenda.select_related("author_membership__user").order_by("signed_at")
    is_author = c.author_membership_id == getattr(principal.membership, "pk", None)
    is_draft = c.status == ConsultationStatus.DRAFT
    return {
        "id": c.pk,
        "visit_id": c.visit_id,
        "facility_patient_id": c.facility_patient_id,
        "patient": {
            "id": patient.pk,
            "display_name": display_name(patient),
            "age_years": age_years(patient.date_of_birth, timezone.localdate()),
            "sex": patient.sex,
        },
        "author": {
            "membership_id": c.author_membership_id,
            "full_name": c.author_membership.user.full_name,
        },
        "status": c.status,
        "started_at": c.started_at,
        "signed_at": c.signed_at,
        "is_late_entry": c.is_late_entry,
        "is_restricted": c.is_restricted,
        "suggest_restricted": any(d.is_sensitive for d in diagnoses) and not c.is_restricted,
        "history_text": services.read_section(c, "history"),
        "examination_text": services.read_section(c, "examination"),
        "plan_text": services.read_section(c, "plan"),
        "patient_instructions_text": services.read_section(c, "patient_instructions"),
        "private_notes": services.read_section(c, "private_notes"),
        "diagnoses": [
            {
                "id": d.pk,
                "code": d.code,
                "display": d.display,
                "plain_language": d.plain_language,
                "rank": d.rank,
                "certainty": d.certainty,
                "is_sensitive": d.is_sensitive,
            }
            for d in diagnoses
        ],
        "vitals": [vitals_data(v) for v in vitals],
        "reason_for_visit": reason_for_visit(c.visit, patient),
        "addenda": [addendum_data(a) for a in addenda],
        "allergies": allergy_data(patient),
        "no_known_allergies": patient.no_known_allergies,
        "health_attributes": _attributes(patient.pk),
        "content_hash": bytes(c.content_hash).hex() if c.content_hash else None,
        "integrity": services.integrity(c),
        "entered_in_error": (
            {
                "at": c.entered_in_error_at,
                "reason": c.entered_in_error_reason,
                "by_name": (
                    c.entered_in_error_by_membership.user.full_name
                    if c.entered_in_error_by_membership is not None
                    else None
                ),
            }
            if c.entered_in_error_at
            else None
        ),
        "can_edit": is_draft and is_author and WRITE in principal.permissions,
        "can_sign": is_draft and is_author and SIGN in principal.permissions,
        "version": c.version,
    }


class ClinicalView(FacilityView):
    def facility_id(self) -> Any:
        return self.principal().active_facility_id

    def membership(self) -> Any:
        return self.principal().membership

    def facility_patient(self, facility_patient_id: Any) -> FacilityPatient:
        record = (
            FacilityPatient.objects.filter(
                pk=facility_patient_id, facility_id=self.facility_id(), is_active=True
            )
            .select_related("patient")
            .first()
        )
        if record is None:
            raise exceptions.NotFound()
        return record

    def visit(self, visit_id: Any) -> Any:
        from medilink.visits.models import Visit

        visit = (
            Visit.objects.filter(pk=visit_id, facility_id=self.facility_id())
            .select_related("patient", "facility_patient")
            .first()
        )
        if visit is None:
            raise exceptions.NotFound()
        return visit

    def consultation(self, consultation_id: Any) -> Consultation:
        row = (
            Consultation.objects.filter(pk=consultation_id, facility_id=self.facility_id())
            .select_related(
                "patient",
                "facility_patient__patient",
                "author_membership__user",
                "entered_in_error_by_membership__user",
            )
            .first()
        )
        if row is None:
            raise exceptions.NotFound()
        return row

    def respond(self, c: Consultation, code: int = status.HTTP_200_OK) -> Response:
        c = self.consultation(c.pk)
        return Response(consultation_data(c, self.principal()), status=code)


class VisitConsultationView(ClinicalView):
    permission_classes = [Needs(WRITE)]

    @extend_schema(
        operation_id="staff_visit_consultation_open",
        tags=TAGS,
        request=None,
        responses={
            200: s.ConsultationSerializer,
            201: s.ConsultationSerializer,
            403: REASON_REQUIRED,
            422: err("Visit cancelled or the patient left"),
        },
        summary="Open (or return) my draft consultation for a visit (C1)",
    )
    def post(self, request: Request, visit_id: Any) -> Response:
        visit = self.visit(visit_id)
        access.require_access(self.principal(), visit.facility_patient)
        consultation, created = services.open_consultation(
            visit=visit, membership=self.membership(), request=request
        )
        return self.respond(consultation, status.HTTP_201_CREATED if created else 200)


class ConsultationView(ClinicalView):
    permission_classes = [Needs(VIEW, methods={"PATCH": (WRITE,)})]

    @extend_schema(
        operation_id="staff_consultation_detail",
        tags=TAGS,
        responses={200: s.ConsultationSerializer, 403: REASON_REQUIRED},
        summary="Consultation with allergies, vitals, diagnoses and addenda (C2)",
    )
    def get(self, request: Request, consultation_id: Any) -> Response:
        c = self.consultation(consultation_id)
        access.require_access(self.principal(), c.facility_patient)
        record_patient_event(
            "clinical.consultation.viewed",
            request=request,
            patient=c.patient,
            object_type="clinical.consultation",
            object_id=c.pk,
            metadata={"visit_id": str(c.visit_id)},
        )
        return Response(consultation_data(c, self.principal()))

    @extend_schema(
        operation_id="staff_consultation_update",
        tags=TAGS,
        request=s.ConsultationUpdateSerializer,
        responses={
            200: s.ConsultationSerializer,
            409: err("Stale version"),
            422: err("Not a draft, not the author, or a diagnosis rule"),
        },
        summary="Autosave the draft (C3)",
    )
    def patch(self, request: Request, consultation_id: Any) -> Response:
        c = self.consultation(consultation_id)
        body = s.ConsultationUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = dict(body.validated_data)
        changes: dict[str, Any] = {
            section: data[field] for field, section in s.SECTION_FIELDS.items() if field in data
        }
        for name in ("is_restricted", "diagnoses"):
            if name in data:
                changes[name] = data[name]
        updated = services.update_draft(
            c.pk, version=data["version"], membership=self.membership(), data=changes
        )
        return self.respond(updated)


class SignView(ClinicalView):
    permission_classes = [Needs(SIGN), RecentAuthRequired()]

    @extend_schema(
        operation_id="staff_consultation_sign",
        tags=TAGS,
        request=s.ClinicalVersionSerializer,
        responses={
            200: s.ConsultationSerializer,
            403: err("step_up_required"),
            409: err("Stale version"),
            422: err("No primary diagnosis, not a draft or not the author"),
        },
        summary="Sign and lock the record (C4)",
    )
    def post(self, request: Request, consultation_id: Any) -> Response:
        c = self.consultation(consultation_id)
        body = s.ClinicalVersionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        signed = services.sign(
            c.pk,
            version=body.validated_data["version"],
            membership=self.membership(),
            request=request,
        )
        return self.respond(signed)


class AddendaView(ClinicalView):
    permission_classes = [Needs(WRITE), RecentAuthRequired()]

    @extend_schema(
        operation_id="staff_consultation_addendum",
        tags=TAGS,
        request=s.AddendumInputSerializer,
        responses={
            201: s.AddendumSerializer,
            403: err("step_up_required, access_reason_required or permission_denied"),
            422: err("The record is not signed"),
        },
        summary="Add a signed addendum (C5)",
    )
    def post(self, request: Request, consultation_id: Any) -> Response:
        c = self.consultation(consultation_id)
        is_author = c.author_membership_id == self.membership().pk
        if is_author and not self.can(AMEND):
            raise exceptions.PermissionDenied()
        if not is_author:
            access.require_access(self.principal(), c.facility_patient)
        body = s.AddendumInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        addendum = services.add_addendum(
            c.pk,
            membership=self.membership(),
            reason=body.validated_data["reason"],
            body=body.validated_data["body"],
            request=request,
        )
        row = Addendum.objects.select_related("author_membership__user").get(pk=addendum.pk)
        return Response(addendum_data(row), status=status.HTTP_201_CREATED)


class EnteredInErrorView(ClinicalView):
    permission_classes = [Needs(AMEND), RecentAuthRequired()]

    @extend_schema(
        operation_id="staff_consultation_entered_in_error",
        tags=TAGS,
        request=s.EnteredInErrorSerializer,
        responses={
            200: s.ConsultationSerializer,
            403: err("step_up_required"),
            409: err("Stale version"),
            422: err("Not the author or already marked"),
        },
        summary="Mark a record entered in error (C6)",
    )
    def post(self, request: Request, consultation_id: Any) -> Response:
        c = self.consultation(consultation_id)
        body = s.EnteredInErrorSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        marked = services.mark_entered_in_error(
            c.pk,
            version=body.validated_data["version"],
            membership=self.membership(),
            reason=body.validated_data["reason"],
            request=request,
        )
        return self.respond(marked)


class MyDayView(ClinicalView):
    permission_classes = [Needs(WRITE)]

    @extend_schema(
        operation_id="staff_clinical_my_day",
        tags=TAGS,
        responses={200: s.MyDaySerializer},
        summary="Doctor Today: my patients seen, unsigned records, questions and results",
    )
    def get(self, request: Request) -> Response:
        from medilink.clinical.my_day import my_day

        data = my_day(self.facility_id(), self.membership().pk)
        return Response(s.MyDaySerializer(data).data)


class ConsultationListView(ClinicalView):
    permission_classes = [Needs(UNSIGNED)]

    @extend_schema(
        operation_id="staff_consultations_unsigned",
        tags=TAGS,
        parameters=[
            OpenApiParameter("status", str, enum=["draft"]),
            OpenApiParameter("mine", bool),
            OpenApiParameter("page", int),
            OpenApiParameter("page_size", int),
        ],
        responses={200: _paginated("PaginatedConsultationRowList", s.ConsultationRowSerializer)},
        summary="Unsigned records list, without clinical content (C7)",
    )
    def get(self, request: Request) -> Response:
        rows = (
            Consultation.objects.filter(
                facility_id=self.facility_id(), status=ConsultationStatus.DRAFT
            )
            .select_related("patient", "visit", "author_membership__user")
            .order_by("started_at")
        )
        mine = request.query_params.get("mine") == "true" or not self.can("facility.configure")
        if mine:
            rows = rows.filter(author_membership=self.membership())
        paginator = DefaultPagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        now = timezone.now()
        data = [
            {
                "id": c.pk,
                "visit_id": c.visit_id,
                "facility_patient_id": c.facility_patient_id,
                "patient_display_name": display_name(c.patient),
                "service_date": c.visit.service_date,
                "author": {
                    "membership_id": c.author_membership_id,
                    "full_name": c.author_membership.user.full_name,
                },
                "status": c.status,
                "started_at": c.started_at,
                "is_overdue": now - c.started_at > OVERDUE_AFTER,
            }
            for c in page or []
        ]
        return paginator.get_paginated_response(s.ConsultationRowSerializer(data, many=True).data)


class VisitVitalsView(ClinicalView):
    permission_classes = [Needs(VITALS, VIEW, methods={"POST": (VITALS,)})]

    @extend_schema(
        operation_id="staff_visit_vitals",
        tags=TAGS,
        responses={200: s.VitalsListSerializer, 403: REASON_REQUIRED},
        summary="Vitals of a visit (V1); reception sees the rows it recorded",
    )
    def get(self, request: Request, visit_id: Any) -> Response:
        visit = self.visit(visit_id)
        rows = Vitals.objects.filter(visit=visit).select_related("recorded_by_membership__user")
        if self.can(VIEW):
            access.require_access(self.principal(), visit.facility_patient)
        else:
            rows = rows.filter(recorded_by_membership=self.membership())
        return Response({"results": [vitals_data(v) for v in rows.order_by("recorded_at")]})

    @extend_schema(
        operation_id="staff_visit_vitals_record",
        tags=TAGS,
        request=s.VitalsInputSerializer,
        responses={201: s.VitalsSerializer, 422: err("The visit is not open")},
        summary="Record vitals (V1)",
    )
    def post(self, request: Request, visit_id: Any) -> Response:
        visit = self.visit(visit_id)
        body = s.VitalsInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        values = {k: v for k, v in body.validated_data.items() if v is not None}
        row = services.record_vitals(
            visit=visit, membership=self.membership(), values=values, request=request
        )
        row = Vitals.objects.select_related("recorded_by_membership__user").get(pk=row.pk)
        return Response(vitals_data(row), status=status.HTTP_201_CREATED)


class VitalsEnteredInErrorView(ClinicalView):
    permission_classes = [Needs(VITALS, WRITE)]

    @extend_schema(
        operation_id="staff_vitals_entered_in_error",
        tags=TAGS,
        request=s.ClinicalReasonSerializer,
        responses={200: s.VitalsSerializer, 422: err("Already marked")},
        summary="Mark vitals entered in error (V2)",
    )
    def post(self, request: Request, vitals_id: Any) -> Response:
        row = (
            Vitals.objects.filter(pk=vitals_id, facility_id=self.facility_id())
            .select_related("patient", "recorded_by_membership__user")
            .first()
        )
        if row is None:
            raise exceptions.NotFound()
        if row.recorded_by_membership_id != self.membership().pk and not self.can(WRITE):
            raise exceptions.PermissionDenied()
        body = s.ClinicalReasonSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        services.vitals_entered_in_error(
            row, membership=self.membership(), reason=body.validated_data["reason"], request=request
        )
        return Response(vitals_data(row))


# ---- history -------------------------------------------------------------------------------------


def _signed_or_mine(rows: QuerySet[Consultation], membership: Any) -> QuerySet[Consultation]:
    from django.db.models import Q

    return rows.filter(
        Q(status=ConsultationStatus.SIGNED)
        | Q(status=ConsultationStatus.DRAFT, author_membership=membership)
    )


def _on_day(day: dt.date) -> dt.datetime:
    return timezone.make_aware(dt.datetime.combine(day, dt.time(12)))


def legacy_items(record: FacilityPatient, kind: Any, code: str) -> list[dict[str, Any]]:
    """S6b: back-entered history (`legacy`) and scanned documents (`scan`), labelled historical."""
    from medilink.clinical import records
    from medilink.clinical.models import ClinicalScan, HistoryEntry

    out: list[dict[str, Any]] = []
    base: dict[str, Any] = {
        "visit_id": None,
        "service_name_i18n": {},
        "status": None,
        "is_restricted": False,
        "is_late_entry": False,
        "diagnoses": [],
        "addenda_count": 0,
        "vitals": None,
        "legacy": None,
        "scan": None,
    }
    if kind in (None, "", "legacy"):
        entries = HistoryEntry.objects.filter(
            facility_id=record.facility_id, patient_id=record.patient_id
        ).select_related("entered_by_membership__user")
        if code:
            entries = entries.filter(code__startswith=code)
        for e in entries:
            out.append(
                {
                    **base,
                    "kind": "legacy",
                    "id": e.pk,
                    "occurred_at": _on_day(e.occurred_on) if e.occurred_on else e.created_at,
                    "author_name": e.entered_by_membership.user.full_name,
                    "legacy": {
                        "entry_kind": e.kind,
                        "code": e.code,
                        "display": e.display,
                        "note": records.history_note(e),
                        "occurred_on": e.occurred_on,
                        "entered_at": e.created_at,
                        "source_scan_id": e.source_scan_id,
                    },
                }
            )
    if kind in (None, "", "scan") and not code:
        scans = ClinicalScan.objects.filter(
            facility_id=record.facility_id, patient_id=record.patient_id
        ).select_related("uploaded_by_membership__user", "upload")
        for sc in scans:
            out.append(
                {
                    **base,
                    "kind": "scan",
                    "id": sc.pk,
                    "occurred_at": _on_day(sc.document_date),
                    "author_name": sc.uploaded_by_membership.user.full_name,
                    "scan": {
                        "document_type": sc.document_type,
                        "document_date": sc.document_date,
                        "description": sc.description,
                        "content_type": sc.upload.content_type,
                        "uploaded_at": sc.created_at,
                    },
                }
            )
    return out


def history_items(
    record: FacilityPatient, membership: Any, params: dict[str, Any]
) -> list[dict[str, Any]]:
    kind, code = params.get("type"), (params.get("code") or "").strip().upper()
    start, end = params.get("from"), params.get("to")
    items: list[dict[str, Any]] = []
    services_by_visit: dict[Any, dict[str, str]] = {}

    def service_names(visit: Any) -> dict[str, str]:
        if visit.pk not in services_by_visit:
            services_by_visit[visit.pk] = dict(visit.first_service.name_i18n or {})
        return services_by_visit[visit.pk]

    if kind in (None, "", "consultation"):
        rows = _signed_or_mine(
            Consultation.objects.filter(facility_id=record.facility_id, patient=record.patient),
            membership,
        )
        if code:
            rows = rows.filter(diagnoses__code__startswith=code).distinct()
        rows = (
            rows.select_related("author_membership__user", "visit__first_service")
            .prefetch_related(Prefetch("diagnoses", queryset=Diagnosis.objects.order_by("code")))
            .annotate(addenda_total=Count("addenda", distinct=True))
        )
        for c in rows:
            occurred = c.signed_at or c.started_at
            items.append(
                {
                    "kind": "consultation",
                    "id": c.pk,
                    "occurred_at": occurred,
                    "visit_id": c.visit_id,
                    "service_name_i18n": service_names(c.visit),
                    "author_name": c.author_membership.user.full_name,
                    "status": c.status,
                    "is_restricted": c.is_restricted,
                    "is_late_entry": c.is_late_entry,
                    "diagnoses": [
                        {
                            "code": d.code,
                            "display": d.display,
                            "certainty": d.certainty,
                            "rank": d.rank,
                        }
                        for d in sorted(
                            c.diagnoses.all(), key=lambda d: (d.rank != "primary", d.code)
                        )
                    ],
                    "addenda_count": c.addenda_total,
                    "vitals": None,
                    "legacy": None,
                    "scan": None,
                }
            )
    if kind in (None, "", "vitals") and not code:
        rows_v = Vitals.objects.filter(
            facility_id=record.facility_id,
            patient=record.patient,
            entered_in_error_at__isnull=True,
        ).select_related("recorded_by_membership__user", "visit__first_service")
        for v in rows_v:
            items.append(
                {
                    "kind": "vitals",
                    "id": v.pk,
                    "occurred_at": v.recorded_at,
                    "visit_id": v.visit_id,
                    "service_name_i18n": service_names(v.visit),
                    "author_name": v.recorded_by_membership.user.full_name,
                    "status": None,
                    "is_restricted": False,
                    "is_late_entry": False,
                    "diagnoses": [],
                    "addenda_count": 0,
                    "vitals": vitals_data(v),
                    "legacy": None,
                    "scan": None,
                }
            )
    items.extend(legacy_items(record, kind, code))
    tz = timezone.get_current_timezone()
    if start:
        items = [i for i in items if i["occurred_at"].astimezone(tz).date() >= start]
    if end:
        items = [i for i in items if i["occurred_at"].astimezone(tz).date() <= end]
    items.sort(key=lambda i: i["occurred_at"], reverse=True)
    return items


class HistoryView(ClinicalView):
    permission_classes = [Needs(VIEW)]

    @extend_schema(
        operation_id="staff_patient_history",
        tags=TAGS,
        parameters=[
            OpenApiParameter("type", str, enum=["consultation", "vitals", "legacy", "scan"]),
            OpenApiParameter("code", str, description="ICD-10 code prefix"),
            OpenApiParameter("from", dt.date),
            OpenApiParameter("to", dt.date),
            OpenApiParameter("page", int),
            OpenApiParameter("page_size", int),
        ],
        responses={
            200: _paginated("PaginatedHistoryItemList", s.HistoryItemSerializer),
            403: REASON_REQUIRED,
        },
        summary="History timeline at this facility, newest first (H1)",
    )
    def get(self, request: Request, facility_patient_id: Any) -> Response:
        record = self.facility_patient(facility_patient_id)
        access.require_access(self.principal(), record)
        kind = request.query_params.get("type")
        if kind not in (None, "", "consultation", "vitals", "legacy", "scan"):
            raise exceptions.ValidationError(
                {"type": ["Use consultation, vitals, legacy or scan."]}
            )
        params = {
            "type": kind,
            "code": request.query_params.get("code"),
            "from": query_date(request, "from"),
            "to": query_date(request, "to"),
        }
        items = history_items(record, self.membership(), params)
        record_patient_event(
            "clinical.history.viewed",
            request=request,
            patient=record.patient,
            object_type="patients.facility_patient",
            object_id=record.pk,
        )
        paginator = DefaultPagination()
        page = paginator.paginate_queryset(items, request, view=self)
        return paginator.get_paginated_response(s.HistoryItemSerializer(page, many=True).data)


def problem_summary(record: FacilityPatient, membership: Any) -> dict[str, Any]:
    from medilink.patients.models import Condition, ConditionStatus, Verification

    patient = record.patient
    conditions = (
        Condition.objects.filter(
            patient=patient, entered_in_error_at__isnull=True, status=ConditionStatus.ACTIVE
        )
        .exclude(verification_status=Verification.REFUTED)
        .order_by("display")
    )
    recent: dict[str, dict[str, Any]] = {}
    diagnoses = (
        Diagnosis.objects.filter(
            facility_id=record.facility_id,
            consultation__patient=patient,
            consultation__status=ConsultationStatus.SIGNED,
        )
        .select_related("consultation")
        .order_by("-consultation__signed_at")
    )
    for d in diagnoses[:200]:
        if d.code not in recent and len(recent) < 10:
            recent[d.code] = {
                "code": d.code,
                "display": d.display,
                "certainty": d.certainty,
                "last_seen_at": d.consultation.signed_at,
            }
    return {
        "allergies": allergy_data(patient),
        "no_known_allergies": patient.no_known_allergies,
        "conditions": [
            {
                "id": c.pk,
                "display": c.display,
                "verification_status": c.verification_status,
                "detail": c.onset_date.isoformat() if c.onset_date else None,
            }
            for c in conditions
        ],
        "medications": [
            {
                "id": m.pk,
                "display": m.drug_display,
                "verification_status": m.verification_status,
                "detail": m.dose_text,
            }
            for m in alerts.active_medications(patient)
        ],
        "recent_diagnoses": list(recent.values()),
        "is_staff_member": record.is_staff_member,
        "health_attributes": _attributes(patient.pk),
    }


class ProblemSummaryView(ClinicalView):
    permission_classes = [Needs(VIEW)]

    @extend_schema(
        operation_id="staff_patient_problem_summary",
        tags=TAGS,
        responses={200: s.ProblemSummarySerializer, 403: REASON_REQUIRED},
        summary="Allergies, conditions, medicines and recent diagnoses (H2)",
    )
    def get(self, request: Request, facility_patient_id: Any) -> Response:
        record = self.facility_patient(facility_patient_id)
        access.require_access(self.principal(), record)
        return Response(problem_summary(record, self.membership()))


class AccessReasonView(ClinicalView):
    permission_classes = [Needs(VIEW)]

    @extend_schema(
        operation_id="staff_patient_access_reason",
        tags=TAGS,
        request=s.AccessReasonInputSerializer,
        responses={201: s.AccessGrantSerializer, 422: err("Text needed for other")},
        summary="Give a reason to open this patient's record (A1)",
    )
    def post(self, request: Request, facility_patient_id: Any) -> Response:
        record = self.facility_patient(facility_patient_id)
        body = s.AccessReasonInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        reason = access.give_reason(
            request=request,
            principal=self.principal(),
            facility_patient=record,
            code=body.validated_data["reason_code"],
            text=body.validated_data.get("reason_text", ""),
        )
        return Response({"granted_until": reason.granted_until}, status=status.HTTP_201_CREATED)


class AccessStateView(ClinicalView):
    permission_classes = [Needs(VIEW)]

    @extend_schema(
        operation_id="staff_patient_access_state",
        tags=TAGS,
        responses={200: s.AccessStateSerializer},
        summary="Whether a reason is needed before opening the record (A2)",
    )
    def get(self, request: Request, facility_patient_id: Any) -> Response:
        current = access.state(self.principal(), self.facility_patient(facility_patient_id))
        return Response(
            {
                "has_relationship": current.has_relationship,
                "is_staff_member": current.is_staff_member,
                "reason_required": current.reason_required,
                "granted_until": current.granted_until,
            }
        )


class AlertsView(ClinicalView):
    permission_classes = [Needs(WRITE, "prescription.issue")]

    @extend_schema(
        operation_id="staff_clinical_alerts",
        tags=TAGS,
        request=s.AlertCheckSerializer,
        responses={200: s.AlertResultSerializer, 403: REASON_REQUIRED},
        summary="Allergy, duplicate and dose checks before prescribing (AL1)",
    )
    def post(self, request: Request) -> Response:
        body = s.AlertCheckSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        record = self.facility_patient(body.validated_data["facility_patient_id"])
        access.require_access(self.principal(), record)
        items = body.validated_data["items"]
        drugs = {
            d.code: d
            for d in Drug.objects.filter(code__in=[i["drug_code"] for i in items], is_active=True)
        }
        unknown = sorted({i["drug_code"] for i in items} - set(drugs))
        if unknown:
            raise exceptions.ValidationError({"items": [f"Unknown drug: {', '.join(unknown)}"]})
        found = alerts.check(
            record.patient, [(drugs[i["drug_code"]], i.get("quantity")) for i in items]
        )
        return Response({"alerts": [a.as_dict() for a in found]})
