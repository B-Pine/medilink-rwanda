"""Sprint 0 authentication endpoints (contract §2).

Audiences:  /api/v1/staff/auth/*   staff session cookie
            /api/v1/patient/auth/* patient session cookie
            /api/v1/auth/*         audience-neutral (password reset)
"""

from __future__ import annotations

import logging
from uuid import UUID

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.tokens import default_token_generator
from django.db import IntegrityError, transaction
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import exceptions, serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from medilink.accounts import mfa
from medilink.accounts.authentication import (
    PatientSessionAuthentication,
    StaffSessionAuthentication,
)
from medilink.accounts.lockout import login_policy, mfa_policy, reset_email_allowed
from medilink.accounts.models import User
from medilink.accounts.principal import Principal, PrincipalState, is_staff_member
from medilink.accounts.serializers import (
    ActiveFacilitySerializer,
    DetailSerializer,
    LoginResultSerializer,
    MfaCodeSerializer,
    MfaConfirmResultSerializer,
    MfaSetupSerializer,
    MfaVerifySerializer,
    PasswordResetConfirmSerializer,
    PasswordResetSerializer,
    PatientLoginSerializer,
    PatientMeSerializer,
    PatientRegisterSerializer,
    StaffLoginSerializer,
    StaffMeSerializer,
    run_password_validators,
)
from medilink.accounts.services import (
    complete_patient_login,
    complete_staff_login,
    logout,
    patient_me_data,
    revoke_all_sessions,
    staff_me_data,
    start_pending_mfa,
    switch_active_facility,
)
from medilink.accounts.tasks import send_password_changed_email, send_password_reset_email
from medilink.audit import actions
from medilink.audit.services import record
from medilink.authz.permissions import (
    IsPatientAuthenticated,
    IsStaffAuthenticated,
    IsStaffMfaSetupPending,
    IsStaffMfaVerifyPending,
    PublicEndpoint,
    get_principal,
)
from medilink.core.exceptions import RateLimited, error_response
from medilink.core.serializers import ErrorSerializer
from medilink.core.throttling import BurstRateThrottle, IPScopedRateThrottle
from medilink.patients.services import has_patient_profile, register_patient
from medilink.tenancy.context import set_user_context
from medilink.tenancy.services import active_membership

logger = logging.getLogger(__name__)

INVALID_CREDENTIALS = _("Email or password is incorrect.")
INVALID_CODE = _("That code didn't work. Check your authenticator app and try again.")
INVALID_RECOVERY_CODE = _("That recovery code didn't work.")
INVALID_RESET_LINK = _("This link is invalid or has expired. Ask for a new link.")
RESET_ACCEPTED = _("If an account exists for this email, we sent a link to reset the password.")

ERR = ErrorSerializer


def _err(description: str) -> OpenApiResponse:
    return OpenApiResponse(response=ERR, description=description)


class _AuthView(APIView):
    throttle_classes = [BurstRateThrottle, IPScopedRateThrottle]


def _principal(request: Request) -> Principal:
    principal = get_principal(request)
    if principal is None:  # TenantContextMiddleware sets it for every API request
        raise exceptions.NotAuthenticated()
    return principal


def _principal_user(request: Request) -> User:
    user = _principal(request).user
    if user is None:
        raise exceptions.NotAuthenticated()
    return user


def _check_login_lockout(email: str) -> None:
    wait = login_policy().retry_after(email)
    if wait:
        logger.warning("Login attempt blocked by account throttling (retry in %ss)", wait)
        raise RateLimited(wait=wait)


def _login_failure(request: Request, email: str, audience: str, reason: str) -> Response:
    login_policy().register_failure(email)
    actor = User.objects.filter(email=email).only("pk").first()
    record(
        actions.LOGIN_FAILURE,
        request=request,
        actor=actor,
        actor_role="",
        metadata={"audience": audience, "reason": reason},
    )
    return error_response(401, "not_authenticated", INVALID_CREDENTIALS)


# --------------------------------------------------------------------------------------------
# Staff
# --------------------------------------------------------------------------------------------


class StaffLoginView(_AuthView):
    """Step 1 of staff sign-in. Never returns an authenticated session: MFA is mandatory."""

    authentication_classes = [StaffSessionAuthentication]
    permission_classes = [PublicEndpoint]
    throttle_scope = "auth"

    @extend_schema(
        operation_id="staff_auth_login",
        tags=["staff-auth"],
        request=StaffLoginSerializer,
        responses={
            200: LoginResultSerializer,
            400: _err("Invalid input"),
            401: _err("not_authenticated (generic: wrong email/password or not a staff account)"),
            429: _err("rate_limited, with Retry-After"),
        },
        summary="Staff login (password step); rotates the session",
    )
    def post(self, request: Request) -> Response:
        serializer = StaffLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        _check_login_lockout(email)

        user = authenticate(
            request._request, email=email, password=serializer.validated_data["password"]
        )
        if user is None:
            return _login_failure(request, email, "staff", "invalid_credentials")
        set_user_context(user.pk)
        if not is_staff_member(user):
            return _login_failure(request, email, "staff", "not_staff")

        login_policy().reset(email)
        if dev_skip_staff_mfa():
            # Local development only (DEBUG + DEV_SKIP_STAFF_MFA): no second factor.
            principal = complete_staff_login(request, user, mfa_method="dev_skip")
            record(
                actions.LOGIN_SUCCESS,
                request=request,
                metadata={"audience": "staff", "mfa_method": "dev_skip"},
            )
            return Response(
                LoginResultSerializer(
                    {"status": "authenticated", "user": staff_me_data(principal)}
                ).data
            )
        stage = (
            PrincipalState.MFA_REQUIRED
            if mfa.has_confirmed_mfa(user)
            else PrincipalState.MFA_SETUP_REQUIRED
        )
        start_pending_mfa(request, user, stage)
        return Response(LoginResultSerializer({"status": str(stage), "user": None}).data)


def dev_skip_staff_mfa() -> bool:
    """True only in DEBUG with DEV_SKIP_STAFF_MFA on (never in staging or production)."""
    return bool(settings.DEBUG and getattr(settings, "DEV_SKIP_STAFF_MFA", False))


class StaffMfaSetupView(_AuthView):
    authentication_classes = [StaffSessionAuthentication]
    permission_classes = [IsStaffMfaSetupPending]
    throttle_scope = "mfa"

    @extend_schema(
        operation_id="staff_auth_mfa_setup",
        tags=["staff-auth"],
        request=None,
        responses={200: MfaSetupSerializer, 401: _err("Not in the mfa_setup_required state")},
        summary="Start TOTP enrolment (only in the mfa_setup_required state)",
    )
    def post(self, request: Request) -> Response:
        user = _principal_user(request)
        device, secret = mfa.start_totp_enrolment(user)
        return Response(
            MfaSetupSerializer({"otpauth_uri": device.config_url, "secret": secret}).data
        )


class StaffMfaConfirmView(_AuthView):
    authentication_classes = [StaffSessionAuthentication]
    permission_classes = [IsStaffMfaSetupPending]
    throttle_scope = "mfa"

    @extend_schema(
        operation_id="staff_auth_mfa_confirm",
        tags=["staff-auth"],
        request=MfaCodeSerializer,
        responses={
            200: MfaConfirmResultSerializer,
            400: _err("validation_error: wrong code"),
            401: _err("Not in the mfa_setup_required state"),
            429: _err("rate_limited"),
        },
        summary="Confirm TOTP enrolment; returns 10 recovery codes once and signs in",
    )
    def post(self, request: Request) -> Response:
        serializer = MfaCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = _principal_user(request)
        policy = mfa_policy()
        wait = policy.retry_after(str(user.pk))
        if wait:
            raise RateLimited(wait=wait)
        if not mfa.confirm_totp_enrolment(user, serializer.validated_data["code"]):
            policy.register_failure(str(user.pk))
            record(
                actions.MFA_FAILURE,
                request=request,
                actor=user,
                actor_role="",
                metadata={"stage": "enrol", "method": "totp"},
            )
            return error_response(400, "validation_error", fields={"code": [str(INVALID_CODE)]})

        policy.reset(str(user.pk))
        codes = mfa.generate_recovery_codes(user)
        principal = complete_staff_login(request, user, mfa_method="totp")
        record(actions.MFA_ENROLLED, request=request, metadata={"method": "totp"})
        record(
            actions.LOGIN_SUCCESS,
            request=request,
            metadata={"audience": "staff", "mfa_method": "totp"},
        )
        payload = {
            "status": "authenticated",
            "user": staff_me_data(principal),
            "recovery_codes": codes,
        }
        return Response(MfaConfirmResultSerializer(payload).data)


class StaffMfaVerifyView(_AuthView):
    authentication_classes = [StaffSessionAuthentication]
    permission_classes = [IsStaffMfaVerifyPending]
    throttle_scope = "mfa"

    @extend_schema(
        operation_id="staff_auth_mfa_verify",
        tags=["staff-auth"],
        request=MfaVerifySerializer,
        responses={
            200: LoginResultSerializer,
            400: _err("validation_error: wrong code / recovery code"),
            401: _err("Not in the mfa_required state"),
            429: _err("rate_limited, with Retry-After"),
        },
        summary="Verify the second factor (TOTP code or recovery code); rotates the session",
    )
    def post(self, request: Request) -> Response:
        serializer = MfaVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = _principal_user(request)
        policy = mfa_policy()
        wait = policy.retry_after(str(user.pk))
        if wait:
            raise RateLimited(wait=wait)

        code = serializer.validated_data.get("code")
        if code:
            method, field, ok = "totp", "code", mfa.verify_totp(user, code)
        else:
            recovery_code = serializer.validated_data["recovery_code"]
            method, field, ok = (
                "recovery_code",
                "recovery_code",
                mfa.use_recovery_code(user, recovery_code),
            )
        if not ok:
            policy.register_failure(str(user.pk))
            record(
                actions.MFA_FAILURE,
                request=request,
                actor=user,
                actor_role="",
                metadata={"stage": "verify", "method": method},
            )
            message = INVALID_CODE if method == "totp" else INVALID_RECOVERY_CODE
            return error_response(400, "validation_error", fields={field: [str(message)]})

        policy.reset(str(user.pk))
        principal = complete_staff_login(request, user, mfa_method=method)
        record(actions.MFA_SUCCESS, request=request, metadata={"method": method})
        record(
            actions.LOGIN_SUCCESS,
            request=request,
            metadata={"audience": "staff", "mfa_method": method},
        )
        return Response(
            LoginResultSerializer(
                {"status": "authenticated", "user": staff_me_data(principal)}
            ).data
        )


class StaffLogoutView(_AuthView):
    authentication_classes = [StaffSessionAuthentication]
    permission_classes = [PublicEndpoint]

    @extend_schema(
        operation_id="staff_auth_logout",
        tags=["staff-auth"],
        request=None,
        responses={
            204: OpenApiResponse(description="Staff session deleted (patient session untouched)")
        },
        summary="Staff logout",
    )
    def post(self, request: Request) -> Response:
        principal = _principal(request)
        if principal.is_authenticated:
            record(actions.LOGOUT, request=request, metadata={"audience": "staff"})
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class StaffMeView(_AuthView):
    authentication_classes = [StaffSessionAuthentication]
    permission_classes = [IsStaffAuthenticated]

    @extend_schema(
        operation_id="staff_auth_me",
        tags=["staff-auth"],
        responses={200: StaffMeSerializer, 401: _err("not_authenticated or mfa_required")},
        summary="Current staff user, memberships and permissions for the active facility",
    )
    def get(self, request: Request) -> Response:
        return Response(StaffMeSerializer(staff_me_data(_principal(request))).data)


class StaffActiveFacilityView(_AuthView):
    authentication_classes = [StaffSessionAuthentication]
    permission_classes = [IsStaffAuthenticated]

    @extend_schema(
        operation_id="staff_auth_active_facility",
        tags=["staff-auth"],
        request=ActiveFacilitySerializer,
        responses={
            200: StaffMeSerializer,
            400: _err("Invalid input"),
            401: _err("not_authenticated or mfa_required"),
            404: _err("not_found: not an active member of this facility"),
        },
        summary="Switch the active facility; rotates the session; audit-logged",
    )
    def post(self, request: Request) -> Response:
        serializer = ActiveFacilitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        principal = _principal(request)
        facility_id = serializer.validated_data["facility_id"]
        if active_membership(principal.user, facility_id) is None:
            return error_response(404, "not_found")
        previous = principal.active_facility_id
        principal = switch_active_facility(request, facility_id)
        record(
            actions.FACILITY_SWITCHED,
            request=request,
            object_type="facility",
            object_id=facility_id,
            metadata={"from_facility_id": str(previous) if previous else None},
        )
        return Response(StaffMeSerializer(staff_me_data(principal)).data)


# --------------------------------------------------------------------------------------------
# Patient
# --------------------------------------------------------------------------------------------


class PatientRegisterView(_AuthView):
    authentication_classes = [PatientSessionAuthentication]
    permission_classes = [PublicEndpoint]
    throttle_scope = "register"

    @extend_schema(
        operation_id="patient_auth_register",
        tags=["patient-auth"],
        request=PatientRegisterSerializer,
        responses={
            201: PatientMeSerializer,
            400: _err("validation_error"),
            429: _err("rate_limited"),
        },
        summary="Patient sign-up (creates account, self profile and consents) and sign-in",
    )
    def post(self, request: Request) -> Response:
        serializer = PatientRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            registration = register_patient(**data)  # atomic (savepoint)
        except IntegrityError as exc:  # same email registered concurrently
            raise serializers.ValidationError(
                {"email": [PatientRegisterSerializer.default_error_messages["email_taken"]]}
            ) from exc
        complete_patient_login(request, registration.user)
        record(
            actions.PATIENT_REGISTERED,
            request=request,
            object_type="patient",
            object_id=registration.patient.pk,
            metadata={
                "terms_version": data["accepted_terms_version"],
                "privacy_version": data["accepted_privacy_version"],
                "research_consent": data["research_consent"],
            },
        )
        return Response(PatientMeSerializer(patient_me_data(registration.user)).data, status=201)


class PatientLoginView(_AuthView):
    authentication_classes = [PatientSessionAuthentication]
    permission_classes = [PublicEndpoint]
    throttle_scope = "auth"

    @extend_schema(
        operation_id="patient_auth_login",
        tags=["patient-auth"],
        request=PatientLoginSerializer,
        responses={
            200: PatientMeSerializer,
            400: _err("Invalid input"),
            401: _err("not_authenticated (generic)"),
            429: _err("rate_limited, with Retry-After"),
        },
        summary="Patient login; rotates the session",
    )
    def post(self, request: Request) -> Response:
        serializer = PatientLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        _check_login_lockout(email)
        user = authenticate(
            request._request, email=email, password=serializer.validated_data["password"]
        )
        if user is None:
            return _login_failure(request, email, "patient", "invalid_credentials")
        set_user_context(user.pk)
        if not has_patient_profile(user):
            return _login_failure(request, email, "patient", "no_patient_profile")
        login_policy().reset(email)
        complete_patient_login(request, user)
        record(actions.LOGIN_SUCCESS, request=request, metadata={"audience": "patient"})
        return Response(PatientMeSerializer(patient_me_data(user)).data)


class PatientLogoutView(_AuthView):
    authentication_classes = [PatientSessionAuthentication]
    permission_classes = [PublicEndpoint]

    @extend_schema(
        operation_id="patient_auth_logout",
        tags=["patient-auth"],
        request=None,
        responses={
            204: OpenApiResponse(description="Patient session deleted (staff session untouched)")
        },
        summary="Patient logout",
    )
    def post(self, request: Request) -> Response:
        if _principal(request).is_authenticated:
            record(actions.LOGOUT, request=request, metadata={"audience": "patient"})
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PatientMeView(_AuthView):
    authentication_classes = [PatientSessionAuthentication]
    permission_classes = [IsPatientAuthenticated]

    @extend_schema(
        operation_id="patient_auth_me",
        tags=["patient-auth"],
        responses={200: PatientMeSerializer, 401: _err("not_authenticated")},
        summary="Current patient account and the profiles it manages",
    )
    def get(self, request: Request) -> Response:
        return Response(PatientMeSerializer(patient_me_data(_principal_user(request))).data)


# --------------------------------------------------------------------------------------------
# Audience-neutral: password reset
# --------------------------------------------------------------------------------------------


class PasswordResetView(_AuthView):
    authentication_classes: list[type] = []
    permission_classes = [PublicEndpoint]
    throttle_scope = "password_reset"

    @extend_schema(
        operation_id="auth_password_reset",
        tags=["account"],
        auth=[],
        request=PasswordResetSerializer,
        responses={
            202: DetailSerializer,
            400: _err("Invalid input"),
            429: _err("rate_limited (per IP)"),
        },
        summary="Request a password reset email (always 202, even for unknown emails)",
    )
    def post(self, request: Request) -> Response:
        serializer = PasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        # The per-email limit is silent (still 202), so it reveals nothing about the account.
        if reset_email_allowed(email):
            user = User.objects.filter(email=email, is_active=True).first()
            matched = bool(user and user.has_usable_password())
            record(
                actions.PASSWORD_RESET_REQUESTED,
                request=request,
                actor=user if matched else None,
                actor_role="",
                object_type="user" if matched else "",
                object_id=user.pk if matched and user else "",
                metadata={"matched": matched},
            )
            if matched and user is not None:
                user_id = str(user.pk)
                transaction.on_commit(lambda: send_password_reset_email.delay(user_id))
        return Response(DetailSerializer({"detail": str(RESET_ACCEPTED)}).data, status=202)


class PasswordResetConfirmView(_AuthView):
    authentication_classes: list[type] = []
    permission_classes = [PublicEndpoint]
    throttle_scope = "password_reset"

    @extend_schema(
        operation_id="auth_password_reset_confirm",
        tags=["account"],
        auth=[],
        request=PasswordResetConfirmSerializer,
        responses={
            204: OpenApiResponse(description="Password changed; all sessions of the user revoked"),
            400: _err("validation_error: invalid/expired link or password rejected"),
            429: _err("rate_limited"),
        },
        summary="Set a new password with the emailed link; revokes all sessions",
    )
    def post(self, request: Request) -> Response:
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = _user_from_uid(data["uid"])
        if user is None or not default_token_generator.check_token(user, data["token"]):
            raise serializers.ValidationError({"token": [INVALID_RESET_LINK]})
        set_user_context(user.pk)
        try:
            run_password_validators(data["new_password"], user)
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({"new_password": exc.detail}) from exc

        user.set_password(data["new_password"])
        user.save(update_fields=["password", "updated_at"])
        revoked = revoke_all_sessions(user)
        login_policy().reset(user.email)
        record(
            actions.PASSWORD_RESET_COMPLETED,
            request=request,
            actor=user,
            actor_role="",
            object_type="user",
            object_id=user.pk,
            metadata={"sessions_revoked": revoked},
        )
        user_id = str(user.pk)
        transaction.on_commit(lambda: send_password_changed_email.delay(user_id))
        return Response(status=status.HTTP_204_NO_CONTENT)


def _user_from_uid(uid: str) -> User | None:
    try:
        user_id = UUID(force_str(urlsafe_base64_decode(uid)))
    except (ValueError, TypeError, OverflowError, UnicodeDecodeError):
        return None
    return User.objects.filter(pk=user_id, is_active=True).first()
