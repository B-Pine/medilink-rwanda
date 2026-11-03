"""Staff management and invitation endpoints (contract sprint-02 §3.5)."""

from __future__ import annotations

from typing import Any

from django.http import Http404
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import OpenApiParameter, PolymorphicProxySerializer, extend_schema
from rest_framework import exceptions, status
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.accounts import mfa
from medilink.accounts.authentication import StaffSessionAuthentication
from medilink.accounts.models import ClinicianProfile, User
from medilink.accounts.principal import PrincipalState
from medilink.accounts.serializers import LoginResultSerializer, StaffMeSerializer
from medilink.accounts.services import complete_staff_login, staff_me_data, start_pending_mfa
from medilink.audit.services import record
from medilink.authz.permissions import (
    IsStaffAuthenticated,
    PublicEndpoint,
    get_principal,
)
from medilink.authz.platform import PlatformAdmin
from medilink.authz.stepup import RecentAuthRequired
from medilink.core.idempotency import IDEMPOTENCY, idempotency_key
from medilink.core.throttling import BurstRateThrottle, IPScopedRateThrottle
from medilink.facilities import serializers as s
from medilink.facilities import staff
from medilink.facilities.errors import SetupAPIView
from medilink.facilities.throttling import InvitationRateThrottle
from medilink.facilities.views_base import PAGE, FacilityView, Member, Needs, err, paginated
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import FacilityMembership, Invitation, Role

TAGS = ["staff-team"]
MANAGE = "staff.manage"
SIGN_IN_FIRST = _("You already have an account: sign in with it, then accept the invitation.")


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
            "phone": m.user.phone,
            "roles": sorted(r.code for r in m.roles.all()),
            "service_points": [p.service_point_id for p in m.service_points.all()],
            "is_active": m.is_active,
            "mfa_enabled": mfa.has_confirmed_mfa(m.user),
            "last_login": m.user.last_login,
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
            *PAGE,
        ],
        responses={200: s.StaffMembershipPageSerializer},
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
        return paginated(
            self, request, rows.distinct().order_by("user__full_name", "pk"), membership_data
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
    elif i.expired_at or i.expires_at <= timezone.now():
        state = "expired"
    else:
        state = "pending"
    return {
        "id": i.pk,
        "email": i.email,
        "full_name": i.full_name,
        "phone": i.phone,
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
        parameters=PAGE,
        responses={200: s.InvitationPageSerializer},
    )
    def get(self, request: Request) -> Response:
        rows = Invitation.objects.filter(
            facility_id=self.principal().active_facility_id
        ).select_related("invited_by")
        return paginated(self, request, rows.order_by("-created_at", "pk"), invitation_data)

    @extend_schema(
        operation_id="staff_invitations_create",
        tags=TAGS,
        request=s.InvitationCreateSerializer,
        parameters=[IDEMPOTENCY],
        responses={
            201: s.InvitationSerializer,
            409: err("pending invitation or already a member"),
            422: err("facility deactivated"),
        },
    )
    def post(self, request: Request) -> Response:
        key = idempotency_key(request)
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
            idempotency_key=key,
            full_name=data.get("full_name", ""),
            phone=data.get("phone", ""),
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


class ClinicianPublicProfileView(SetupAPIView):
    """upgrade 05 §3: what patients read on the public doctor page; the licence stays private."""

    permission_classes = [IsStaffAuthenticated]

    def profile(self) -> ClinicianProfile:
        user_id: Any = self.request.user.pk
        profile = ClinicianProfile.objects.filter(user_id=user_id).first()
        if profile is None:
            raise Http404
        return profile

    @extend_schema(
        operation_id="staff_clinician_public_profile_retrieve",
        tags=TAGS,
        responses={200: s.ClinicianPublicProfileSerializer},
    )
    def get(self, request: Request) -> Response:
        return Response(s.ClinicianPublicProfileSerializer(self.profile()).data)

    @extend_schema(
        operation_id="staff_clinician_public_profile_update",
        tags=TAGS,
        request=s.ClinicianPublicProfileSerializer,
        responses={200: s.ClinicianPublicProfileSerializer},
    )
    def patch(self, request: Request) -> Response:
        profile = self.profile()
        body = s.ClinicianPublicProfileSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        profile.bio_i18n = {k: v.strip() for k, v in data["bio_i18n"].items() if v.strip()}
        profile.languages = sorted(set(data["languages"]))
        profile.is_public = data["is_public"]
        profile.save(update_fields=["bio_i18n", "languages", "is_public", "updated_at"])
        record(
            "staff.clinician_profile.public_updated",
            request=request,
            object_type="user",
            object_id=request.user.pk,
        )
        return Response(s.ClinicianPublicProfileSerializer(profile).data)


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
            200: PolymorphicProxySerializer(
                component_name="InvitationAcceptResult",
                serializers=[StaffMeSerializer, LoginResultSerializer],
                resource_type_field_name=None,
            ),
            400: err("invalid token or password"),
            401: err("the email has an account: sign in first, then accept with {token}"),
            403: err("other account signed in"),
        },
        description=(
            "Existing account: a signed-in staff session with the invited email sends `{token}` "
            "and gets `StaffMe` with the new membership. New account: `{token, full_name, "
            "password}` gets `LoginResult` (`mfa_setup_required`). Passwords are never checked "
            "here: existing accounts sign in through the login endpoint (lockout, MFA, audit)."
        ),
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
            return Response(staff_me_data(self.signed_in_principal(request), request.session))
        if User.objects.filter(email__iexact=found["email"]).exists():
            raise exceptions.NotAuthenticated(SIGN_IN_FIRST)
        full_name = data.get("full_name") or found["full_name"]  # the inviter's, if not typed
        if not full_name or not data.get("password"):
            raise exceptions.ValidationError(
                {"password": ["Choose a password."], "full_name": ["Give your names."]}
            )
        user = staff.accept_new_account(
            token, full_name=full_name, password=data["password"], request=request
        )
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
    permission_classes = [PlatformAdmin, RecentAuthRequired()]

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
