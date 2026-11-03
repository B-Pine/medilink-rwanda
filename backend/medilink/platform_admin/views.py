"""Super admin console endpoints (upgrade 2026-11-02): the command centre, the user directory and
account actions, and the security and access logs. PlatformAdmin on every view; account actions
need a recent step-up, a written reason, and are audited. Patients appear as accounts only."""

from __future__ import annotations

import hashlib
from datetime import timedelta
from typing import Any

from django.contrib.auth import get_user_model
from django.db.models import Max, Q, Sum
from django.http import Http404
from django.utils import timezone
from django_otp.plugins.otp_totp.models import TOTPDevice
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from medilink.accounts.models import RecoveryCode, UserSession
from medilink.accounts.services import revoke_all_sessions
from medilink.audit.models import AuditEntry
from medilink.audit.services import record
from medilink.authz.platform import PlatformAdmin
from medilink.authz.stepup import RecentAuthRequired
from medilink.core.exceptions import BusinessRuleViolation
from medilink.core.pagination import DefaultPagination
from medilink.facilities.models import PublicListing
from medilink.onboarding.serializers import overview_data
from medilink.platform_admin import serializers as s
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import Facility, FacilityMembership, FacilityStatus

TAG = ["platform-admin"]
STALE_AFTER = timedelta(minutes=30)
SECURITY_PREFIXES = ("auth.", "platform.user.", "staff.mfa.")
ACCESS_ACTIONS = Q(action__startswith="authz.break_glass") | Q(
    action__in=[
        "patients.record.viewed",
        "patients.access_reason.given",
        "clinical.access_reason.given",
    ]
)
FAILURE_WORDS = ("failure", "locked", "exhausted", "denied")

User = get_user_model()


# ---- helpers ------------------------------------------------------------------------------------


def _memberships() -> dict[Any, list[dict[str, Any]]]:
    """Every membership, read one facility at a time (memberships are row-level secured)."""
    out: dict[Any, list[dict[str, Any]]] = {}
    for facility in Facility.objects.only("pk", "name"):
        with rls_context(facility_id=facility.pk):
            for m in FacilityMembership.objects.filter(facility_id=facility.pk).prefetch_related(
                "roles"
            ):
                out.setdefault(m.user_id, []).append(
                    {
                        "facility_id": facility.pk,
                        "facility_name": facility.name,
                        "roles": sorted(r.code for r in m.roles.all()),
                        "is_active": m.is_active,
                    }
                )
    return out


def _mfa_users() -> set[Any]:
    return set(TOTPDevice.objects.filter(confirmed=True).values_list("user_id", flat=True))


def _kind(user: Any, memberships: dict[Any, list[dict[str, Any]]]) -> str:
    if user.is_platform_admin:
        return "platform"
    return "staff" if user.pk in memberships else "patient"


def _clinicians(user_ids: list[Any]) -> dict[Any, Any]:
    """The clinician profiles of these users (profession and licence for the list)."""
    from medilink.accounts.models import ClinicianProfile

    return {c.user_id: c for c in ClinicianProfile.objects.filter(user_id__in=user_ids)}


def _row(
    user: Any,
    memberships: dict[Any, list[dict[str, Any]]],
    mfa: set[Any],
    clinicians: dict[Any, Any] | None = None,
) -> dict[str, Any]:
    from medilink.facilities.clinician import licence_state

    clinician = (clinicians or {}).get(user.pk)
    return {
        "id": user.pk,
        "full_name": user.full_name,
        "email": user.email,
        "phone": user.phone,
        # staff who are clinicians: what the facility admins check
        "profession": clinician.profession if clinician else "",
        "licence_state": licence_state(clinician) if clinician else None,
        "kind": _kind(user, memberships),
        "is_active": user.is_active,
        "mfa_enabled": user.pk in mfa,
        "facilities": memberships.get(user.pk, []),
        "last_login": user.last_login,
        "created_at": user.created_at,
    }


def _outcome(action: str) -> str:
    if any(word in action for word in FAILURE_WORDS):
        return "failure"
    return "success" if action.endswith(("success", "unlocked", "verified")) else "info"


def _device(user_agent: str) -> str:
    agent = user_agent.lower()
    system = next(
        (
            n
            for k, n in (
                ("android", "Android"),
                ("iphone", "iPhone"),
                ("windows", "Windows"),
                ("mac os", "macOS"),
                ("linux", "Linux"),
            )
            if k in agent
        ),
        "",
    )
    browser = next(
        (
            n
            for k, n in (
                ("edg/", "Edge"),
                ("chrome", "Chrome"),
                ("firefox", "Firefox"),
                ("safari", "Safari"),
            )
            if k in agent
        ),
        "",
    )
    return " · ".join(x for x in (browser, system) if x)


def _event(entry: AuditEntry, facilities: dict[Any, str]) -> dict[str, Any]:
    actor = entry.actor
    return {
        "id": entry.id,
        "occurred_at": entry.occurred_at,
        "action": entry.action,
        "outcome": _outcome(entry.action),
        "actor_id": actor.pk if actor else None,
        "actor_name": actor.full_name if actor else "",
        "actor_email": actor.email if actor else "",
        "actor_role": entry.actor_role,
        "facility_name": facilities.get(entry.facility_id, "") if entry.facility_id else "",
        "object_type": entry.object_type,
        # a short reference only: the console never shows whose record was opened
        "object_ref": entry.object_id[:8] if entry.object_id else "",
        "reason": entry.reason,
        "ip": entry.ip or "",
        "device": _device(entry.user_agent),
    }


def _facility_names() -> dict[Any, str]:
    return dict(Facility.objects.values_list("pk", "name"))


def _paged_events(request: Request, view: APIView, rows: Any) -> Response:
    q = request.query_params.get("q", "").strip()
    if q:
        rows = rows.filter(
            Q(actor__full_name__icontains=q) | Q(actor__email__icontains=q) | Q(ip__startswith=q)
        )
    action = request.query_params.get("action", "").strip()
    if action:
        rows = rows.filter(action__startswith=action)
    outcome = request.query_params.get("outcome", "")
    if outcome == "failure":
        failure = Q()
        for word in FAILURE_WORDS:
            failure |= Q(action__contains=word)
        rows = rows.filter(failure)
    paginator = DefaultPagination()
    page: list[AuditEntry] = list(
        paginator.paginate_queryset(
            rows.select_related("actor").order_by("-sequence"), request, view
        )
        or []
    )
    names = _facility_names()
    return paginator.get_paginated_response(
        [s.EventRowSerializer(_event(e, names)).data for e in page]
    )


class _Platform(APIView):
    permission_classes = [PlatformAdmin]


class _Action(_Platform):
    permission_classes = [PlatformAdmin, RecentAuthRequired()]

    def target(self, request: Request, user_id: Any) -> Any:
        user = User.objects.filter(pk=user_id).first()
        if user is None:
            raise Http404
        if user.pk == request.user.pk:
            raise BusinessRuleViolation("You can't change your own account here.")
        return user

    def reason(self, request: Request) -> str:
        body = s.AccountReasonSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        return str(body.validated_data["reason"])

    def done(self, request: Request, user: Any) -> Response:
        memberships = _memberships()
        user.refresh_from_db()
        return Response(
            s.UserRowSerializer(_row(user, memberships, _mfa_users(), _clinicians([user.pk]))).data
        )


# ---- command centre ----------------------------------------------------------------------------


class CommandCenterView(_Platform):
    @extend_schema(
        tags=TAG, operation_id="platform_command_center", responses={200: s.CommandCenterSerializer}
    )
    def get(self, request: Request) -> Response:
        now = timezone.now()
        overview = overview_data()
        listing = (
            PublicListing.objects.values(
                "facility_id",
                "facility_slug",
                "facility_name",
                "facility_type",
                "district",
                "latitude",
                "longitude",
            )
            .annotate(waiting_sum=Sum("waiting"), updated=Max("updated_at"))
            .order_by("facility_name")
        )
        points: list[dict[str, Any]] = []
        stale = 0
        for row in listing:
            is_stale = row["updated"] is not None and now - row["updated"] > STALE_AFTER
            stale += int(is_stale)
            if row["latitude"] is None or row["longitude"] is None:
                continue
            points.append(
                {
                    "id": row["facility_id"],
                    "slug": row["facility_slug"],
                    "name": row["facility_name"],
                    "type": row["facility_type"],
                    "district": row["district"],
                    "lat": float(row["latitude"]),
                    "lng": float(row["longitude"]),
                    "waiting": row["waiting_sum"] or 0,
                    "stale": is_stale,
                }
            )
        live_ids = list(
            Facility.objects.filter(status=FacilityStatus.LIVE).values_list("pk", flat=True)
        )
        escalated = 0
        try:
            from medilink.disputes.models import Dispute, DisputeStatus

            for facility_id in live_ids:
                with rls_context(facility_id=facility_id):
                    escalated += Dispute.objects.filter(
                        facility_id=facility_id, status=DisputeStatus.ESCALATED
                    ).count()
        except ImportError:  # pragma: no cover - disputes ships with the platform
            pass
        from medilink.clinical.models import BreakGlassSession

        memberships = _memberships()
        staff_ids = {uid for uid, rows in memberships.items() if any(r["is_active"] for r in rows)}
        mfa = _mfa_users()
        day = now - timedelta(hours=24)
        data = {
            "generated_at": now,
            "overview": overview,
            "waiting_now": sum(int(p["waiting"]) for p in points),
            "live_facilities": len(live_ids),
            "attention": {
                "applications_waiting": overview["applications"].get("submitted", 0)
                + overview["applications"].get("under_review", 0),
                "licences_expiring": overview["licences"].get("expiring_30", 0),
                "licences_expired": overview["licences"].get("expired", 0),
                "disputes_escalated": escalated,
                "break_glass_to_review": BreakGlassSession.objects.filter(
                    reviewed_at__isnull=True
                ).count(),
                "stale_facilities": stale,
                "locked_accounts": User.objects.filter(is_active=False).count(),
            },
            "security": {
                "failed_logins_24h": AuditEntry.objects.filter(
                    occurred_at__gte=day, action__in=["auth.login.failure", "auth.mfa.failure"]
                ).count(),
                "successful_logins_24h": AuditEntry.objects.filter(
                    occurred_at__gte=day, action="auth.login.success"
                ).count(),
                "staff_total": len(staff_ids),
                "staff_with_mfa": len(staff_ids & mfa),
                "active_sessions": UserSession.objects.filter(
                    expire_date__gt=now, user__isnull=False
                ).count(),
            },
            "map": points,
            "activity": [
                _event(e, _facility_names())
                for e in AuditEntry.objects.select_related("actor").order_by("-sequence")[:8]
            ],
        }
        return Response(s.CommandCenterSerializer(data).data)


# ---- users ------------------------------------------------------------------------------------


class UsersView(_Platform):
    @extend_schema(
        tags=TAG,
        operation_id="platform_users",
        parameters=[
            OpenApiParameter("q", str),
            OpenApiParameter("kind", str, enum=list(s.USER_KINDS)),
            OpenApiParameter("status", str, enum=["active", "locked"]),
            OpenApiParameter("mfa", str, enum=["on", "off"]),
            OpenApiParameter("page", int),
        ],
        responses={200: s.UserRowSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        params = request.query_params
        users = User.objects.order_by("full_name")
        q = params.get("q", "").strip()
        if q:
            users = users.filter(Q(full_name__icontains=q) | Q(email__icontains=q))
        if params.get("status") == "active":
            users = users.filter(is_active=True)
        elif params.get("status") == "locked":
            users = users.filter(is_active=False)
        memberships = _memberships()
        mfa = _mfa_users()
        listed = list(users)
        clinicians = _clinicians([u.pk for u in listed])
        rows = [_row(u, memberships, mfa, clinicians) for u in listed]
        if params.get("kind") in s.USER_KINDS:
            rows = [r for r in rows if r["kind"] == params["kind"]]
        if params.get("mfa") in ("on", "off"):
            rows = [r for r in rows if r["mfa_enabled"] == (params["mfa"] == "on")]
        paginator = DefaultPagination()
        page = paginator.paginate_queryset(rows, request, self) or []
        return paginator.get_paginated_response(s.UserRowSerializer(page, many=True).data)


class UserView(_Platform):
    @extend_schema(tags=TAG, operation_id="platform_user", responses={200: s.UserDetailSerializer})
    def get(self, request: Request, user_id: Any) -> Response:
        user = User.objects.filter(pk=user_id).first()
        if user is None:
            raise Http404
        memberships = _memberships()
        now = timezone.now()
        data = _row(user, memberships, _mfa_users(), _clinicians([user.pk]))
        data["email_verified"] = user.email_verified_at is not None
        data["sessions"] = [
            {
                "ref": hashlib.sha256(x.session_key.encode()).hexdigest()[:10],
                "audience": x.audience,
                "created_at": x.created_at,
                "expires_at": x.expire_date,
            }
            for x in UserSession.objects.filter(user=user, expire_date__gt=now).order_by(
                "-created_at"
            )
        ]
        names = _facility_names()
        data["events"] = [
            _event(e, names)
            for e in AuditEntry.objects.filter(actor=user)
            .filter(Q(action__startswith="auth.") | Q(action__startswith="platform."))
            .select_related("actor")
            .order_by("-sequence")[:25]
        ]
        record("platform.user.viewed", request=request, object_type="user", object_id=user.pk)
        return Response(s.UserDetailSerializer(data).data)


class LockUserView(_Action):
    @extend_schema(
        tags=TAG,
        operation_id="platform_user_lock",
        request=s.AccountReasonSerializer,
        responses={200: s.UserRowSerializer},
    )
    def post(self, request: Request, user_id: Any) -> Response:
        user = self.target(request, user_id)
        reason = self.reason(request)
        User.objects.filter(pk=user.pk).update(is_active=False)
        revoke_all_sessions(user)
        record(
            "platform.user.locked",
            request=request,
            object_type="user",
            object_id=user.pk,
            reason=reason,
        )
        return self.done(request, user)


class UnlockUserView(_Action):
    @extend_schema(
        tags=TAG,
        operation_id="platform_user_unlock",
        request=s.AccountReasonSerializer,
        responses={200: s.UserRowSerializer},
    )
    def post(self, request: Request, user_id: Any) -> Response:
        user = self.target(request, user_id)
        reason = self.reason(request)
        User.objects.filter(pk=user.pk).update(is_active=True)
        record(
            "platform.user.unlocked",
            request=request,
            object_type="user",
            object_id=user.pk,
            reason=reason,
        )
        return self.done(request, user)


class ResetMfaView(_Action):
    @extend_schema(
        tags=TAG,
        operation_id="platform_user_mfa_reset",
        request=s.AccountReasonSerializer,
        responses={200: s.UserRowSerializer},
    )
    def post(self, request: Request, user_id: Any) -> Response:
        user = self.target(request, user_id)
        reason = self.reason(request)
        TOTPDevice.objects.filter(user=user).delete()
        RecoveryCode.objects.filter(user=user).delete()
        revoke_all_sessions(user)
        record(
            "platform.user.mfa_reset",
            request=request,
            object_type="user",
            object_id=user.pk,
            reason=reason,
        )
        return self.done(request, user)


class RevokeSessionsView(_Action):
    @extend_schema(
        tags=TAG,
        operation_id="platform_user_sessions_revoke",
        request=s.AccountReasonSerializer,
        responses={200: s.UserRowSerializer},
    )
    def post(self, request: Request, user_id: Any) -> Response:
        user = self.target(request, user_id)
        reason = self.reason(request)
        revoke_all_sessions(user)
        record(
            "platform.user.sessions_revoked",
            request=request,
            object_type="user",
            object_id=user.pk,
            reason=reason,
        )
        return self.done(request, user)


# ---- logs -------------------------------------------------------------------------------------

_LOG_PARAMS = [
    OpenApiParameter("q", str),
    OpenApiParameter("action", str),
    OpenApiParameter("outcome", str, enum=["failure"]),
    OpenApiParameter("page", int),
]


class SecurityEventsView(_Platform):
    @extend_schema(
        tags=TAG,
        operation_id="platform_security_events",
        parameters=_LOG_PARAMS,
        responses={200: s.EventRowSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        prefix = Q()
        for p in SECURITY_PREFIXES:
            prefix |= Q(action__startswith=p)
        return _paged_events(request, self, AuditEntry.objects.filter(prefix))


class AccessEventsView(_Platform):
    @extend_schema(
        tags=TAG,
        operation_id="platform_access_events",
        parameters=_LOG_PARAMS,
        responses={200: s.EventRowSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        return _paged_events(request, self, AuditEntry.objects.filter(ACCESS_ACTIONS))
