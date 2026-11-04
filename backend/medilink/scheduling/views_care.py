"""W7 endpoints (upgrade 13 W7): the care schedule a clinician keeps for a patient, and the
patient's "coming up" list (planned vaccinations and antenatal visits, follow-up dates the doctor
set without a booking)."""

from __future__ import annotations

from typing import Any, cast

from django.db import connection
from drf_spectacular.utils import extend_schema
from rest_framework import exceptions, serializers, status
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.accounts.models import User
from medilink.authz.permissions import IsPatientAuthenticated
from medilink.facilities.views_base import FacilityView, Needs, err
from medilink.patients.errors import PatientsAPIView
from medilink.patients.models import FacilityPatient
from medilink.scheduling import care_schedule
from medilink.scheduling.models import (
    CareScheduleEntry,
    CareScheduleKind,
    CareScheduleStatus,
    FollowUp,
)
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import Facility

TAGS = ["booking"]
MANAGE = "care_schedule.manage"


class CareScheduleEntrySerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=CareScheduleKind.choices)
    due_on = serializers.DateField()
    note = serializers.CharField(allow_blank=True)
    status = serializers.ChoiceField(choices=CareScheduleStatus.choices)
    created_at = serializers.DateTimeField()
    version = serializers.IntegerField()


class CareScheduleListSerializer(serializers.Serializer[Any]):
    results = CareScheduleEntrySerializer(many=True)


class CareScheduleCreateSerializer(serializers.Serializer[Any]):
    kind = serializers.ChoiceField(choices=CareScheduleKind.choices)
    due_on = serializers.DateField()
    note = serializers.CharField(
        required=False, allow_blank=True, max_length=care_schedule.LABEL_MAX, default=""
    )


class CareScheduleCancelSerializer(serializers.Serializer[Any]):
    version = serializers.IntegerField(min_value=1)


class ComingUpItemSerializer(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    type = serializers.ChoiceField(choices=["vaccination", "antenatal", "follow_up"])
    due_on = serializers.DateField()
    note = serializers.CharField(allow_blank=True)
    facility_name = serializers.CharField()
    patient_id = serializers.UUIDField()


class ComingUpSerializer(serializers.Serializer[Any]):
    results = ComingUpItemSerializer(many=True)


class StaffCareView(FacilityView):
    def facility_id(self) -> Any:
        return self.principal().active_facility_id

    def record(self, facility_patient_id: Any) -> FacilityPatient:
        record = FacilityPatient.objects.filter(
            pk=facility_patient_id, facility_id=self.facility_id()
        ).first()
        if record is None:
            raise exceptions.NotFound()
        return record


class StaffCareScheduleView(StaffCareView):
    permission_classes = [Needs(MANAGE)]

    @extend_schema(
        operation_id="staff_patient_care_schedule",
        tags=TAGS,
        responses={200: CareScheduleListSerializer},
        summary="Planned vaccinations and antenatal visits of a patient at this facility (W7)",
    )
    def get(self, request: Request, facility_patient_id: Any) -> Response:
        record = self.record(facility_patient_id)
        rows = CareScheduleEntry.objects.filter(
            facility_id=self.facility_id(),
            facility_patient=record,
            status=CareScheduleStatus.DUE,
        ).order_by("due_on", "created_at")[:100]
        return Response({"results": [care_schedule.data(e) for e in rows]})

    @extend_schema(
        operation_id="staff_patient_care_schedule_create",
        tags=TAGS,
        request=CareScheduleCreateSerializer,
        responses={201: CareScheduleEntrySerializer, 422: err("due_on in the past or too far")},
        summary="Plan a dated vaccination or antenatal visit; the patient gets reminders (W7)",
    )
    def post(self, request: Request, facility_patient_id: Any) -> Response:
        record = self.record(facility_patient_id)
        body = CareScheduleCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        principal = self.principal()
        entry = care_schedule.create(
            facility_patient=record,
            kind=body.validated_data["kind"],
            due_on=body.validated_data["due_on"],
            label_text=body.validated_data["note"],
            user=request.user,
            membership=principal.membership,
            request=request,
        )
        return Response(care_schedule.data(entry), status=status.HTTP_201_CREATED)


class StaffCareScheduleCancelView(StaffCareView):
    permission_classes = [Needs(MANAGE)]

    @extend_schema(
        operation_id="staff_care_schedule_cancel",
        tags=TAGS,
        request=CareScheduleCancelSerializer,
        responses={
            200: CareScheduleEntrySerializer,
            409: err("Stale version"),
            422: err("Already cancelled"),
        },
        summary="Cancel a planned entry; no more reminders go out for it (W7)",
    )
    def post(self, request: Request, entry_id: Any) -> Response:
        body = CareScheduleCancelSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        entry = care_schedule.cancel(
            entry_id,
            version=body.validated_data["version"],
            facility_id=self.facility_id(),
            request=request,
        )
        return Response(care_schedule.data(entry))


def coming_up(account_id: Any) -> list[tuple[str, Any, Any]]:
    """(item_type, item_id, facility_id), soonest first (SECURITY DEFINER: self and guardian
    profiles only)."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT item_type, item_id, facility_id FROM scheduling_patient_care_schedule(%s)",
            [account_id],
        )
        return [(row[0], row[1], row[2]) for row in cursor.fetchall()]


class PatientComingUpView(PatientsAPIView):
    permission_classes = [IsPatientAuthenticated]

    @extend_schema(
        operation_id="patient_care_schedule",
        tags=TAGS,
        responses={200: ComingUpSerializer},
        summary="Coming up: planned vaccinations and antenatal visits, and follow-up dates the "
        "doctor set without a booking, soonest first (W7)",
    )
    def get(self, request: Request) -> Response:
        user = cast(User, request.user)
        names: dict[Any, str] = {}
        out: list[dict[str, Any]] = []
        for item_type, item_id, facility_id in coming_up(user.pk):
            if facility_id not in names:
                names[facility_id] = str(
                    Facility.objects.values_list("name", flat=True).get(pk=facility_id)
                )
            with rls_context(facility_id=facility_id, user_id=user.pk):
                if item_type == "care":
                    entry = CareScheduleEntry.objects.filter(
                        pk=item_id, status=CareScheduleStatus.DUE
                    ).first()
                    if entry is None:
                        continue
                    row = {
                        "id": entry.pk,
                        "type": entry.kind,
                        "due_on": entry.due_on,
                        "note": care_schedule.label(entry),
                        "patient_id": entry.patient_id,
                    }
                else:
                    fu = FollowUp.objects.filter(pk=item_id).first()
                    if fu is None:
                        continue
                    row = {
                        "id": fu.pk,
                        "type": "follow_up",
                        "due_on": fu.due_on,
                        "note": "",
                        "patient_id": fu.patient_id,
                    }
            out.append({**row, "facility_name": names[facility_id]})
        return Response({"results": out})
