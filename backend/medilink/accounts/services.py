"""Authentication flows shared by the views: session state transitions and response payloads."""

from __future__ import annotations

import time
from typing import Any

from django.contrib import auth
from django.http import HttpRequest

from medilink.accounts.mfa import has_confirmed_mfa
from medilink.accounts.models import User, UserSession
from medilink.accounts.principal import Principal, PrincipalState, resolve_principal
from medilink.accounts.sessions import (
    ACTIVE_FACILITY_KEY,
    AUTH_AT_KEY,
    LAST_SEEN_KEY,
    MFA_AT_KEY,
    MFA_METHOD_KEY,
    PENDING_KEY,
)
from medilink.core.realtime import close_sockets
from medilink.patients.services import active_links
from medilink.tenancy.services import active_memberships, membership_roles

BACKEND = "medilink.accounts.backends.EmailBackend"


def _django_request(request: Any) -> HttpRequest:
    return getattr(request, "_request", request)  # type: ignore[no-any-return]


def start_pending_mfa(request: Any, user: User, stage: PrincipalState) -> Principal:
    """Password verified for a staff account: new session (rotation) in a pending-MFA state.
    The session is NOT authenticated until the second factor succeeds (B5)."""
    django_request = _django_request(request)
    django_request.session.flush()  # drops any previous session and forces a new key
    django_request.session[PENDING_KEY] = {
        "user_id": str(user.pk),
        "stage": str(stage),
        "at": int(time.time()),
    }
    principal = resolve_principal(django_request.session, "staff")
    django_request.principal = principal  # type: ignore[attr-defined]
    return principal


def complete_staff_login(request: Any, user: User, mfa_method: str) -> Principal:
    """Second factor verified: log in (rotates the session and the CSRF token)."""
    django_request = _django_request(request)
    auth.login(django_request, user, backend=BACKEND)
    session = django_request.session
    now = int(time.time())
    session.pop(PENDING_KEY, None)
    session[AUTH_AT_KEY] = now
    session[LAST_SEEN_KEY] = now
    session[MFA_AT_KEY] = now
    session[MFA_METHOD_KEY] = mfa_method
    principal = resolve_principal(session, "staff")  # sets the RLS user context
    memberships = active_memberships(user)
    if len(memberships) == 1:  # single facility: select it straight away
        session[ACTIVE_FACILITY_KEY] = str(memberships[0].facility_id)
        principal = resolve_principal(session, "staff")
    django_request.principal = principal  # type: ignore[attr-defined]
    return principal


def complete_patient_login(request: Any, user: User) -> Principal:
    django_request = _django_request(request)
    auth.login(django_request, user, backend=BACKEND)
    now = int(time.time())
    django_request.session[AUTH_AT_KEY] = now
    django_request.session[LAST_SEEN_KEY] = now
    principal = resolve_principal(django_request.session, "patient")
    django_request.principal = principal  # type: ignore[attr-defined]
    return principal


def switch_active_facility(request: Any, facility_id: Any) -> Principal:
    django_request = _django_request(request)
    django_request.session.cycle_key()  # rotation on facility switch (B8)
    django_request.session[ACTIVE_FACILITY_KEY] = str(facility_id)
    principal = resolve_principal(django_request.session, "staff")
    django_request.principal = principal  # type: ignore[attr-defined]
    return principal


def logout(request: Any) -> None:
    django_request = _django_request(request)
    session_key = django_request.session.session_key
    auth.logout(django_request)
    if session_key:
        close_sockets(session_key=session_key)


def revoke_all_sessions(user: User) -> int:
    """Delete every server-side session of the user (all audiences) and close their sockets."""
    keys = list(UserSession.objects.filter(user=user).values_list("session_key", flat=True))
    UserSession.objects.filter(user=user).delete()
    close_sockets(user_id=user.pk)
    return len(keys)


# --- payloads --------------------------------------------------------------------------------


def staff_me_data(principal: Principal) -> dict[str, Any]:
    user = principal.user
    if user is None:
        raise ValueError("staff_me_data needs an authenticated principal")
    memberships = active_memberships(user)
    return {
        "id": user.pk,
        "email": user.email,
        "full_name": user.full_name,
        "preferred_language": user.preferred_language,
        "is_platform_admin": user.is_platform_admin,
        "mfa_enabled": has_confirmed_mfa(user),
        "memberships": [
            {
                "facility": {
                    "id": m.facility.pk,
                    "name": m.facility.name,
                    "slug": m.facility.slug,
                    "facility_type": m.facility.facility_type,
                },
                "roles": membership_roles(m),
            }
            for m in memberships
        ],
        "active_facility_id": principal.active_facility_id,
        "permissions": sorted(principal.permissions),
    }


def patient_me_data(user: User) -> dict[str, Any]:
    return {
        "id": user.pk,
        "email": user.email,
        "full_name": user.full_name,
        "preferred_language": user.preferred_language,
        "email_verified": user.email_verified_at is not None,
        "profiles": [
            {
                "patient_id": link.patient_id,
                "display_name": link.patient.full_name,
                "relationship": link.relationship,
            }
            for link in active_links(user)
        ],
    }
