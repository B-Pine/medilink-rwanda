"""Patient endpoints (contract §3.2 PA1-PA26): profiles reached through the account's links."""

from __future__ import annotations

from typing import Any

from django.http import Http404
from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import exceptions, serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.accounts.serializers import StrictSerializer
from medilink.authz.permissions import IsPatientAuthenticated
from medilink.core.exceptions import error_response
from medilink.core.pagination import DefaultPagination
from medilink.core.serializers import ErrorSerializer
from medilink.core.throttling import BurstRateThrottle
from medilink.patients import claims, health, identity, insurance
from medilink.patients import self_service as svc
from medilink.patients import serializers as s
from medilink.patients.audit import record_patient_event
from medilink.patients.errors import FieldConflict, FieldRule, PatientsAPIView
from medilink.patients.models import (
    ConsentKind,
    HealthSource,
    InsuranceProfile,
    RecordClaim,
    Relationship,
    Sex,
)
from medilink.patients.staff import birth
from medilink.patients.throttling import RevealRateThrottle, VerificationRateThrottle
from medilink.uploads import services as uploads
from medilink.uploads.throttling import UploadRateThrottle
from medilink.uploads.views import rejected

TAGS = ["patient-profiles"]
DEPENDENT_RELATIONSHIPS = ("guardian", "delegate")


def _err(description: str) -> OpenApiResponse:
    return OpenApiResponse(response=ErrorSerializer, description=description)


# ---- shapes --------------------------------------------------------------------------------------


class ProfileSummarySerializer(serializers.Serializer):
    patient_id = serializers.UUIDField()
    display_name = serializers.CharField()
    relationship = serializers.ChoiceField(choices=Relationship.choices)
    medilink_number = serializers.CharField(allow_null=True)
    date_of_birth = serializers.DateField(allow_null=True)
    completion_percent = serializers.IntegerField()


class CompletionSerializer(serializers.Serializer):
    details = serializers.BooleanField()
    identifier = serializers.BooleanField()
    emergency_contact = serializers.BooleanField()
    care_consent = serializers.BooleanField()
    insurance = serializers.BooleanField()
    allergies_reviewed = serializers.BooleanField()


class PatientProfileDetailSerializer(serializers.Serializer):
    patient_id = serializers.UUIDField()
    relationship = serializers.ChoiceField(choices=Relationship.choices)
    medilink_number = serializers.CharField(allow_null=True)
    full_name = serializers.CharField()
    preferred_name = serializers.CharField(allow_null=True)
    date_of_birth = serializers.DateField(allow_null=True)
    is_birth_date_estimated = serializers.BooleanField()
    sex = serializers.CharField(allow_null=True)
    phone_e164 = serializers.CharField(allow_null=True)
    email = serializers.CharField(allow_null=True)
    address = serializers.CharField(allow_null=True)
    emergency_contact = s.EmergencyContactSerializer(allow_null=True)
    no_known_allergies = serializers.BooleanField(allow_null=True)
    has_care_consent = serializers.BooleanField()
    completion = CompletionSerializer()
    version = serializers.IntegerField()


class ProfileUpdateSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)
    full_name = serializers.CharField(max_length=200, required=False)
    preferred_name = serializers.CharField(max_length=100, required=False, allow_null=True)
    date_of_birth = serializers.DateField(required=False, allow_null=True, validators=[s.past_date])
    is_birth_date_estimated = serializers.BooleanField(required=False)
    sex = serializers.ChoiceField(choices=Sex.choices, required=False, allow_null=True)
    phone_e164 = s.PhoneField()
    email = serializers.EmailField(required=False, allow_null=True)
    address = serializers.CharField(max_length=300, required=False, allow_null=True)
    emergency_contact = s.EmergencyContactSerializer(required=False, allow_null=True)
    no_known_allergies = serializers.BooleanField(required=False, allow_null=True)


class DependentSerializer(StrictSerializer):
    relationship = serializers.ChoiceField(choices=DEPENDENT_RELATIONSHIPS)
    full_name = serializers.CharField(max_length=200)
    sex = serializers.ChoiceField(choices=Sex.choices)
    date_of_birth = serializers.DateField(required=False, allow_null=True, validators=[s.past_date])
    estimated_age_years = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, max_value=120
    )
    consent_version = serializers.CharField(max_length=32)
    consent_attested = serializers.BooleanField(default=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs.get("date_of_birth") is None and attrs.get("estimated_age_years") is None:
            raise serializers.ValidationError(
                {"date_of_birth": [_("Give a date of birth or an age.")]}
            )
        return attrs


class InviteCreateSerializer(StrictSerializer):
    patient_id = serializers.UUIDField()
    current_password = serializers.CharField(write_only=True, max_length=200)
    consent_version = serializers.CharField(max_length=32)


class InviteSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    code = serializers.CharField()
    relationship = serializers.CharField()
    expires_at = serializers.DateTimeField()


class CodeSerializer(StrictSerializer):
    code = serializers.CharField(max_length=20)


class DelegationRowSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    patient_id = serializers.UUIDField()
    profile_name = serializers.CharField()
    holder_name = serializers.CharField(allow_null=True)
    relationship = serializers.CharField()
    granted_at = serializers.DateTimeField(allow_null=True)
    can_revoke = serializers.BooleanField()


class PendingInviteSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    patient_id = serializers.UUIDField()
    profile_name = serializers.CharField()
    relationship = serializers.CharField()
    expires_at = serializers.DateTimeField()


class DelegationsSerializer(serializers.Serializer):
    granted = DelegationRowSerializer(many=True)
    received = DelegationRowSerializer(many=True)
    pending_invites = PendingInviteSerializer(many=True)


class ClaimLookupSerializer(StrictSerializer):
    identifier = s.IdentifierInputSerializer(required=False)
    medilink_number = serializers.CharField(max_length=20, required=False)
    phone_e164 = s.PhoneField()
    full_name = serializers.CharField(max_length=200, required=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        ways = [
            bool(attrs.get("identifier")),
            bool(attrs.get("medilink_number")),
            bool(attrs.get("phone_e164") and attrs.get("full_name")),
        ]
        if sum(ways) != 1:
            raise serializers.ValidationError(
                _("Give one: a document, your MediLink number, or your phone and name.")
            )
        return attrs


class ClaimCreateSerializer(StrictSerializer):
    lookup = ClaimLookupSerializer()
    date_of_birth = serializers.DateField()


class RecordClaimSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    status = serializers.CharField()
    method = serializers.CharField()
    contact_hint = serializers.CharField(allow_null=True)
    reference = serializers.CharField(allow_null=True)
    expires_at = serializers.DateTimeField()


class ClaimVerifiedSerializer(serializers.Serializer):
    claim = RecordClaimSerializer()
    profile = ProfileSummarySerializer()


class ConsentInputSerializer(StrictSerializer):
    kind = serializers.ChoiceField(
        choices=[ConsentKind.TERMS, ConsentKind.PRIVACY, ConsentKind.CARE, ConsentKind.RESEARCH]
    )
    version = serializers.CharField(max_length=32)
    granted = serializers.BooleanField()
    patient_id = serializers.UUIDField(required=False, allow_null=True)


class ConsentStateSerializer(serializers.Serializer):
    current_versions = serializers.DictField(child=serializers.CharField())
    consents = s.ConsentRecordSerializer(many=True)
    history = s.ConsentRecordSerializer(many=True)


class AccessHistoryItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    occurred_at = serializers.DateTimeField()
    action = serializers.CharField()
    actor_kind = serializers.CharField()
    actor_role = serializers.CharField(allow_null=True)
    facility = serializers.DictField(allow_null=True)


def claim_data(claim: RecordClaim) -> dict[str, Any]:
    by_code = claim.method == "contact_code"
    return RecordClaimSerializer(
        {
            "id": claim.pk,
            "status": claim.status,
            "method": claim.method,
            "contact_hint": claims.mask_email(claim.patient.email)
            if by_code and claim.patient.email
            else None,
            "reference": None if by_code else claim.reference,
            "expires_at": claim.expires_at,
        }
    ).data


# ---- views ---------------------------------------------------------------------------------------


class PatientView(PatientsAPIView):
    permission_classes = [IsPatientAuthenticated]

    def link(self, patient_id: Any, right: str = "view") -> Any:
        link = svc.link_for(self.request.user, patient_id)
        svc.require(link, right)
        return link


class ProfileListView(PatientView):
    @extend_schema(
        operation_id="patient_profiles_list",
        tags=TAGS,
        responses={200: ProfileSummarySerializer(many=True)},
        summary="Profiles of this account: self first, then dependents and delegations",
    )
    def get(self, request: Request) -> Response:
        return Response({"results": [svc.summary_data(link) for link in svc.links(request.user)]})


class ProfileDetailView(PatientView):
    @extend_schema(
        operation_id="patient_profiles_retrieve",
        tags=TAGS,
        responses={200: PatientProfileDetailSerializer, 404: _err("not_found")},
        summary="A profile",
    )
    def get(self, request: Request, patient_id: Any) -> Response:
        return Response(
            PatientProfileDetailSerializer(svc.profile_data(self.link(patient_id))).data
        )

    @extend_schema(
        operation_id="patient_profiles_update",
        tags=TAGS,
        request=ProfileUpdateSerializer,
        responses={200: PatientProfileDetailSerializer, 409: _err("conflict")},
        summary="Edit a profile (names, birth date and sex: self or guardian)",
    )
    def patch(self, request: Request, patient_id: Any) -> Response:
        link = self.link(patient_id, "edit_contacts")
        body = ProfileUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        svc.update_profile(link, dict(body.validated_data), request=request)
        return Response(PatientProfileDetailSerializer(svc.profile_data(link)).data)


class IdentifierListView(PatientView):
    def get_throttles(self) -> list[Any]:
        if self.request.method == "POST":
            return [BurstRateThrottle(), VerificationRateThrottle()]
        return super().get_throttles()

    @extend_schema(
        operation_id="patient_identifiers_list",
        tags=TAGS,
        responses={200: s.IdentifierSerializer(many=True)},
        summary="Identity documents (masked)",
    )
    def get(self, request: Request, patient_id: Any) -> Response:
        link = self.link(patient_id)
        items = identity.active_identifiers(link.patient)
        return Response({"results": s.IdentifierSerializer(items, many=True).data})

    @extend_schema(
        operation_id="patient_identifiers_create",
        tags=TAGS,
        request=s.IdentifierInputSerializer,
        responses={201: s.IdentifierSerializer, 409: _err("used by another patient")},
        summary="Add an identity document (a verified one changes only at reception)",
    )
    def post(self, request: Request, patient_id: Any) -> Response:
        link = self.link(patient_id, "identifiers")
        body = s.IdentifierInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        try:
            new, old = identity.add_identifier(
                link.patient,
                kind=data["kind"],
                country=data.get("issuing_country", ""),
                value=data["value"],
                actor=request.user,
                allow_replace_verified=False,
            )
        except identity.IdentifierTaken:
            raise FieldConflict(
                "value", _("This document is on another MediLink record. You can claim it.")
            ) from None
        except identity.IdentifierLocked:
            raise FieldRule(
                "kind", _("A checked document can only be changed at reception.")
            ) from None
        except identity.InvalidValue as exc:
            raise exceptions.ValidationError({"value": [str(exc)]}) from None
        if old is not None:
            record_patient_event(
                "patients.identifier.superseded",
                request=request,
                patient=link.patient,
                object_type="identifier",
                object_id=old.pk,
                metadata={"kind": old.kind},
            )
        record_patient_event(
            "patients.identifier.added",
            request=request,
            patient=link.patient,
            object_type="identifier",
            object_id=new.pk,
            metadata={"kind": new.kind},
        )
        return Response(s.IdentifierSerializer(new).data, status=status.HTTP_201_CREATED)


class IdentifierRevealView(PatientView):
    throttle_classes = [BurstRateThrottle, RevealRateThrottle]

    @extend_schema(
        operation_id="patient_identifiers_reveal",
        tags=TAGS,
        request=None,
        responses={200: s.RevealSerializer},
        summary="Show the full number of your own document",
    )
    def post(self, request: Request, patient_id: Any, identifier_id: Any) -> Response:
        link = self.link(patient_id, "identifiers")
        item = next(
            (
                i
                for i in identity.active_identifiers(link.patient)
                if str(i.pk) == str(identifier_id)
            ),
            None,
        )
        if item is None:
            raise Http404
        value = identity.reveal(item)
        record_patient_event(
            "patients.identifier.revealed",
            request=request,
            patient=link.patient,
            object_type="identifier",
            object_id=item.pk,
            reason="patient_request",
            metadata={"kind": item.kind},
        )
        response = Response({"value": value})
        response["Cache-Control"] = "no-store"
        return response


class DependentCreateView(PatientView):
    @extend_schema(
        operation_id="patient_dependents_create",
        tags=TAGS,
        request=DependentSerializer,
        responses={201: ProfileSummarySerializer, 422: _err("age or limit rules")},
        summary="Add a child (guardian) or an adult who agreed (delegate)",
    )
    def post(self, request: Request) -> Response:
        body = DependentSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        link = svc.add_dependent(
            account=request.user,
            data=body.validated_data,
            birth=birth(body.validated_data),
            request=request,
        )
        return Response(svc.summary_data(link), status=status.HTTP_201_CREATED)


class DelegationListView(PatientView):
    def get_throttles(self) -> list[Any]:
        if self.request.method == "POST":
            return [BurstRateThrottle(), VerificationRateThrottle()]
        return super().get_throttles()

    @extend_schema(
        operation_id="patient_delegations_list",
        tags=TAGS,
        responses={200: DelegationsSerializer},
        summary="Access you granted, access you received, and pending invites",
    )
    def get(self, request: Request) -> Response:
        return Response(DelegationsSerializer(svc.delegations(request.user)).data)

    @extend_schema(
        operation_id="patient_delegations_create",
        tags=TAGS,
        request=InviteCreateSerializer,
        responses={201: InviteSerializer},
        summary="Create a one-time code to share a profile (password required)",
    )
    def post(self, request: Request) -> Response:
        body = InviteCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        if not request.user.check_password(body.validated_data["current_password"]):
            raise exceptions.ValidationError(
                {"current_password": [_("Your password isn't right.")]}
            )
        link = self.link(body.validated_data["patient_id"], "invite")
        invite, code = svc.create_invite(
            link=link, consent_version=body.validated_data["consent_version"], request=request
        )
        response = Response(
            {
                "id": invite.pk,
                "code": code,
                "relationship": invite.relationship,
                "expires_at": invite.expires_at,
            },
            status=status.HTTP_201_CREATED,
        )
        response["Cache-Control"] = "no-store"
        return response


class DelegationAcceptView(PatientView):
    throttle_classes = [BurstRateThrottle, VerificationRateThrottle]

    @extend_schema(
        operation_id="patient_delegations_accept",
        tags=TAGS,
        request=CodeSerializer,
        responses={201: ProfileSummarySerializer},
        summary="Accept a code someone shared with you",
    )
    def post(self, request: Request) -> Response:
        body = CodeSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        link = svc.accept_invite(
            account=request.user, code=body.validated_data["code"], request=request
        )
        return Response(svc.summary_data(link), status=status.HTTP_201_CREATED)


class DelegationRevokeView(PatientView):
    @extend_schema(
        operation_id="patient_delegations_revoke",
        tags=TAGS,
        request=None,
        responses={204: None},
        summary="End a link or cancel a pending invite",
    )
    def post(self, request: Request, object_id: Any) -> Response:
        svc.revoke(account=request.user, object_id=object_id, request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---- insurance -----------------------------------------------------------------------------------


class _PatientInsurance(PatientView):
    def profile(self, profile_id: Any) -> tuple[Any, InsuranceProfile]:
        profile = InsuranceProfile.objects.filter(pk=profile_id).first()
        if profile is None:
            raise Http404
        link = self.link(profile.patient_id, "edit_contacts")
        return link, profile

    def event(self, action: str, link: Any, profile: InsuranceProfile, **kw: Any) -> None:
        record_patient_event(
            action,
            request=self.request,
            patient=link.patient,
            object_type="insurance_profile",
            object_id=profile.pk,
            **kw,
        )


class InsuranceListView(_PatientInsurance):
    @extend_schema(
        operation_id="patient_insurance_list",
        tags=TAGS,
        responses={200: s.InsuranceProfileSerializer(many=True)},
        summary="Insurance cards, active first",
    )
    def get(self, request: Request, patient_id: Any) -> Response:
        link = self.link(patient_id)
        profiles = insurance.profiles_of(link.patient)
        return Response({"results": s.InsuranceProfileSerializer(profiles, many=True).data})

    @extend_schema(
        operation_id="patient_insurance_create",
        tags=TAGS,
        request=s.InsuranceInputSerializer,
        responses={201: s.InsuranceProfileSerializer, 409: _err("same card exists")},
        summary="Add an insurance card",
    )
    def post(self, request: Request, patient_id: Any) -> Response:
        link = self.link(patient_id, "edit_contacts")
        body = s.InsuranceInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        profile = insurance.add_profile(link.patient, dict(body.validated_data), actor=request.user)
        self.event("patients.insurance.added", link, profile)
        return Response(s.InsuranceProfileSerializer(profile).data, status=status.HTTP_201_CREATED)


class InsuranceDetailView(_PatientInsurance):
    @extend_schema(
        operation_id="patient_insurance_update",
        tags=TAGS,
        request=s.InsuranceUpdateSerializer,
        responses={200: s.InsuranceProfileSerializer},
        summary="Edit an insurance card",
    )
    def patch(self, request: Request, profile_id: Any) -> Response:
        link, profile = self.profile(profile_id)
        body = s.InsuranceUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        changed = insurance.update_profile(profile, dict(body.validated_data))
        if changed:
            self.event("patients.insurance.updated", link, profile, metadata={"fields": changed})
        return Response(s.InsuranceProfileSerializer(profile).data)


class InsuranceDeactivateView(_PatientInsurance):
    @extend_schema(
        operation_id="patient_insurance_deactivate",
        tags=TAGS,
        request=None,
        responses={200: s.InsuranceProfileSerializer},
        summary="Stop using a card (kept for history)",
    )
    def post(self, request: Request, profile_id: Any) -> Response:
        link, profile = self.profile(profile_id)
        if profile.is_active:
            insurance.deactivate(profile)
            self.event("patients.insurance.deactivated", link, profile)
        return Response(s.InsuranceProfileSerializer(profile).data)


class CardImageView(_PatientInsurance):
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [BurstRateThrottle, UploadRateThrottle]

    @extend_schema(
        operation_id="patient_insurance_card_upload",
        tags=TAGS,
        request={"multipart/form-data": s.CardImageSerializer},
        responses={201: s.InsuranceProfileSerializer},
        summary="Add a photo of the card (S1 upload pipeline)",
    )
    def post(self, request: Request, profile_id: Any) -> Response:
        link, profile = self.profile(profile_id)
        if not profile.is_active:
            raise Http404
        body = s.CardImageSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            insurance.attach_card(
                profile,
                side=body.validated_data["side"],
                django_file=body.validated_data["file"],
                actor=request.user,
                audience="patient",
                request=request,
            )
        except uploads.UploadRejected as exc:
            raise rejected(exc) from None
        self.event(
            "patients.insurance.card_uploaded",
            link,
            profile,
            metadata={"side": body.validated_data["side"]},
        )
        return Response(s.InsuranceProfileSerializer(profile).data, status=status.HTTP_201_CREATED)


class CardDownloadLinkView(_PatientInsurance):
    @extend_schema(
        operation_id="patient_insurance_card_link",
        tags=TAGS,
        request=None,
        responses={200: OpenApiResponse(description="{url, expires_at}")},
        summary="A 5-minute link to a card photo",
    )
    def post(self, request: Request, profile_id: Any, side: str) -> Response:
        from medilink.patients.views_staff import card_link

        _link, profile = self.profile(profile_id)
        return card_link(request, profile, side)


# ---- health profile ------------------------------------------------------------------------------


class HealthProfileView(PatientView):
    @extend_schema(
        operation_id="patient_health_profile",
        tags=TAGS,
        responses={200: s.HealthProfileSerializer},
        summary="Allergies, conditions and medicines",
    )
    def get(self, request: Request, patient_id: Any) -> Response:
        link = self.link(patient_id)
        return Response(s.health_profile_data(link.patient, sections=tuple(s.HEALTH_MODELS)))


class HealthItemCreateView(PatientView):
    @extend_schema(
        operation_id="patient_health_item_create",
        tags=TAGS,
        request=s.AllergyInputSerializer,
        responses={201: s.HealthItemSerializer},
        summary="Add an allergy, condition or medicine (unverified until a clinician checks)",
    )
    def post(self, request: Request, patient_id: Any, kind: str) -> Response:
        if kind not in s.HEALTH_MODELS:
            raise Http404
        link = self.link(patient_id, "edit_contacts")
        body = s.HEALTH_INPUT[kind](data=request.data)
        body.is_valid(raise_exception=True)
        item = health.add_item(
            link.patient,
            kind,
            dict(body.validated_data),
            actor=request.user,
            source=HealthSource.PATIENT,
        )
        return Response(s.health_item_data(item), status=status.HTTP_201_CREATED)


class HealthItemErrorView(PatientView):
    @extend_schema(
        operation_id="patient_health_item_entered_in_error",
        tags=TAGS,
        request=None,
        responses={200: s.HealthItemSerializer, 422: _err("verified by a clinician")},
        summary="Remove an item you added by mistake",
    )
    def post(self, request: Request, patient_id: Any, kind: str, item_id: Any) -> Response:
        if kind not in s.HEALTH_MODELS:
            raise Http404
        link = self.link(patient_id, "edit_contacts")
        item = health.get_item(link.patient, kind, item_id)
        health.patient_entered_in_error(item, actor=request.user)
        return Response(s.health_item_data(item))


# ---- claims --------------------------------------------------------------------------------------


class ClaimCreateView(PatientView):
    throttle_classes = [BurstRateThrottle, VerificationRateThrottle]

    @extend_schema(
        operation_id="patient_record_claims_create",
        tags=TAGS,
        request=ClaimCreateSerializer,
        responses={201: RecordClaimSerializer, 422: _err("no match (generic)")},
        summary="Claim a record a facility created for you",
    )
    def post(self, request: Request) -> Response:
        body = ClaimCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        claim = claims.request_claim(
            account=request.user,
            own=svc.own_link(request.user).patient,
            lookup=body.validated_data["lookup"],
            date_of_birth=body.validated_data["date_of_birth"],
            request=request,
        )
        return Response(claim_data(claim), status=status.HTTP_201_CREATED)


def _own_claim(request: Request, claim_id: Any) -> RecordClaim:
    claim = (
        RecordClaim.objects.filter(pk=claim_id, account=request.user)  # type: ignore[misc]
        .select_related("patient")
        .first()
    )
    if claim is None:
        raise Http404
    return claim


class ClaimDetailView(PatientView):
    @extend_schema(
        operation_id="patient_record_claims_retrieve",
        tags=TAGS,
        responses={200: RecordClaimSerializer},
        summary="A claim (polled while reception checks)",
    )
    def get(self, request: Request, claim_id: Any) -> Response:
        return Response(claim_data(_own_claim(request, claim_id)))


class ClaimVerifyView(PatientView):
    throttle_classes = [BurstRateThrottle, VerificationRateThrottle]

    @extend_schema(
        operation_id="patient_record_claims_verify",
        tags=TAGS,
        request=CodeSerializer,
        responses={200: ClaimVerifiedSerializer, 400: _err("wrong code"), 422: _err("failed")},
        summary="Enter the emailed code",
    )
    def post(self, request: Request, claim_id: Any) -> Response:
        claim = _own_claim(request, claim_id)
        body = CodeSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            claim = claims.verify_code(claim, code=body.validated_data["code"], request=request)
        except claims.ClaimFailed as exc:  # the attempt count is kept (no rollback)
            if exc.field:
                return error_response(
                    400, "validation_error", exc.message, {exc.field: [str(exc.message)]}
                )
            return error_response(422, "business_rule_violation", exc.message)
        link = svc.own_link(request.user)
        return Response({"claim": claim_data(claim), "profile": svc.summary_data(link)})


# ---- consents and access history -----------------------------------------------------------------


class ConsentView(PatientView):
    @extend_schema(
        operation_id="patient_consents_retrieve",
        tags=TAGS,
        responses={200: ConsentStateSerializer},
        summary="Current consents and their history",
    )
    def get(self, request: Request) -> Response:
        return Response(ConsentStateSerializer(svc.consent_state(request.user)).data)

    @extend_schema(
        operation_id="patient_consents_create",
        tags=TAGS,
        request=ConsentInputSerializer,
        responses={201: s.ConsentRecordSerializer},
        summary="Give or withdraw a consent (append-only)",
    )
    def post(self, request: Request) -> Response:
        body = ConsentInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        record = svc.give_consent(account=request.user, data=body.validated_data, request=request)
        return Response(
            s.ConsentRecordSerializer(
                {
                    "id": record.pk,
                    "kind": record.kind,
                    "patient_id": record.patient_id,
                    "granted": record.granted,
                    "version": record.version,
                    "granted_at": record.granted_at,
                    "channel": record.channel,
                }
            ).data,
            status=status.HTTP_201_CREATED,
        )


class AccessHistoryView(PatientView):
    @extend_schema(
        operation_id="patient_access_history",
        tags=TAGS,
        responses={200: AccessHistoryItemSerializer(many=True)},
        summary="Who opened or changed this profile",
    )
    def get(self, request: Request, patient_id: Any) -> Response:
        link = self.link(patient_id, "history")
        paginator = DefaultPagination()
        page: list[Any] | None = paginator.paginate_queryset(
            svc.access_history(link, request.user), request, view=self
        )
        return paginator.get_paginated_response([svc.history_item(i) for i in page or []])
