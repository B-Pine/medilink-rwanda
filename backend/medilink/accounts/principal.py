"""The principal: who is calling, in which audience and state, with which active facility.

Resolved once per request (TenantContextMiddleware) and per WebSocket connection, from the
audience session. Resolution also sets the RLS context (app.user_id, app.facility_id), so it
must run inside a transaction.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from functools import cached_property
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any
from uuid import UUID

from django.contrib import auth
from django.contrib.sessions.backends.base import SessionBase
from django.http import HttpRequest

from medilink.accounts.sessions import (
    ACTIVE_FACILITY_KEY,
    MFA_AT_KEY,
    PENDING_KEY,
)
from medilink.tenancy.context import set_db_context
from medilink.tenancy.services import (
    active_membership,
    has_active_membership,
    membership_permissions,
    membership_roles,
)

if TYPE_CHECKING:
    from medilink.accounts.models import User
    from medilink.tenancy.models import FacilityMembership


class PrincipalState(enum.StrEnum):
    ANONYMOUS = "anonymous"
    MFA_REQUIRED = "mfa_required"
    MFA_SETUP_REQUIRED = "mfa_setup_required"
    AUTHENTICATED = "authenticated"


@dataclass
class Principal:
    audience: str | None
    state: PrincipalState = PrincipalState.ANONYMOUS
    user: User | None = None  # the authenticated user, or the pending user during MFA
    membership: FacilityMembership | None = field(default=None, repr=False)

    @classmethod
    def anonymous(cls, audience: str | None) -> Principal:
        return cls(audience=audience)

    @property
    def is_authenticated(self) -> bool:
        return self.state == PrincipalState.AUTHENTICATED and self.user is not None

    @property
    def is_pending(self) -> bool:
        return self.state in (PrincipalState.MFA_REQUIRED, PrincipalState.MFA_SETUP_REQUIRED)

    @property
    def active_facility_id(self) -> UUID | None:
        return self.membership.facility_id if self.membership is not None else None

    @cached_property
    def permissions(self) -> frozenset[str]:
        return membership_permissions(self.membership)

    @cached_property
    def roles(self) -> list[str]:
        return membership_roles(self.membership)

    @property
    def actor_role(self) -> str:
        """Role label recorded in the audit log."""
        if self.user is None:
            return "anonymous"
        if self.audience == "patient":
            return "patient"
        labels = list(self.roles)
        if self.user.is_platform_admin:
            labels.insert(0, "platform_admin")
        return ",".join(labels) if labels else "staff"


def is_staff_member(user: Any) -> bool:
    """Staff = platform admin or an active facility membership (needs the RLS user context)."""
    return bool(user is not None and (user.is_platform_admin or has_active_membership(user)))


def get_session_user(session: SessionBase) -> User | None:
    """The user stored in the session, if the session auth hash still matches (password changes
    invalidate sessions) and the account is active."""
    user = auth.get_user(SimpleNamespace(session=session))  # type: ignore[arg-type]
    if not getattr(user, "is_authenticated", False) or not getattr(user, "is_active", False):
        return None
    return user  # type: ignore[return-value]


def _resolve_staff(session: SessionBase) -> Principal:
    from medilink.accounts.models import User

    pending = session.get(PENDING_KEY)
    if pending:
        user = User.objects.filter(pk=pending.get("user_id"), is_active=True).first()
        stage = pending.get("stage")
        if user is None or stage not in (
            PrincipalState.MFA_REQUIRED,
            PrincipalState.MFA_SETUP_REQUIRED,
        ):
            session.flush()
            set_db_context()
            return Principal.anonymous("staff")
        set_db_context(user_id=user.pk)
        return Principal(audience="staff", state=PrincipalState(stage), user=user)

    user = get_session_user(session)
    if user is None or not session.get(MFA_AT_KEY):
        set_db_context()
        return Principal.anonymous("staff")
    set_db_context(user_id=user.pk)
    if not is_staff_member(user):
        set_db_context()
        return Principal.anonymous("staff")

    membership = None
    facility_id = session.get(ACTIVE_FACILITY_KEY)
    if facility_id:
        membership = active_membership(user, facility_id)
        if membership is None:
            session.pop(ACTIVE_FACILITY_KEY, None)  # membership ended: drop the facility context
    set_db_context(user_id=user.pk, facility_id=membership.facility_id if membership else None)
    return Principal(
        audience="staff", state=PrincipalState.AUTHENTICATED, user=user, membership=membership
    )


def _resolve_patient(session: SessionBase) -> Principal:
    user = get_session_user(session)
    if user is None:
        set_db_context()
        return Principal.anonymous("patient")
    set_db_context(user_id=user.pk)
    return Principal(audience="patient", state=PrincipalState.AUTHENTICATED, user=user)


def resolve_principal(session: SessionBase, audience: str | None) -> Principal:
    """Resolve the principal for an audience session and set the RLS context accordingly."""
    if audience == "staff":
        return _resolve_staff(session)
    if audience == "patient":
        return _resolve_patient(session)
    set_db_context()
    return Principal.anonymous(audience)


def resolve_request_principal(request: HttpRequest) -> Principal:
    audience = getattr(request, "session_audience", None)
    return resolve_principal(request.session, audience.name if audience else None)
