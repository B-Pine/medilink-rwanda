"""Staff management and invitation endpoints (contract sprint-02 §3.5)."""

from __future__ import annotations

from typing import Any

from django.contrib.auth import authenticate
from django.http import Http404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import exceptions, status
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.accounts import mfa
from medilink.accounts.authentication import StaffSessionAuthentication
from medilink.accounts.models import ClinicianProfile, User
from medilink.accounts.principal import PrincipalState
from medilink.accounts.serializers import LoginResultSerializer
from medilink.accounts.services import complete_staff_login, staff_me_data, start_pending_mfa
from medilink.audit.services import record
from medilink.authz.permissions import (
    IsPlatformAdmin,
    IsStaffAuthenticated,
    PublicEndpoint,
    get_principal,
)
from medilink.authz.stepup import RecentAuthRequired
from medilink.core.throttling import BurstRateThrottle, IPScopedRateThrottle
from medilink.facilities import serializers as s
from medilink.facilities import staff
from medilink.facilities.errors import SetupAPIView
from medilink.facilities.throttling import InvitationRateThrottle
from medilink.facilities.views_base import FacilityView, Member, Needs, err
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import FacilityMembership, Invitation, Role

TAGS = ["staff-team"]
MANAGE = "staff.manage"


class RolesView(FacilityView):
    permission_classes = [Member]

    @extend_schema(
        operation_id="staff_roles_list", tags=TAGS, responses={200: s.RoleSerializer(many=True)}
    )
    def get(self, request: Request) -> Response:
        roles = Role.objects.prefetch_related("permissions").order_by("code")
        return Response(
            {
                "results": [
                    {
                        "code": r.code,
                        "name": r.name,
                        "permissions": sorted(p.code for p in r.permissions.all()),
                    }
                    for r in roles
                ]
            }
        )


def membership_data(m: FacilityMembership) -> dict[str, Any]:
    profile = ClinicianProfile.objects.filter(user_id=m.user_id).first()
    return s.StaffMembershipSerializer(
        {
            "id": m.pk,
            "user_id": m.user_id,
            "full_name": m.user.full_name,
            "email": m.user.email,
            "roles": sorted(r.code for r in m.roles.all()),
            "service_points": [p.service_point_id for p in m.service_points.all()],
            "is_active": m.is_active,
            "mfa_enabled": mfa.has_confirmed_mfa(m.user),
            "clinician": {
                "council": profile.council,
                "licence_number": profile.licence_number,
                "specialty": profile.specialty,
                "attested_at": m.licence_attested_at,
            }
            if profile
            else None,
            "joined_at": m.created_at,
            "deactivation_reason": m.deactivation_reason,
            "version": m.version,
        }
    ).data


class StaffView(FacilityView):
    def memberships(self) -> Any:
        return (
            FacilityMembership.objects.filter(facility_id=self.principal().active_facility_id)
            .select_related("user")
            .prefetch_related("roles", "service_points")
        )

    def membership(self, membership_id: Any) -> FacilityMembership:
        found = self.memberships().filter(pk=membership_id).first()
        if found is None:
            raise Http404
        return found


class MembershipsView(StaffView):
    permission_classes = [Needs(MANAGE)]

    @extend_schema(
        operation_id="staff_memberships_list",
        tags=TAGS,
        parameters=[
            OpenApiParameter("status", str),
            OpenApiParameter("role", str),
            OpenApiParameter("q", str),
        ],
        responses={200: s.StaffMembershipSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        rows = self.memberships()
        state = request.query_params.get("status")
        if state in ("active", "deactivated"):
            rows = rows.filter(is_active=state == "active")
        if request.query_params.get("role"):
            rows = rows.filter(roles__code=request.query_params["role"])
        q = request.query_params.get("q", "").strip()
        if q:
            rows = rows.filter(user__full_name__icontains=q) | rows.filter(user__email__icontains=q)
        return Response(
            {"results": [membership_data(m) for m in rows.distinct().order_by("user__full_name")]}
        )


class MembershipDetailView(StaffView):
    permission_classes = [Needs(MANAGE), RecentAuthRequired(methods=("PATCH",))]

    @extend_schema(
        operation_id="staff_memberships_retrieve",
        tags=TAGS,
        responses={200: s.StaffMembershipSerializer},
    )
    def get(self, request: Request, membership_id: Any) -> Response:
        return Response(membership_data(self.membership(membership_id)))

    @extend_schema(
        operation_id="staff_memberships_update",
        tags=TAGS,
        request=s.MembershipUpdateSerializer,
        responses={200: s.StaffMembershipSerializer, 422: err("last facility admin")},
    )
    def patch(self, request: Request, membership_id: Any) -> Response:
        body = s.MembershipUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        m = staff.update_membership(
            self.membership(membership_id),
            dict(body.validated_data),
            actor=request.user,
            request=request,
        )
        return Response(membership_data(self.membership(m.pk)))


class MembershipActionView(StaffView):
    permission_classes = [Needs(MANAGE)]
    STEP_UP = ("deactivate", "reactivate", "mfa-reset")

    def get_permissions(self) -> list[Any]:
        perms: list[Any] = [Needs(MANAGE)()]
        if self.kwargs.get("action") in self.STEP_UP:
            perms.append(RecentAuthRequired()())
        return perms

    @extend_schema(
        operation_id="staff_memberships_action",
        tags=TAGS,
        request=s.ReasonSerializer,
        responses={200: s.StaffMembershipSerializer, 422: err("rule")},
    )
    def post(self, request: Request, membership_id: Any, action: str) -> Response:
        m = self.membership(membership_id)
        if action == "deactivate":
            body = s.ReasonSerializer(data=request.data)
            body.is_valid(raise_exception=True)
            staff.deactivate(
                m, reason=body.validated_data["reason"], actor=request.user, request=request
            )
        elif action == "reactivate":
            staff.reactivate(m, actor=request.user, request=request)
        elif action == "attest-licence":
            staff.attest_licence(m, actor=request.user, request=request)
        elif action == "mfa-reset":
            staff.reset_mfa(m.user, actor=request.user, facility_id=m.facility_id, request=request)
        else:
            raise Http404
        return Response(membership_data(self.membership(m.pk)))


def invitation_data(i: Invitation) -> dict[str, Any]:
    if i.accepted_at:
        state = "accepted"
    elif i.revoked_at:
        state = "revoked"
    elif i.expires_at <= timezone.now():
        state = "expired"
    else:
        state = "pending"
    return {
        "id": i.pk,
        "email": i.email,
        "role_codes": list(i.role_codes),
        "service_point_ids": list(i.service_point_ids),
        "status": state,
        "expires_at": i.expires_at,
        "invited_by": i.invited_by.full_name if i.invited_by else None,
        "created_at": i.created_at,
    }


class InvitationsView(StaffView):
    permission_classes = [Needs(MANAGE), RecentAuthRequired(methods=("POST",))]

    def get_throttles(self) -> list[Any]:
        if self.request.method == "POST":
            return [BurstRateThrottle(), InvitationRateThrottle()]
        return super().get_throttles()

    @extend_schema(
        operation_id="staff_invitations_list",
        tags=TAGS,
        responses={200: s.InvitationSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        rows = Invitation.objects.filter(
            facility_id=self.principal().active_facility_id
        ).select_related("invited_by")
        return Response(
            {"results": [invitation_data(i) for i in rows.order_by("-created_at")[:200]]}
        )

    @extend_schema(
        operation_id="staff_invitations_create",
        tags=TAGS,
        request=s.InvitationCreateSerializer,
        responses={201: s.InvitationSerializer, 409: err("pending invitation or already a member")},
    )
    def post(self, request: Request) -> Response:
        body = s.InvitationCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        invitation = staff.invite(
            self.facility(),
            email=data["email"],
            role_codes=data["role_codes"],
            service_point_ids=data["service_point_ids"],
            actor=request.user,
            request=request,
        )
        return Response(invitation_data(invitation), status=status.HTTP_201_CREATED)


class InvitationActionView(StaffView):
    permission_classes = [Needs(MANAGE)]

    @extend_schema(
        operation_id="staff_invitations_action",
        tags=TAGS,
        request=None,
        responses={200: s.InvitationSerializer},
    )
    def post(self, request: Request, invitation_id: Any, action: str) -> Response:
        invitation = (
            Invitation.objects.filter(
                pk=invitation_id, facility_id=self.principal().active_facility_id
            )
            .select_related("facility", "invited_by")
            .first()
        )
        if invitation is None or action not in ("resend", "revoke"):
            raise Http404
        handler = staff.resend if action == "resend" else staff.revoke
        return Response(invitation_data(handler(invitation, actor=request.user, request=request)))


class ClinicianProfileView(SetupAPIView):
    permission_classes = [IsStaffAuthenticated]

    def user_id(self) -> Any:
        return self.request.user.pk

    @extend_schema(
        operation_id="staff_clinician_profile_retrieve",
        tags=TAGS,
        responses={200: s.ClinicianProfileSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = ClinicianProfile.objects.filter(user_id=self.user_id()).first()
        if profile is None:
            raise Http404
        return Response(s.ClinicianProfileSerializer(profile).data)

    @extend_schema(
        operation_id="staff_clinician_profile_update",
        tags=TAGS,
        request=s.ClinicianProfileSerializer,
        responses={200: s.ClinicianProfileSerializer, 409: err("licence already registered")},
    )
    def patch(self, request: Request) -> Response:
        from django.db import IntegrityError, transaction

        from medilink.facilities.errors import FieldConflict

        body = s.ClinicianProfileSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        profile = ClinicianProfile.objects.filter(user_id=self.user_id()).first()
        changed_licence = profile is None or (profile.council, profile.licence_number) != (
            data["council"],
            data["licence_number"],
        )
        try:
            with transaction.atomic():
                profile, _created = ClinicianProfile.objects.update_or_create(
                    user_id=self.user_id(), defaults=data
                )
        except IntegrityError:
            raise FieldConflict(
                "licence_number", "This licence number is already registered."
            ) from None
        if changed_licence:  # attestations are for the old number: re-attest
            for membership in FacilityMembership.objects.filter(
                user_id=self.user_id(), licence_attested_at__isnull=False
            ):
                with rls_context(facility_id=membership.facility_id, user_id=self.user_id()):
                    FacilityMembership.objects.filter(pk=membership.pk).update(
                        licence_attested_at=None, licence_attested_by=None
                    )
        record(
            "staff.clinician_profile.updated",
            request=request,
            object_type="user",
            object_id=request.user.pk,
        )
        return Response(s.ClinicianProfileSerializer(profile).data)


# ---- invitation acceptance (before login) -------------------------------------------------------


class _InvitationAuthView(SetupAPIView):
    authentication_classes = [StaffSessionAuthentication]
    permission_classes = [PublicEndpoint]
    throttle_classes = [BurstRateThrottle, IPScopedRateThrottle]
    throttle_scope = "auth"


class InvitationLookupView(_InvitationAuthView):
    @extend_schema(
        operation_id="staff_auth_invitation_lookup",
        tags=["staff-auth"],
        request=s.TokenSerializer,
        responses={200: s.InvitationLookupSerializer, 400: err("invalid or expired (generic)")},
    )
    def post(self, request: Request) -> Response:
        body = s.TokenSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        return Response(
            s.InvitationLookupSerializer(staff.lookup(body.validated_data["token"])).data
        )


class InvitationAcceptView(_InvitationAuthView):
    @staticmethod
    def signed_in_principal(request: Request) -> Any:
        return get_principal(request)

    @extend_schema(
        operation_id="staff_auth_invitation_accept",
        tags=["staff-auth"],
        request=s.AcceptNewSerializer,
        responses={
            200: LoginResultSerializer,
            400: err("invalid token or password"),
            403: err("other account signed in"),
        },
    )
    def post(self, request: Request) -> Response:
        body = s.AcceptNewSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        token = data["token"]
        principal = get_principal(request)
        found = staff.find(token)
        if found is None:
            raise exceptions.ValidationError({"token": [str(staff.INVALID)]})
        signed_in = (
            principal is not None and principal.is_authenticated and principal.audience == "staff"
        )
        if signed_in:  # an authenticated staff session: add the membership to this account
            staff.accept_existing(token, user=request.user, request=request)
            return Response(
                LoginResultSerializer(
                    {
                        "status": "authenticated",
                        "user": staff_me_data(self.signed_in_principal(request), request.session),
                    }
                ).data
            )
        existing = User.objects.filter(email__iexact=found["email"]).first()
        if existing is None:
            if not data.get("full_name") or not data.get("password"):
                raise exceptions.ValidationError(
                    {"password": ["Choose a password."], "full_name": ["Give your names."]}
                )
            user = staff.accept_new_account(
                token, full_name=data["full_name"], password=data["password"], request=request
            )
        else:
            user = authenticate(
                request._request, email=existing.email, password=data.get("password") or ""
            )
            if user is None:
                raise exceptions.ValidationError({"password": ["That password isn't right."]})
            staff.accept_existing(token, user=user, request=request)
        from medilink.accounts.views import dev_skip_staff_mfa

        if dev_skip_staff_mfa():
            principal = complete_staff_login(request, user, mfa_method="dev_skip")
            return Response(
                LoginResultSerializer(
                    {"status": "authenticated", "user": staff_me_data(principal, request.session)}
                ).data
            )
        stage = (
            PrincipalState.MFA_REQUIRED
            if mfa.has_confirmed_mfa(user)
            else PrincipalState.MFA_SETUP_REQUIRED
        )
        start_pending_mfa(request, user, stage)
        return Response(LoginResultSerializer({"status": str(stage), "user": None}).data)


class PlatformMfaResetView(SetupAPIView):
    permission_classes = [IsPlatformAdmin, RecentAuthRequired()]

    @extend_schema(
        operation_id="platform_memberships_mfa_reset",
        tags=["platform-staff"],
        request=None,
        responses={204: None, 422: err("not a facility admin")},
    )
    def post(self, request: Request, membership_id: Any) -> Response:
        from medilink.core.exceptions import BusinessRuleViolation
        from medilink.tenancy.models import Facility, RoleCode

        # Platform admins have no facility context: find the membership one facility at a time.
        for facility_id in Facility.objects.values_list("pk", flat=True):
            with rls_context(facility_id=facility_id):
                membership = (
                    FacilityMembership.objects.filter(pk=membership_id)
                    .select_related("user")
                    .first()
                )
                if membership is None:
                    continue
                if not membership.roles.filter(code=RoleCode.FACILITY_ADMIN).exists():
                    raise BusinessRuleViolation("Platform admins reset facility admins only.")
                staff.reset_mfa(
                    membership.user, actor=request.user, facility_id=facility_id, request=request
                )
                return Response(status=status.HTTP_204_NO_CONTENT)
        raise Http404
