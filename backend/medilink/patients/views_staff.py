"""Staff patient endpoints (contract §3.3 ST1-ST16, ST26-ST27), acting in the active facility."""

from __future__ import annotations

from typing import Any

from django.http import Http404
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import exceptions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.audit.services import record
from medilink.authz.permissions import IsStaffAuthenticated, get_principal
from medilink.core.serializers import ErrorSerializer
from medilink.core.throttling import BurstRateThrottle
from medilink.patients import consents, health, insurance, staff
from medilink.patients import serializers as s
from medilink.patients.audit import record_patient_event
from medilink.patients.errors import PatientsAPIView
from medilink.patients.models import (
    ConsentChannel,
    FacilityPatient,
    HealthSource,
    InsuranceProfile,
)
from medilink.patients.throttling import RevealRateThrottle, SearchRateThrottle
from medilink.uploads import services as uploads
from medilink.uploads.throttling import UploadRateThrottle
from medilink.uploads.views import idempotency_key, rejected

TAGS = ["staff-patients"]


def _err(description: str) -> OpenApiResponse:
    return OpenApiResponse(response=ErrorSerializer, description=description)


def Needs(*codes: str, methods: dict[str, tuple[str, ...]] | None = None) -> type[BasePermission]:
    """Staff with any of `codes` in the active facility; `methods` overrides per HTTP method."""

    class _Needs(IsStaffAuthenticated):
        def has_permission(self, request: Any, view: Any) -> bool:
            if not super().has_permission(request, view):
                return False
            principal = get_principal(request)
            if principal is None or principal.active_facility_id is None:
                return False
            wanted = (methods or {}).get(request.method, codes)
            return any(code in principal.permissions for code in wanted)

    _Needs.__name__ = f"Needs[{','.join(codes)}]"
    return _Needs


class StaffView(PatientsAPIView):
    def principal(self) -> Any:
        principal = get_principal(self.request)
        if principal is None:  # the permission class ensures it
            raise exceptions.NotAuthenticated()
        return principal

    def record(self, fp_id: Any) -> FacilityPatient:
        return staff.record_here(self.principal().active_facility_id, fp_id)

    def active_record(self, fp_id: Any) -> FacilityPatient:
        fp = self.record(fp_id)
        if not fp.is_active:
            raise Http404
        return fp


def _summaries(pairs: list[tuple[FacilityPatient, str]]) -> list[dict[str, Any]]:
    return [s.patient_summary_data(fp, match) for fp, match in pairs]


class SearchView(StaffView):
    permission_classes = [Needs("patients.view")]
    throttle_classes = [BurstRateThrottle, SearchRateThrottle]

    @extend_schema(
        operation_id="staff_patients_search",
        tags=TAGS,
        request=s.SearchSerializer,
        responses={200: s.SearchResultSerializer, 429: _err("rate_limited")},
        summary="Search this facility's patients (criteria in the body)",
    )
    def post(self, request: Request) -> Response:
        body = s.SearchSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        principal = self.principal()
        result = staff.search(
            facility_id=principal.active_facility_id,
            query=data["query"],
            by=data["by"],
            kind=data.get("kind"),
            country=data.get("issuing_country", ""),
        )
        record(
            "patients.search.performed",
            request=request,
            object_type="facility",
            object_id=principal.active_facility_id,
            metadata={"by": result.by, "result_count": len(result.results)},
        )
        return Response(
            {
                "results": _summaries(result.results),
                "external_match": s.external_match_data(result.external),
            }
        )


class DuplicateCheckView(StaffView):
    permission_classes = [Needs("patient.register")]
    throttle_classes = [BurstRateThrottle, SearchRateThrottle]

    @extend_schema(
        operation_id="staff_patients_duplicate_check",
        tags=TAGS,
        request=s.DuplicateCheckSerializer,
        responses={200: s.DuplicateCheckResultSerializer},
        summary="Check for duplicates before registering",
    )
    def post(self, request: Request) -> Response:
        body = s.DuplicateCheckSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        principal = self.principal()
        try:
            result = staff.duplicate_check(
                facility_id=principal.active_facility_id, data=body.validated_data
            )
        except staff.InvalidValue as exc:
            raise exceptions.ValidationError({"identifier": {"value": [str(exc)]}}) from None
        record(
            "patients.duplicate_check.performed",
            request=request,
            object_type="facility",
            object_id=principal.active_facility_id,
            metadata={"result_count": len(result.here)},
        )
        return Response(
            {
                "matches": [
                    {"level": m.level, "patient": s.patient_summary_data(fp, m.matched_on)}
                    for m, fp in result.here
                ],
                "external_match": s.external_match_data(result.external),
                "other_facility_possible_count": result.other_facility_possible_count,
            }
        )


class PatientCreateView(StaffView):
    permission_classes = [Needs("patient.register")]

    @extend_schema(
        operation_id="staff_patients_create",
        tags=TAGS,
        request=s.RegisterSerializer,
        responses={
            201: s.FacilityPatientDetailSerializer,
            409: _err("conflict: identifier, file_number or possible duplicate"),
        },
        summary="Register a walk-in patient",
    )
    def post(self, request: Request) -> Response:
        body = s.RegisterSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        fp, _created = staff.register_walk_in(
            request=request,
            principal=self.principal(),
            data=body.validated_data,
            idempotency_key=idempotency_key(request),
        )
        return Response(s.facility_patient_detail_data(fp), status=status.HTTP_201_CREATED)


class AddExistingView(StaffView):
    permission_classes = [Needs("patient.register")]

    @extend_schema(
        operation_id="staff_patients_add_existing",
        tags=TAGS,
        request=s.AddExistingSerializer,
        responses={
            200: s.FacilityPatientDetailSerializer,
            201: s.FacilityPatientDetailSerializer,
            422: _err("proof doesn't match"),
        },
        summary="Add a patient already on MediLink to this facility",
    )
    def post(self, request: Request) -> Response:
        body = s.AddExistingSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        fp, created = staff.add_existing(
            request=request, principal=self.principal(), data=body.validated_data
        )
        return Response(
            s.facility_patient_detail_data(fp),
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class PatientDetailView(StaffView):
    permission_classes = [
        Needs("patients.view", methods={"PATCH": ("patient.register",)}),
    ]

    @extend_schema(
        operation_id="staff_patients_retrieve",
        tags=TAGS,
        responses={200: s.FacilityPatientDetailSerializer, 404: _err("not_found")},
        summary="A facility patient record (audited)",
    )
    def get(self, request: Request, fp_id: Any) -> Response:
        fp = self.record(fp_id)
        record_patient_event(
            "patients.record.viewed",
            request=request,
            patient=fp.patient,
            object_type="facility_patient",
            object_id=fp.pk,
        )
        return Response(s.facility_patient_detail_data(fp))

    @extend_schema(
        operation_id="staff_patients_update",
        tags=TAGS,
        request=s.StaffPatientUpdateSerializer,
        responses={200: s.FacilityPatientDetailSerializer, 409: _err("conflict")},
        summary="Edit demographics, contacts, file number or notes",
    )
    def patch(self, request: Request, fp_id: Any) -> Response:
        fp = self.record(fp_id)
        body = s.StaffPatientUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        staff.update_record(fp, dict(body.validated_data), request=request)
        return Response(s.facility_patient_detail_data(fp))


class IdentifierCreateView(StaffView):
    permission_classes = [Needs("patient.register")]

    @extend_schema(
        operation_id="staff_patients_identifiers_create",
        tags=TAGS,
        request=s.StaffIdentifierSerializer,
        responses={201: s.IdentifierSerializer, 409: _err("used by another patient")},
        summary="Add or replace an identity document",
    )
    def post(self, request: Request, fp_id: Any) -> Response:
        fp = self.active_record(fp_id)
        body = s.StaffIdentifierSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        identifier = staff.add_identifier(
            fp, body.validated_data, request=request, principal=self.principal()
        )
        return Response(s.IdentifierSerializer(identifier).data, status=status.HTTP_201_CREATED)


class RevealView(StaffView):
    permission_classes = [Needs("patients.view")]
    throttle_classes = [BurstRateThrottle, RevealRateThrottle]

    @extend_schema(
        operation_id="staff_patients_reveal",
        tags=TAGS,
        request=s.StaffRevealSerializer,
        responses={200: s.RevealSerializer},
        summary="Show a full identifier or phone number, with a reason (audited)",
    )
    def post(self, request: Request, fp_id: Any) -> Response:
        fp = self.active_record(fp_id)
        body = s.StaffRevealSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        if (
            body.validated_data["field"] == "identifier"
            and "patients.identifier_reveal" not in self.principal().permissions
        ):
            raise exceptions.PermissionDenied()
        value = staff.reveal(fp, body.validated_data, request=request)
        response = Response({"value": value})
        response["Cache-Control"] = "no-store"
        return response


# ---- insurance -----------------------------------------------------------------------------------


class _InsuranceMixin(StaffView):
    def profile(self, fp: FacilityPatient, profile_id: Any) -> InsuranceProfile:
        profile = InsuranceProfile.objects.filter(pk=profile_id, patient=fp.patient).first()
        if profile is None:
            raise Http404
        return profile

    def event(self, action: str, fp: FacilityPatient, profile: InsuranceProfile, **kw: Any) -> None:
        record_patient_event(
            action,
            request=self.request,
            patient=fp.patient,
            object_type="insurance_profile",
            object_id=profile.pk,
            **kw,
        )


class InsuranceListView(_InsuranceMixin):
    permission_classes = [Needs("patients.view", methods={"POST": ("patient.register",)})]

    @extend_schema(
        operation_id="staff_patients_insurance_list",
        tags=TAGS,
        responses={200: s.InsuranceProfileSerializer(many=True)},
        summary="Insurance profiles of the patient",
    )
    def get(self, request: Request, fp_id: Any) -> Response:
        fp = self.record(fp_id)
        profiles = insurance.profiles_of(fp.patient)
        return Response({"results": s.InsuranceProfileSerializer(profiles, many=True).data})

    @extend_schema(
        operation_id="staff_patients_insurance_create",
        tags=TAGS,
        request=s.InsuranceInputSerializer,
        responses={201: s.InsuranceProfileSerializer, 409: _err("same card exists")},
        summary="Add an insurance card",
    )
    def post(self, request: Request, fp_id: Any) -> Response:
        fp = self.active_record(fp_id)
        body = s.InsuranceInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        profile = insurance.add_profile(
            fp.patient, dict(body.validated_data), actor=self.principal().user
        )
        self.event("patients.insurance.added", fp, profile)
        return Response(s.InsuranceProfileSerializer(profile).data, status=status.HTTP_201_CREATED)


class InsuranceDetailView(_InsuranceMixin):
    permission_classes = [Needs("patient.register")]

    @extend_schema(
        operation_id="staff_patients_insurance_update",
        tags=TAGS,
        request=s.InsuranceUpdateSerializer,
        responses={200: s.InsuranceProfileSerializer, 409: _err("conflict")},
        summary="Edit an insurance card (identity changes reset the status)",
    )
    def patch(self, request: Request, fp_id: Any, profile_id: Any) -> Response:
        fp = self.active_record(fp_id)
        profile = self.profile(fp, profile_id)
        body = s.InsuranceUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        changed = insurance.update_profile(profile, dict(body.validated_data))
        if changed:
            self.event("patients.insurance.updated", fp, profile, metadata={"fields": changed})
        return Response(s.InsuranceProfileSerializer(profile).data)


class InsuranceVerifyView(_InsuranceMixin):
    permission_classes = [Needs("patients.insurance_verify")]

    @extend_schema(
        operation_id="staff_patients_insurance_verify",
        tags=TAGS,
        request=s.InsuranceVerifySerializer,
        responses={200: s.InsuranceProfileSerializer},
        summary="Mark a card verified or rejected",
    )
    def post(self, request: Request, fp_id: Any, profile_id: Any) -> Response:
        fp = self.active_record(fp_id)
        profile = self.profile(fp, profile_id)
        if not profile.is_active:
            raise Http404
        body = s.InsuranceVerifySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        principal = self.principal()
        insurance.verify(
            profile,
            outcome=data["outcome"],
            valid_until=data.get("valid_until"),
            reason=data.get("reason", ""),
            actor=principal.user,
            facility_id=principal.active_facility_id,
        )
        self.event(f"patients.insurance.{data['outcome']}", fp, profile)
        return Response(s.InsuranceProfileSerializer(profile).data)


class CardImageView(_InsuranceMixin):
    permission_classes = [Needs("patient.register")]
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [BurstRateThrottle, UploadRateThrottle]

    @extend_schema(
        operation_id="staff_patients_insurance_card_upload",
        tags=TAGS,
        request={"multipart/form-data": s.CardImageSerializer},
        responses={201: s.InsuranceProfileSerializer},
        summary="Capture a card photo (S1 upload pipeline)",
    )
    def post(self, request: Request, fp_id: Any, profile_id: Any) -> Response:
        fp = self.active_record(fp_id)
        profile = self.profile(fp, profile_id)
        if not profile.is_active:
            raise Http404
        body = s.CardImageSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            insurance.attach_card(
                profile,
                side=body.validated_data["side"],
                django_file=body.validated_data["file"],
                actor=self.principal().user,
                audience="staff",
                request=request,
            )
        except uploads.UploadRejected as exc:
            raise rejected(exc) from None
        self.event(
            "patients.insurance.card_uploaded",
            fp,
            profile,
            metadata={"side": body.validated_data["side"]},
        )
        return Response(s.InsuranceProfileSerializer(profile).data, status=status.HTTP_201_CREATED)


class CardDownloadLinkView(_InsuranceMixin):
    permission_classes = [Needs("patients.view")]

    @extend_schema(
        operation_id="staff_patients_insurance_card_link",
        tags=TAGS,
        request=None,
        responses={200: OpenApiResponse(description="{url, expires_at}")},
        summary="A 5-minute link to a card photo",
    )
    def post(self, request: Request, fp_id: Any, profile_id: Any, side: str) -> Response:
        fp = self.record(fp_id)
        return card_link(request, self.profile(fp, profile_id), side)


def card_link(request: Request, profile: InsuranceProfile, side: str) -> Response:
    if side not in ("front", "back"):
        raise Http404
    file = getattr(profile, f"card_{side}_file")
    if file is None:
        raise Http404
    try:
        link = uploads.download_link(file, principal=get_principal(request), request=request)
    except uploads.NotClean:
        from medilink.core.exceptions import BusinessRuleViolation
        from medilink.uploads.views import NOT_CLEAN

        raise BusinessRuleViolation(NOT_CLEAN) from None
    return Response({"url": link.url, "expires_at": link.expires_at})


# ---- health profile ------------------------------------------------------------------------------


class HealthProfileView(StaffView):
    permission_classes = [Needs("clinical.view", "prescription.view")]

    @extend_schema(
        operation_id="staff_patients_health_profile",
        tags=TAGS,
        responses={200: s.HealthProfileSerializer},
        summary="Allergies, conditions and medicines (pharmacy: allergies only)",
    )
    def get(self, request: Request, fp_id: Any) -> Response:
        fp = self.active_record(fp_id)
        full = "clinical.view" in self.principal().permissions
        sections = tuple(s.HEALTH_MODELS) if full else ("allergies",)
        record_patient_event(
            "patients.health_profile.viewed",
            request=request,
            patient=fp.patient,
            object_type="facility_patient",
            object_id=fp.pk,
            metadata={"sections": list(sections)},
        )
        return Response(s.health_profile_data(fp.patient, sections=sections))


class HealthItemCreateView(StaffView):
    permission_classes = [Needs("clinical.write")]

    @extend_schema(
        operation_id="staff_patients_health_item_create",
        tags=TAGS,
        request=s.AllergyInputSerializer,
        responses={201: s.HealthItemSerializer},
        summary="Add a verified allergy, condition or medicine",
    )
    def post(self, request: Request, fp_id: Any, kind: str) -> Response:
        if kind not in s.HEALTH_MODELS:
            raise Http404
        fp = self.active_record(fp_id)
        body = s.HEALTH_INPUT[kind](data=request.data)
        body.is_valid(raise_exception=True)
        principal = self.principal()
        item = health.add_item(
            fp.patient,
            kind,
            dict(body.validated_data),
            actor=principal.user,
            source=HealthSource.CLINICIAN,
            facility_id=principal.active_facility_id,
            membership=principal.membership,
        )
        record_patient_event(
            "patients.health_item.added",
            request=request,
            patient=fp.patient,
            object_type=s.HEALTH_KIND[kind],
            object_id=item.pk,
        )
        return Response(s.health_item_data(item), status=status.HTTP_201_CREATED)


class HealthItemReviewView(StaffView):
    permission_classes = [Needs("clinical.write")]

    @extend_schema(
        operation_id="staff_patients_health_item_review",
        tags=TAGS,
        request=s.HealthReviewSerializer,
        responses={200: s.HealthItemSerializer},
        summary="Verify, refute or mark an item entered in error",
    )
    def post(self, request: Request, fp_id: Any, kind: str, item_id: Any) -> Response:
        if kind not in s.HEALTH_MODELS:
            raise Http404
        fp = self.active_record(fp_id)
        item = health.get_item(fp.patient, kind, item_id)
        body = s.HealthReviewSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        principal = self.principal()
        health.review(
            item,
            outcome=body.validated_data["outcome"],
            note=body.validated_data.get("note", ""),
            actor=principal.user,
            membership=principal.membership,
        )
        record_patient_event(
            "patients.health_item.reviewed",
            request=request,
            patient=fp.patient,
            object_type=s.HEALTH_KIND[kind],
            object_id=item.pk,
            metadata={"outcome": body.validated_data["outcome"]},
        )
        return Response(s.health_item_data(item))


class ConsentCreateView(StaffView):
    permission_classes = [Needs("patient.register")]

    @extend_schema(
        operation_id="staff_patients_consents_create",
        tags=TAGS,
        request=s.StaffConsentSerializer,
        responses={201: s.ConsentRecordSerializer},
        summary="Record a care or research consent at the desk",
    )
    def post(self, request: Request, fp_id: Any) -> Response:
        fp = self.active_record(fp_id)
        body = s.StaffConsentSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        principal = self.principal()
        consent = consents.record_consent(
            kind=data["kind"],
            version=data["version"],
            granted=data["granted"],
            channel=ConsentChannel.STAFF_ASSISTED,
            patient=fp.patient,
            recorded_by=principal.user,
            facility_id=principal.active_facility_id,
        )
        record_patient_event(
            "patients.consent.recorded",
            request=request,
            patient=fp.patient,
            object_type="consent",
            object_id=consent.pk,
            metadata={"kind": consent.kind, "granted": consent.granted},
        )
        return Response(
            s.ConsentRecordSerializer(
                {**consent.__dict__, "id": consent.pk, "patient_id": consent.patient_id}
            ).data,
            status=status.HTTP_201_CREATED,
        )


class ClaimConfirmationView(StaffView):
    permission_classes = [Needs("patient.register")]

    @extend_schema(
        operation_id="staff_patients_claim_confirm",
        tags=TAGS,
        request=s.ClaimConfirmationSerializer,
        responses={200: OpenApiResponse(description="RecordClaim"), 404: _err("not open here")},
        summary="Confirm a patient's record claim after an ID check",
    )
    def post(self, request: Request, fp_id: Any) -> Response:
        from medilink.patients import claims
        from medilink.patients.views_patient import claim_data

        fp = self.active_record(fp_id)
        body = s.ClaimConfirmationSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        principal = self.principal()
        claim = claims.confirm_at_reception(
            reference=body.validated_data["claim_reference"],
            patient=fp.patient,
            actor=principal.user,
            facility_id=principal.active_facility_id,
            request=request,
        )
        return Response(claim_data(claim))
