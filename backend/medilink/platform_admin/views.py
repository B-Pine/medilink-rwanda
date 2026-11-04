"""Super admin console endpoints (upgrade 2026-11-02): the command centre, the user directory and
account actions, and the security and access logs. PlatformAdmin on every view; account actions
need a recent step-up, a written reason, and are audited. Patients appear as accounts only."""

from __future__ import annotations

import csv
import hashlib
import io
from datetime import timedelta
from typing import Any

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Max, Q, Sum
from django.http import Http404, HttpResponse
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from django_otp.plugins.otp_totp.models import TOTPDevice
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import exceptions
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from medilink.accounts.lockout import login_policy, mfa_policy, reset_email_allowed
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
from medilink.tenancy.models import Facility, FacilityMembership, FacilityStatus, Invitation

TAG = ["platform-admin"]
NO_PATIENT_PHONE = _("A patient's phone is kept on their patient record, not on the account.")
LOCKED_FIRST = _("Unlock the account first.")
TOO_MANY_EMAILS = _("This person was already sent 3 of these emails in the last hour. Try later.")
ALREADY_CONFIRMED = _("This person has already confirmed their email.")
CONFIRM_FIRST = _("This person hasn't confirmed their email yet: resend the confirmation email.")
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
                        "membership_id": m.pk,
                        "facility_id": facility.pk,
                        "facility_name": facility.name,
                        "roles": sorted(r.code for r in m.roles.all()),
                        "is_active": m.is_active,
                        "deactivated_at": m.deactivated_at,
                        "deactivation_reason": m.deactivation_reason,
                    }
                )
    return out


def _invitations(email: str) -> list[dict[str, Any]]:
    """Pending staff invitations sent to this email, read one facility at a time."""
    now = timezone.now()
    out: list[dict[str, Any]] = []
    for facility in Facility.objects.only("pk", "name"):
        with rls_context(facility_id=facility.pk):
            for i in Invitation.objects.filter(
                facility_id=facility.pk,
                email__iexact=email,
                accepted_at__isnull=True,
                revoked_at__isnull=True,
                expired_at__isnull=True,
                expires_at__gt=now,
            ):
                out.append(
                    {
                        "facility_id": facility.pk,
                        "facility_name": facility.name,
                        "roles": sorted(i.role_codes),
                        "invited_at": i.created_at,
                        "expires_at": i.expires_at,
                    }
                )
    return out


def _phone_query(q: str) -> str:
    """A typed phone number as stored (E.164): 0788… and 250788… find +250788…"""
    digits = "".join(c for c in q if c.isdigit())
    if len(digits) < 4 or len(digits) < len(q.replace(" ", "").lstrip("+")):
        return ""
    if digits.startswith("0"):
        return "+250" + digits[1:]
    return digits


def _directory(params: Any, memberships: dict[Any, list[dict[str, Any]]]) -> Any:
    """The users matching the list filters, filtered in the database (patients are many)."""
    users = User.objects.order_by("full_name", "email")
    q = params.get("q", "").strip()
    if q:
        match = Q(full_name__icontains=q) | Q(email__icontains=q)
        phone = _phone_query(q)
        if phone:
            match |= Q(phone__contains=phone)
        users = users.filter(match)
    staff_ids = list(memberships)
    kind = params.get("kind")
    if kind == "platform":
        users = users.filter(is_platform_admin=True)
    elif kind == "staff":
        users = users.filter(is_platform_admin=False, pk__in=staff_ids)
    elif kind == "patient":
        users = users.filter(is_platform_admin=False).exclude(pk__in=staff_ids)
    facility, role = params.get("facility", ""), params.get("role", "")
    if facility or role:
        users = users.filter(
            pk__in=[
                uid
                for uid, rows in memberships.items()
                if any(
                    (not facility or str(r["facility_id"]) == facility)
                    and (not role or role in r["roles"])
                    for r in rows
                )
            ]
        )
    if params.get("status") == "active":
        users = users.filter(is_active=True)
    elif params.get("status") == "locked":
        users = users.filter(is_active=False)
    mfa = params.get("mfa")
    with_mfa = TOTPDevice.objects.filter(confirmed=True).values("user_id")
    if mfa == "on":
        users = users.filter(pk__in=with_mfa)
    elif mfa == "off":  # two-step sign-in is for staff and platform admins, never patients
        users = users.exclude(pk__in=with_mfa).filter(
            Q(is_platform_admin=True) | Q(pk__in=staff_ids)
        )
    if params.get("verification") == "pending":
        users = users.filter(email_verification_pending=True)
    return users


def _sign_in_blocked_for(user: Any) -> int:
    return max(login_policy().retry_after(user.email), mfa_policy().retry_after(str(user.pk)))


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


_DIRECTORY_PARAMS = [
    OpenApiParameter("q", str, description="Name, email or phone"),
    OpenApiParameter("kind", str, enum=list(s.USER_KINDS)),
    OpenApiParameter("status", str, enum=["active", "locked"]),
    OpenApiParameter("mfa", str, enum=["on", "off"]),
    OpenApiParameter("facility", str, description="Facility ID: its staff, active or not"),
    OpenApiParameter("role", str, description="Role code at any (or the chosen) facility"),
    OpenApiParameter("verification", str, enum=["pending"]),
]


class UsersView(_Platform):
    @extend_schema(
        tags=TAG,
        operation_id="platform_users",
        parameters=[*_DIRECTORY_PARAMS, OpenApiParameter("page", int)],
        responses={200: s.UserRowSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        memberships = _memberships()
        paginator = DefaultPagination()
        page: list[Any] = list(
            paginator.paginate_queryset(
                _directory(request.query_params, memberships), request, self
            )
            or []
        )
        mfa = _mfa_users()
        clinicians = _clinicians([u.pk for u in page])
        return paginator.get_paginated_response(
            s.UserRowSerializer(
                [_row(u, memberships, mfa, clinicians) for u in page], many=True
            ).data
        )


class UsersSummaryView(_Platform):
    @extend_schema(
        tags=TAG, operation_id="platform_users_summary", responses={200: s.UserSummarySerializer}
    )
    def get(self, request: Request) -> Response:
        memberships = _memberships()
        staff_ids = list(memberships)
        # counts only, for the platform admin: no rows leave this view
        users = User.objects.all()  # nosemgrep: medilink-objects-all-in-view
        with_mfa = TOTPDevice.objects.filter(confirmed=True).values("user_id")
        facilities: dict[Any, str] = {}
        for rows in memberships.values():
            for r in rows:
                facilities[r["facility_id"]] = r["facility_name"]
        data = {
            "total": users.count(),
            "platform": users.filter(is_platform_admin=True).count(),
            "staff": users.filter(is_platform_admin=False, pk__in=staff_ids).count(),
            "patient": users.filter(is_platform_admin=False).exclude(pk__in=staff_ids).count(),
            "locked": users.filter(is_active=False).count(),
            "without_mfa": users.filter(Q(is_platform_admin=True) | Q(pk__in=staff_ids))
            .exclude(pk__in=with_mfa)
            .count(),
            "verification_pending": users.filter(email_verification_pending=True).count(),
            "facilities": [
                {"id": pk, "name": name}
                for pk, name in sorted(facilities.items(), key=lambda item: item[1].lower())
            ],
        }
        return Response(s.UserSummarySerializer(data).data)


EXPORT_COLUMNS = (
    ("full_name", "Name"),
    ("email", "Email"),
    ("phone", "Work phone"),
    ("kind", "Account"),
    ("facilities", "Facilities and roles"),
    ("profession", "Profession"),
    ("licence_state", "Licence"),
    ("mfa", "Two-step sign-in"),
    ("status", "Status"),
    ("last_login", "Last sign-in"),
    ("created_at", "Account created"),
)


def _export_csv(rows: list[dict[str, Any]]) -> str:
    """Staff and platform accounts as CSV (UTF-8 with BOM, formula-safe)."""
    from medilink.onboarding.facility_report import safe_cell

    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow([label for _key, label in EXPORT_COLUMNS])
    for row in rows:
        flat = {
            **row,
            "facilities": "; ".join(
                f"{f['facility_name']} ({', '.join(f['roles'])})"
                + ("" if f["is_active"] else " - removed")
                for f in row["facilities"]
            ),
            "licence_state": row["licence_state"] or "",
            "mfa": "on" if row["mfa_enabled"] else "off",
            "status": "active" if row["is_active"] else "locked",
            "last_login": row["last_login"].isoformat(timespec="minutes")
            if row["last_login"]
            else "",
            "created_at": row["created_at"].date().isoformat(),
        }
        writer.writerow([safe_cell(str(flat.get(key, ""))) for key, _l in EXPORT_COLUMNS])
    return "﻿" + buffer.getvalue()


class UsersExportView(_Platform):
    """Who has access to MediLink, for an access review: staff and platform admins only."""

    @extend_schema(
        tags=TAG,
        operation_id="platform_users_export",
        parameters=_DIRECTORY_PARAMS,
        responses={(200, "text/csv"): OpenApiResponse(description="One row per account")},
        summary="Export staff and platform accounts (CSV, UTF-8; never patients); audit-logged",
    )
    def get(self, request: Request) -> HttpResponse:
        memberships = _memberships()
        users = list(
            _directory(request.query_params, memberships).filter(
                Q(is_platform_admin=True) | Q(pk__in=list(memberships))
            )
        )
        mfa = _mfa_users()
        clinicians = _clinicians([u.pk for u in users])
        rows = [_row(u, memberships, mfa, clinicians) for u in users]
        record(
            "platform.user.list_exported",
            request=request,
            object_type="user",
            metadata={"rows": len(rows)},
        )
        response = HttpResponse(_export_csv(rows), content_type="text/csv; charset=utf-8")
        name = f"medilink-accounts-{timezone.localdate().isoformat()}.csv"
        response["Content-Disposition"] = f'attachment; filename="{name}"'
        response["Cache-Control"] = "no-store"
        return response


def _changes(user: Any, memberships: list[dict[str, Any]]) -> list[AuditEntry]:
    """What admins did to the account and to its facility access, newest first."""
    membership_ids = [str(m["membership_id"]) for m in memberships]
    return list(
        AuditEntry.objects.filter(
            Q(object_type="user", object_id=str(user.pk), action__startswith="platform.user.")
            | Q(
                object_type="membership",
                object_id__in=membership_ids,
                action__startswith="staff.membership.",
            )
        )
        .exclude(action__in=["platform.user.viewed", "platform.user.list_exported"])
        .select_related("actor")
        .order_by("-sequence")[:25]
    )


def _detail(user: Any) -> dict[str, Any]:
    memberships = _memberships()
    now = timezone.now()
    data = _row(user, memberships, _mfa_users(), _clinicians([user.pk]))
    data["email_verified"] = user.email_verified_at is not None
    data["verification_pending"] = user.email_verification_pending
    data["preferred_language"] = user.preferred_language
    data["sign_in_blocked_for"] = _sign_in_blocked_for(user)
    data["invitations"] = _invitations(user.email)
    data["sessions"] = [
        {
            "ref": hashlib.sha256(x.session_key.encode()).hexdigest()[:10],
            "audience": x.audience,
            "created_at": x.created_at,
            "expires_at": x.expire_date,
        }
        for x in UserSession.objects.filter(user=user, expire_date__gt=now).order_by("-created_at")
    ]
    names = _facility_names()
    data["events"] = [
        _event(e, names)
        for e in AuditEntry.objects.filter(actor=user)
        .filter(Q(action__startswith="auth.") | Q(action__startswith="platform."))
        .select_related("actor")
        .order_by("-sequence")[:25]
    ]
    data["changes"] = [_event(e, names) for e in _changes(user, data["facilities"])]
    return data


class UserView(_Action):
    permission_classes = [PlatformAdmin, RecentAuthRequired(methods=("PATCH",))]

    @extend_schema(tags=TAG, operation_id="platform_user", responses={200: s.UserDetailSerializer})
    def get(self, request: Request, user_id: Any) -> Response:
        user = User.objects.filter(pk=user_id).first()
        if user is None:
            raise Http404
        data = _detail(user)
        record("platform.user.viewed", request=request, object_type="user", object_id=user.pk)
        return Response(s.UserDetailSerializer(data).data)

    @extend_schema(
        tags=TAG,
        operation_id="platform_user_update",
        request=s.AccountUpdateSerializer,
        responses={200: s.UserDetailSerializer},
        summary="Correct the name, work phone or language (step-up, reason; audit-logged)",
    )
    def patch(self, request: Request, user_id: Any) -> Response:
        from medilink.facilities.staff import work_phone

        user = self.target(request, user_id)
        body = s.AccountUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        changes: dict[str, Any] = {}
        if "full_name" in data:
            changes["full_name"] = data["full_name"].strip()
        if "preferred_language" in data:
            changes["preferred_language"] = data["preferred_language"]
        if "phone" in data:
            if _kind(user, _memberships()) == "patient":
                # a patient's phone lives on their encrypted patient record, not the account
                raise exceptions.ValidationError({"phone": [str(NO_PATIENT_PHONE)]})
            changes["phone"] = work_phone(data["phone"])
        changed = sorted(k for k, v in changes.items() if getattr(user, k) != v)
        if changed:
            for key in changed:
                setattr(user, key, changes[key])
            user.save(update_fields=[*changed, "updated_at"])
            record(
                "platform.user.updated",
                request=request,
                object_type="user",
                object_id=user.pk,
                reason=data["reason"],
                metadata={"fields": changed},
            )
        return Response(s.UserDetailSerializer(_detail(user)).data)


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


class SendPasswordResetView(_Action):
    """For someone who calls for help: the reset link goes to their own address, never to the
    admin, and the admin never sees or sets the password."""

    @extend_schema(
        tags=TAG,
        operation_id="platform_user_password_reset",
        request=s.AccountReasonSerializer,
        responses={200: s.UserRowSerializer},
    )
    def post(self, request: Request, user_id: Any) -> Response:
        from medilink.accounts.tasks import send_password_reset_email

        user = self.target(request, user_id)
        reason = self.reason(request)
        if not user.is_active:
            raise BusinessRuleViolation(LOCKED_FIRST)
        if user.email_verification_pending:
            raise BusinessRuleViolation(CONFIRM_FIRST)
        if not reset_email_allowed(user.email):
            raise BusinessRuleViolation(TOO_MANY_EMAILS)
        user_ref = str(user.pk)
        transaction.on_commit(lambda: send_password_reset_email.delay(user_ref))
        record(
            "platform.user.password_reset_sent",
            request=request,
            object_type="user",
            object_id=user.pk,
            reason=reason,
        )
        return self.done(request, user)


class ResendVerificationView(_Action):
    @extend_schema(
        tags=TAG,
        operation_id="platform_user_verification_resend",
        request=s.AccountReasonSerializer,
        responses={200: s.UserRowSerializer},
    )
    def post(self, request: Request, user_id: Any) -> Response:
        from medilink.accounts.tasks import send_verify_email

        user = self.target(request, user_id)
        reason = self.reason(request)
        if not user.email_verification_pending:
            raise BusinessRuleViolation(ALREADY_CONFIRMED)
        if not reset_email_allowed(user.email, kind="signup"):
            raise BusinessRuleViolation(TOO_MANY_EMAILS)
        user_ref = str(user.pk)
        transaction.on_commit(lambda: send_verify_email.delay(user_ref))
        record(
            "platform.user.verification_resent",
            request=request,
            object_type="user",
            object_id=user.pk,
            reason=reason,
        )
        return self.done(request, user)


class ClearSignInBlockView(_Action):
    """Ends the temporary block after too many failed passwords or MFA codes (security 03 §6)."""

    @extend_schema(
        tags=TAG,
        operation_id="platform_user_sign_in_unblock",
        request=s.AccountReasonSerializer,
        responses={200: s.UserRowSerializer},
    )
    def post(self, request: Request, user_id: Any) -> Response:
        user = self.target(request, user_id)
        reason = self.reason(request)
        login_policy().reset(user.email)
        mfa_policy().reset(str(user.pk))
        record(
            "platform.user.sign_in_unblocked",
            request=request,
            object_type="user",
            object_id=user.pk,
            reason=reason,
        )
        return self.done(request, user)


class FacilityAccessView(_Action):
    """Remove or restore a person's access to one facility, for example a facility admin who
    left. The facility keeps at least one active facility admin."""

    @extend_schema(
        tags=TAG,
        operation_id="platform_user_facility_access",
        parameters=[
            OpenApiParameter("action", str, OpenApiParameter.PATH, enum=["remove", "restore"])
        ],
        request=s.AccountReasonSerializer,
        responses={200: s.UserDetailSerializer},
    )
    def post(self, request: Request, user_id: Any, facility_id: Any, action: str) -> Response:
        from medilink.facilities import staff

        if action not in ("remove", "restore"):
            raise Http404
        user = self.target(request, user_id)
        reason = self.reason(request)
        with rls_context(facility_id=facility_id):
            membership = (
                FacilityMembership.objects.filter(facility_id=facility_id, user=user)
                .select_related("facility")
                .first()
            )
            if membership is None:
                raise Http404
            if action == "remove":
                staff.deactivate(membership, reason=reason, actor=request.user, request=request)
            else:
                staff.reactivate(membership, actor=request.user, request=request, reason=reason)
        return Response(s.UserDetailSerializer(_detail(user)).data)


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
