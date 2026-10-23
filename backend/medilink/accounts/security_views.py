"""Staff lock, unlock, PIN and step-up endpoints (contract §3.3, FR-SEC-06).

GET/POST /staff/auth/lock/     lock state / lock now (works while locked)
POST     /staff/auth/unlock/   {pin} or {password}
PUT      /staff/auth/pin/      set or change the PIN (step-up)
DELETE   /staff/auth/pin/      remove the PIN
POST     /staff/auth/step-up/  {method: "password_totp", password, code}
"""

from __future__ import annotations

import logging
import time
from datetime import UTC, datetime
from typing import Any

from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import exceptions, serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from medilink.accounts import lock as lock_service
from medilink.accounts.authentication import StaffSessionAuthentication
from medilink.accounts.lockout import mfa_policy
from medilink.accounts.mfa import verify_totp
from medilink.accounts.models import User
from medilink.accounts.principal import Principal, resolve_principal
from medilink.accounts.serializers import StaffMeSerializer
from medilink.accounts.services import logout, staff_me_data
from medilink.audit.services import record
from medilink.authz.permissions import IsStaffAuthenticated, IsStaffSession, get_principal
from medilink.authz.stepup import STEP_UP_AT_KEY, RecentAuthRequired, recent_auth_until
from medilink.core.exceptions import BusinessRuleViolation, RateLimited, error_response
from medilink.core.serializers import ErrorSerializer
from medilink.core.throttling import BurstRateThrottle, IPScopedRateThrottle
from medilink.onboarding import notifications
from medilink.uploads.throttling import EnvRateThrottle

security_logger = logging.getLogger("medilink.security")

STEP_UP_FAILURES_KEY = "_ml_step_up_failures"
MAX_STEP_UP_FAILURES = 5

WRONG_PIN = _("That PIN is not correct.")
WRONG_PASSWORD = _("That password is not correct.")
PIN_UNAVAILABLE = _("PIN unlock isn't available. Use your password.")
STEP_UP_FAILED = _("We couldn't confirm it's you. Check your password and code.")
ONE_METHOD = _("Send either a PIN or a password.")


def _err(description: str) -> OpenApiResponse:
    return OpenApiResponse(response=ErrorSerializer, description=description)


class UnlockRateThrottle(EnvRateThrottle):
    """10 unlock attempts a minute per session."""

    scope = "unlock"
    env_var = "THROTTLE_RATE_UNLOCK"
    default_rate = "10/min"

    def get_ident_for(self, request: Any, view: Any) -> str | None:
        key = getattr(request._request.session, "session_key", None)
        return f"session:{key}" if key else self.get_ident(request)


class LockStateSerializer(serializers.Serializer):
    is_locked = serializers.BooleanField()
    locked_at = serializers.DateTimeField(allow_null=True)
    full_name = serializers.CharField()
    unlock_methods = serializers.ListField(
        child=serializers.ChoiceField(choices=["pin", "password"])
    )
    attempts_remaining = serializers.IntegerField()


class UnlockSerializer(serializers.Serializer):
    pin = serializers.CharField(required=False, max_length=6, trim_whitespace=False)
    password = serializers.CharField(required=False, max_length=4096, trim_whitespace=False)

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        if bool(data.get("pin")) == bool(data.get("password")):
            raise serializers.ValidationError({"pin": [str(ONE_METHOD)]})
        return data


class PinSerializer(serializers.Serializer):
    pin = serializers.CharField(max_length=6, trim_whitespace=False)

    def validate_pin(self, value: str) -> str:
        problem = lock_service.pin_problem(value)
        if problem:
            raise serializers.ValidationError(str(problem))
        return value


class StepUpSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=["password_totp"])
    password = serializers.CharField(max_length=4096, trim_whitespace=False)
    code = serializers.CharField(max_length=10)


class StepUpResultSerializer(serializers.Serializer):
    step_up_valid_until = serializers.DateTimeField()


def _principal(request: Request) -> Principal:
    principal = get_principal(request)
    if principal is None or principal.user is None:
        raise exceptions.NotAuthenticated()
    if principal.is_locked:
        lock_service.record_pending_idle_lock(request.session, principal.user, request=request)
    return principal


def _lock_state(request: Request, principal: Principal) -> dict[str, Any]:
    session = request.session
    user = principal.user
    assert user is not None  # noqa: S101 (checked by _principal)
    locked_at = session.get(lock_service.LOCKED_AT_KEY)
    return {
        "is_locked": bool(locked_at),
        "locked_at": datetime.fromtimestamp(int(locked_at), tz=UTC) if locked_at else None,
        "full_name": user.full_name,
        "unlock_methods": lock_service.unlock_methods(user, principal.active_facility_id),
        "attempts_remaining": lock_service.attempts_remaining(session),
    }


class LockView(APIView):
    authentication_classes = [StaffSessionAuthentication]
    permission_classes = [IsStaffSession]

    @extend_schema(
        operation_id="staff_auth_lock_state",
        tags=["staff-auth"],
        responses={200: LockStateSerializer, 401: _err("not_authenticated")},
        summary="Lock state of the current staff session",
    )
    def get(self, request: Request) -> Response:
        return Response(LockStateSerializer(_lock_state(request, _principal(request))).data)

    @extend_schema(
        operation_id="staff_auth_lock",
        tags=["staff-auth"],
        request=None,
        responses={204: OpenApiResponse(description="Locked"), 401: _err("not_authenticated")},
        summary="Lock the session now",
    )
    def post(self, request: Request) -> Response:
        principal = _principal(request)
        assert principal.user is not None  # noqa: S101
        lock_service.lock(request.session, principal.user, trigger="manual", request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class UnlockView(APIView):
    authentication_classes = [StaffSessionAuthentication]
    permission_classes = [IsStaffSession]
    throttle_classes = [BurstRateThrottle, UnlockRateThrottle]

    @extend_schema(
        operation_id="staff_auth_unlock",
        tags=["staff-auth"],
        request=UnlockSerializer,
        responses={
            200: StaffMeSerializer,
            400: _err("Wrong PIN or password (fields.pin / fields.password)"),
            401: _err("not_authenticated: the 5th failure ended the session"),
            422: _err("PIN not set, PIN unlock off or temporarily blocked"),
        },
        summary="Unlock an idle-locked session with a PIN or the password",
    )
    def post(self, request: Request) -> Response:
        body = UnlockSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        principal = _principal(request)
        user: User = principal.user  # type: ignore[assignment]
        session = request.session
        if not lock_service.is_locked(session):
            return Response(StaffMeSerializer(staff_me_data(principal, session)).data)
        pin = body.validated_data.get("pin")
        method = "pin" if pin else "password"
        if pin and "pin" not in lock_service.unlock_methods(user, principal.active_facility_id):
            raise BusinessRuleViolation(PIN_UNAVAILABLE)
        ok = (
            lock_service.check_pin(user, pin)
            if pin
            else user.check_password(body.validated_data["password"])
        )
        if not ok:
            return self._failure(request, user, method)
        lock_service.unlock(session)
        record("auth.session.unlocked", request=request, actor=user, metadata={"method": method})
        principal = resolve_principal(session, "staff")
        request._request.principal = principal  # type: ignore[attr-defined]
        return Response(StaffMeSerializer(staff_me_data(principal, session)).data)

    def _failure(self, request: Request, user: User, method: str) -> Response:
        session = request.session
        left = lock_service.register_failure(session)
        record(
            "auth.unlock.failure",
            request=request,
            actor=user,
            metadata={"method": method, "attempts_remaining": left},
        )
        security_logger.warning("Unlock failed", extra={"method": method, "attempts_left": left})
        if method == "pin" and lock_service.register_pin_failure(user):
            notifications.dispatch("security.unlock_exhausted", user_id=user.pk)
        if left == 0:
            record(
                "auth.unlock.exhausted", request=request, actor=user, metadata={"method": method}
            )
            security_logger.warning("Unlock attempts exhausted: session ended")
            logout(request)
            return error_response(status.HTTP_401_UNAUTHORIZED, "not_authenticated")
        field = "pin" if method == "pin" else "password"
        message = WRONG_PIN if method == "pin" else WRONG_PASSWORD
        return error_response(
            status.HTTP_400_BAD_REQUEST, "validation_error", fields={field: [str(message)]}
        )


class PinView(APIView):
    authentication_classes = [StaffSessionAuthentication]
    permission_classes = [IsStaffAuthenticated]  # PUT adds step-up (get_permissions)

    def get_permissions(self) -> list[Any]:
        if self.request.method == "PUT":
            return [IsStaffAuthenticated(), RecentAuthRequired()()]
        return [IsStaffAuthenticated()]

    @extend_schema(
        operation_id="staff_auth_pin_set",
        tags=["staff-auth"],
        request=PinSerializer,
        responses={
            204: OpenApiResponse(description="PIN set"),
            400: _err("Format or too simple"),
            403: _err("step_up_required"),
        },
        summary="Set or change the unlock PIN",
    )
    def put(self, request: Request) -> Response:
        body = PinSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        user: User = _principal(request).user  # type: ignore[assignment]
        lock_service.set_pin(user, body.validated_data["pin"])
        record("auth.pin.set", request=request, actor=user)
        notifications.dispatch("security.pin_changed", user_id=user.pk)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        operation_id="staff_auth_pin_remove",
        tags=["staff-auth"],
        request=None,
        responses={204: OpenApiResponse(description="PIN removed")},
        summary="Remove the unlock PIN",
    )
    def delete(self, request: Request) -> Response:
        user: User = _principal(request).user  # type: ignore[assignment]
        lock_service.remove_pin(user)
        record("auth.pin.removed", request=request, actor=user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class StepUpView(APIView):
    authentication_classes = [StaffSessionAuthentication]
    permission_classes = [IsStaffAuthenticated]
    throttle_classes = [BurstRateThrottle, IPScopedRateThrottle]
    throttle_scope = "mfa"

    @extend_schema(
        operation_id="staff_auth_step_up",
        tags=["staff-auth"],
        request=StepUpSerializer,
        responses={
            200: StepUpResultSerializer,
            400: _err("Generic failure"),
            401: _err("The 5th failure ended the session"),
            429: _err("rate_limited"),
        },
        summary="Confirm it's you (password and authenticator code) for sensitive actions",
    )
    def post(self, request: Request) -> Response:
        body = StepUpSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        user: User = _principal(request).user  # type: ignore[assignment]
        ident = str(user.pk)
        wait = mfa_policy().retry_after(ident)
        if wait:
            raise RateLimited(wait=wait)
        session = request.session
        if user.check_password(body.validated_data["password"]) and verify_totp(
            user, body.validated_data["code"]
        ):
            mfa_policy().reset(ident)
            session.pop(STEP_UP_FAILURES_KEY, None)
            session[STEP_UP_AT_KEY] = int(time.time())
            record("auth.step_up.success", request=request, actor=user)
            until = recent_auth_until(session)
            assert until is not None  # noqa: S101 (just set)
            return Response({"step_up_valid_until": datetime.fromtimestamp(until, tz=UTC)})
        mfa_policy().register_failure(ident)
        failures = int(session.get(STEP_UP_FAILURES_KEY, 0)) + 1
        session[STEP_UP_FAILURES_KEY] = failures
        record("auth.step_up.failure", request=request, actor=user, metadata={"failures": failures})
        security_logger.warning("Step-up failed", extra={"failures": failures})
        if failures >= MAX_STEP_UP_FAILURES:
            logout(request)
            return error_response(status.HTTP_401_UNAUTHORIZED, "not_authenticated")
        return error_response(status.HTTP_400_BAD_REQUEST, "bad_request", STEP_UP_FAILED)
