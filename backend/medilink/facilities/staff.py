"""Staff of a facility (contract sprint-02 §2.2): invitations, acceptance, roles and service points,
deactivation, MFA reset, licence attestation, and the S1 approval hook."""

from __future__ import annotations

import datetime as dt
import hashlib
import secrets
from typing import Any

from django.conf import settings
from django.core.mail import send_mail
from django.db import IntegrityError, connection, transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions

from medilink.audit.services import record
from medilink.core.exceptions import BusinessRuleViolation, Conflict
from medilink.facilities.changelog import log_changes
from medilink.facilities.models import ServicePoint
from medilink.facilities.services import ensure_configurable
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import (
    Facility,
    FacilityMembership,
    Invitation,
    InvitationSource,
    MembershipServicePoint,
    Role,
    RoleCode,
)

INVITE_TTL = dt.timedelta(days=7)
LAST_ADMIN = _("The facility needs at least one active facility admin.")
PENDING = _("This person already has a pending invitation.")
INVALID = _("This invitation link is invalid or has expired. Ask for a new one.")
WRONG_ACCOUNT = _("Sign in with the email address the invitation was sent to.")
ALREADY_MEMBER = _("This person is already an active member of the facility.")
NOT_YOURSELF = _("You can't do this to your own account.")
NO_PROFILE = _("The member has no clinician profile yet.")
STALE = _("Someone else changed this. Reload and try again.")


def _hash(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


def work_phone(value: str | None) -> str:
    """A Rwandan mobile number in E.164, or the value as given when it is another kind of number
    (a landline or a foreign number on an application)."""
    from medilink.patients.normalize import InvalidValue, normalize_phone

    value = (value or "").strip()
    try:
        return normalize_phone(value) or ""
    except InvalidValue:
        return value[:20]


def _check_roles(codes: list[str]) -> list[Role]:
    roles = list(Role.objects.filter(code__in=codes))
    if not codes or len(roles) != len(set(codes)):
        raise exceptions.ValidationError(
            {"role_codes": [str(_("Choose at least one valid role."))]}
        )
    return roles


def _check_points(facility: Facility, ids: list[Any]) -> list[Any]:
    found = set(
        ServicePoint.objects.filter(facility=facility, pk__in=ids, is_active=True).values_list(
            "pk", flat=True
        )
    )
    if len(found) != len(set(ids)):
        raise exceptions.ValidationError(
            {"service_point_ids": [str(_("Choose service points of this facility."))]}
        )
    return list(found)


def _send_invitation(email: str, token: str, facility_name: str) -> None:
    link = f"{str(settings.STAFF_APP_URL).rstrip('/')}/invite/{token}"
    send_mail(
        subject=str(_("You're invited to {facility} on MediLink")).format(facility=facility_name),
        message=str(
            _(
                "Open this link within 7 days to join {facility}:\n{link}\n\n"
                "If you didn't expect it, ignore this email."
            )
        ).format(facility=facility_name, link=link),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
    )


# ---- invitations --------------------------------------------------------------------------------


def invite(
    facility: Facility,
    *,
    email: str,
    role_codes: list[str],
    service_point_ids: list[Any],
    actor: Any,
    request: Any,
    source: str = InvitationSource.STAFF,
    source_ref: str = "",
    idempotency_key: str | None = None,
    full_name: str = "",
    phone: str = "",
    preferred_language: str = "",
) -> Invitation:
    """Invite by email. A repeat with the same `idempotency_key` returns the first invitation
    (no second email); an expired pending invitation is closed first so it doesn't block.
    `full_name`, `phone` and `preferred_language` prefill the new account."""
    if idempotency_key:
        replay = Invitation.objects.filter(
            facility=facility, idempotency_key=idempotency_key
        ).first()
        if replay is not None:
            return replay
    ensure_configurable(facility)
    email = email.strip().lower()
    _check_roles(role_codes)
    points = _check_points(facility, service_point_ids)
    if FacilityMembership.objects.filter(
        facility=facility, user__email__iexact=email, is_active=True
    ).exists():
        from medilink.facilities.errors import FieldConflict

        raise FieldConflict("email", ALREADY_MEMBER)
    _expire(Invitation.objects.filter(facility=facility, email=email))
    token = secrets.token_urlsafe(32)
    try:
        with transaction.atomic():
            invitation = Invitation.objects.create(
                facility=facility,
                email=email,
                full_name=full_name.strip(),
                phone=phone,
                preferred_language=preferred_language,
                invited_by=actor,
                role_codes=role_codes,
                service_point_ids=points,
                token_hash=_hash(token),
                expires_at=timezone.now() + INVITE_TTL,
                source=source,
                source_ref=source_ref,
                idempotency_key=idempotency_key,
            )
    except IntegrityError:
        from medilink.facilities.errors import FieldConflict

        replay = (
            Invitation.objects.filter(facility=facility, idempotency_key=idempotency_key).first()
            if idempotency_key
            else None
        )
        if replay is not None:  # the same key, sent twice at once
            return replay
        raise FieldConflict("email", PENDING) from None
    name = facility.name
    transaction.on_commit(lambda: _send_invitation(email, token, name))
    record(
        "staff.invitation.created",
        request=request,
        actor=actor,
        facility_id=facility.pk,
        object_type="invitation",
        object_id=invitation.pk,
        metadata={"roles": role_codes, "source": source},
    )
    return invitation


def resend(invitation: Invitation, *, actor: Any, request: Any) -> Invitation:
    if invitation.accepted_at or invitation.revoked_at:
        raise BusinessRuleViolation(INVALID)
    ensure_configurable(invitation.facility)
    token = secrets.token_urlsafe(32)
    invitation.token_hash = _hash(token)
    invitation.expires_at = timezone.now() + INVITE_TTL
    invitation.expired_at = None  # an expired invitation comes back to life
    try:
        with transaction.atomic():
            invitation.save(update_fields=["token_hash", "expires_at", "expired_at", "updated_at"])
    except IntegrityError:  # a newer pending invitation for this email exists
        from medilink.facilities.errors import FieldConflict

        raise FieldConflict("email", PENDING) from None
    email, name = invitation.email, invitation.facility.name
    transaction.on_commit(lambda: _send_invitation(email, token, name))
    record(
        "staff.invitation.resent",
        request=request,
        facility_id=invitation.facility_id,
        object_type="invitation",
        object_id=invitation.pk,
    )
    return invitation


def revoke(invitation: Invitation, *, actor: Any, request: Any) -> Invitation:
    if invitation.accepted_at or invitation.revoked_at:
        raise BusinessRuleViolation(INVALID)
    invitation.revoked_at = timezone.now()
    invitation.save(update_fields=["revoked_at", "updated_at"])
    record(
        "staff.invitation.revoked",
        request=request,
        facility_id=invitation.facility_id,
        object_type="invitation",
        object_id=invitation.pk,
    )
    return invitation


def find(token: str) -> dict[str, Any] | None:
    """The pending, unexpired invitation for this token (SECURITY DEFINER lookup), or None."""
    if not token or connection.vendor != "postgresql":
        return None
    with connection.cursor() as cursor:
        cursor.execute("SELECT * FROM tenancy_find_invitation(%s)", [_hash(token)])
        row = cursor.fetchone()
        if row is None:
            return None
        columns = [c[0] for c in cursor.description]
    found = dict(zip(columns, row, strict=True))
    if found["accepted_at"] or found["revoked_at"] or found["expires_at"] <= timezone.now():
        return None
    # what the inviter gave about the person (RLS: read in the invitation's facility)
    with rls_context(facility_id=found["facility_id"]):
        extra = (
            Invitation.objects.filter(pk=found["id"])
            .values("full_name", "phone", "preferred_language")
            .first()
        )
    found.update(extra or {"full_name": "", "phone": "", "preferred_language": ""})
    return found


def mask_email(email: str) -> str:
    local, _at, domain = email.partition("@")
    return f"{local[:1]}•••@{domain}"


def lookup(token: str) -> dict[str, Any]:
    from medilink.accounts.models import User

    found = find(token)
    if found is None:
        raise exceptions.ValidationError({"token": [str(INVALID)]})
    facility = Facility.objects.get(pk=found["facility_id"])
    inviter = User.objects.filter(pk=found["invited_by_id"]).first()
    return {
        "facility_name": facility.name,
        "invited_by": inviter.full_name if inviter else None,
        "role_codes": list(found["role_codes"]),
        "email_masked": mask_email(found["email"]),
        "account_exists": User.objects.filter(email__iexact=found["email"]).exists(),
        "expires_at": found["expires_at"],
        # prefills "Your names" on the accept page (the person who receives the link)
        "suggested_name": found["full_name"],
    }


def _grant(found: dict[str, Any], user: Any, request: Any) -> FacilityMembership:
    """Create (or reactivate) the membership in the invitation's facility."""
    ensure_configurable(Facility.objects.get(pk=found["facility_id"]))
    with rls_context(facility_id=found["facility_id"], user_id=user.pk):
        membership = FacilityMembership.objects.filter(
            facility_id=found["facility_id"], user=user
        ).first()
        if membership is not None and membership.is_active:
            raise BusinessRuleViolation(ALREADY_MEMBER)
        if membership is None:
            membership = FacilityMembership.objects.create(
                facility_id=found["facility_id"], user=user
            )
        else:
            membership.is_active = True
            membership.deactivated_at = None
            membership.version += 1
            membership.save()
        membership.roles.set(Role.objects.filter(code__in=found["role_codes"]))
        MembershipServicePoint.objects.filter(membership=membership).delete()
        MembershipServicePoint.objects.bulk_create(
            [
                MembershipServicePoint(
                    facility_id=found["facility_id"], membership=membership, service_point_id=p
                )
                for p in found["service_point_ids"] or []
            ]
        )
        Invitation.objects.filter(pk=found["id"]).update(
            accepted_at=timezone.now(), accepted_user=user
        )
        record(
            "staff.invitation.accepted",
            request=request,
            actor=user,
            facility_id=found["facility_id"],
            object_type="invitation",
            object_id=found["id"],
        )
    return membership


def accept_new_account(token: str, *, full_name: str, password: str, request: Any) -> Any:
    """New account from an invitation: the name the person typed (or the inviter's), and the
    inviter's phone and language."""
    from medilink.accounts.models import Language, User
    from medilink.accounts.serializers import run_password_validators

    found = find(token)
    if found is None:
        raise exceptions.ValidationError({"token": [str(INVALID)]})
    if User.objects.filter(email__iexact=found["email"]).exists():
        raise BusinessRuleViolation(WRONG_ACCOUNT)
    full_name = (full_name or found["full_name"]).strip()
    if not full_name:
        raise exceptions.ValidationError({"full_name": [str(_("Give your names."))]})
    candidate = User(email=found["email"], full_name=full_name)
    candidate._password_audience = "staff"  # type: ignore[attr-defined]  # noqa: S105
    try:
        run_password_validators(password, candidate)
    except exceptions.ValidationError as exc:
        raise exceptions.ValidationError({"password": exc.detail}) from None
    extra: dict[str, Any] = {"phone": found["phone"]}
    if found["preferred_language"] in Language.values:
        extra["preferred_language"] = found["preferred_language"]
    user = User.objects.create_user(
        email=found["email"], password=password, full_name=full_name, **extra
    )
    _grant(found, user, request)
    return user


def accept_existing(token: str, *, user: Any, request: Any) -> FacilityMembership:
    found = find(token)
    if found is None:
        raise exceptions.ValidationError({"token": [str(INVALID)]})
    if user.email.lower() != found["email"].lower():
        raise exceptions.PermissionDenied(WRONG_ACCOUNT)
    if not user.phone and found["phone"]:  # keep the person's own number if they have one
        user.phone = found["phone"]
        user.save(update_fields=["phone", "updated_at"])
    return _grant(found, user, request)


def _expire(invitations: Any) -> int:
    """Mark pending invitations past `expires_at` as expired (not revoked)."""
    return int(
        invitations.filter(
            accepted_at__isnull=True,
            revoked_at__isnull=True,
            expired_at__isnull=True,
            expires_at__lte=timezone.now(),
        ).update(expired_at=timezone.now())
    )


def expire_invitations() -> int:
    """Daily job: close expired pending invitations, one facility context at a time (RLS)."""
    count = 0
    for facility_id in Facility.objects.values_list("pk", flat=True):
        with rls_context(facility_id=facility_id):
            count += _expire(Invitation.objects.all())
    return count


# ---- memberships --------------------------------------------------------------------------------


def _active_admins(facility_id: Any, exclude: Any = None) -> int:
    admins = FacilityMembership.objects.filter(
        facility_id=facility_id, is_active=True, roles__code=RoleCode.FACILITY_ADMIN
    ).distinct()
    if exclude is not None:
        admins = admins.exclude(pk=exclude)
    return admins.count()


def update_membership(
    membership: FacilityMembership, data: dict[str, Any], *, actor: Any, request: Any
) -> FacilityMembership:
    ensure_configurable(membership.facility)
    if data.get("version") != membership.version:
        raise Conflict(STALE)
    before = {
        "role_codes": sorted(membership.roles.values_list("code", flat=True)),
        "service_point_ids": sorted(
            str(p) for p in membership.service_points.values_list("service_point_id", flat=True)
        ),
    }
    if "role_codes" in data:
        roles = _check_roles(data["role_codes"])
        if (
            RoleCode.FACILITY_ADMIN not in data["role_codes"]
            and _active_admins(membership.facility_id, membership.pk) == 0
        ):
            raise BusinessRuleViolation(LAST_ADMIN)
        membership.roles.set(roles)
    if "service_point_ids" in data:
        points = _check_points(membership.facility, data["service_point_ids"])
        MembershipServicePoint.objects.filter(membership=membership).delete()
        MembershipServicePoint.objects.bulk_create(
            [
                MembershipServicePoint(
                    facility_id=membership.facility_id, membership=membership, service_point_id=p
                )
                for p in points
            ]
        )
    membership.version += 1
    membership.save(update_fields=["version", "updated_at"])
    after = {
        "role_codes": sorted(membership.roles.values_list("code", flat=True)),
        "service_point_ids": sorted(
            str(p) for p in membership.service_points.values_list("service_point_id", flat=True)
        ),
    }
    changed = log_changes(
        facility_id=membership.facility_id,
        entity="membership",
        entity_id=membership.pk,
        before=before,
        after=after,
        actor=actor,
    )
    record(
        "staff.membership.updated",
        request=request,
        facility_id=membership.facility_id,
        object_type="membership",
        object_id=membership.pk,
        metadata={"fields": changed},
    )
    return membership


def deactivate(
    membership: FacilityMembership, *, reason: str, actor: Any, request: Any
) -> FacilityMembership:
    from medilink.core.realtime import close_sockets

    if not membership.is_active:
        return membership
    if membership.user_id == actor.pk:
        raise BusinessRuleViolation(NOT_YOURSELF)
    is_admin = membership.roles.filter(code=RoleCode.FACILITY_ADMIN).exists()
    if is_admin and _active_admins(membership.facility_id, membership.pk) == 0:
        raise BusinessRuleViolation(LAST_ADMIN)
    membership.is_active = False
    membership.deactivated_at = timezone.now()
    membership.deactivated_by = actor
    membership.deactivation_reason = reason.strip()
    membership.version += 1
    membership.save()
    log_changes(
        facility_id=membership.facility_id,
        entity="membership",
        entity_id=membership.pk,
        before={"is_active": True},
        after={"is_active": False},
        actor=actor,
    )
    user_id = membership.user_id
    transaction.on_commit(lambda: close_sockets(user_id=user_id))
    record(
        "staff.membership.deactivated",
        request=request,
        facility_id=membership.facility_id,
        object_type="membership",
        object_id=membership.pk,
        reason=reason.strip()[:200],
    )
    return membership


def reactivate(membership: FacilityMembership, *, actor: Any, request: Any) -> FacilityMembership:
    if membership.is_active:
        return membership
    ensure_configurable(membership.facility)
    membership.is_active = True
    membership.deactivated_at = None
    membership.version += 1
    membership.save()
    log_changes(
        facility_id=membership.facility_id,
        entity="membership",
        entity_id=membership.pk,
        before={"is_active": False},
        after={"is_active": True},
        actor=actor,
    )
    record(
        "staff.membership.updated",
        request=request,
        facility_id=membership.facility_id,
        object_type="membership",
        object_id=membership.pk,
        metadata={"fields": ["is_active"]},
    )
    return membership


def attest_licence(
    membership: FacilityMembership, *, actor: Any, request: Any
) -> FacilityMembership:
    from medilink.accounts.models import ClinicianProfile

    ensure_configurable(membership.facility)
    if not ClinicianProfile.objects.filter(user_id=membership.user_id).exists():
        raise BusinessRuleViolation(NO_PROFILE)
    membership.licence_attested_at = timezone.now()
    membership.licence_attested_by = actor
    membership.version += 1
    membership.save()
    record(
        "staff.membership.licence_attested",
        request=request,
        facility_id=membership.facility_id,
        object_type="membership",
        object_id=membership.pk,
    )
    return membership


def reset_mfa(user: Any, *, actor: Any, facility_id: Any, request: Any) -> None:
    from django_otp.plugins.otp_totp.models import TOTPDevice

    from medilink.accounts.models import RecoveryCode
    from medilink.accounts.services import revoke_all_sessions

    if user.pk == actor.pk:
        raise BusinessRuleViolation(NOT_YOURSELF)
    TOTPDevice.objects.filter(user=user).delete()
    RecoveryCode.objects.filter(user=user).delete()
    revoke_all_sessions(user)
    email = user.email
    transaction.on_commit(
        lambda: send_mail(
            subject=str(_("Your MediLink second factor was reset")),
            message=str(
                _(
                    "An administrator reset your authenticator. Set it up again at your next "
                    "login. If you didn't ask for this, contact your facility."
                )
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
        )
    )
    record(
        "staff.mfa.reset",
        request=request,
        facility_id=facility_id,
        object_type="user",
        object_id=user.pk,
    )


# ---- S1 approval hook ---------------------------------------------------------------------------


def on_application_approved(
    sender: Any, application_id: Any, facility_id: Any, **kwargs: Any
) -> None:
    """Copy the application into the facility profile, invite the proposed facility admin (with
    their name, phone and language) and move the facility to setup (contract §2.2). Idempotent."""
    from medilink.facilities.services import seed_profile
    from medilink.onboarding.models import Application
    from medilink.onboarding.services import change_facility_status, facility_version
    from medilink.tenancy.models import FacilityStatus

    with rls_context(facility_id=facility_id):
        application = Application.objects.filter(pk=application_id).first()
        if application is None:
            return
        facility = Facility.objects.get(pk=facility_id)
        actor = application.reviewer
        seed_profile(facility, application)
        if (
            not Invitation.objects.filter(
                facility=facility,
                source=InvitationSource.APPLICATION_APPROVAL,
                source_ref=str(application_id),
            ).exists()
            and application.proposed_admin_email
        ):
            invite(
                facility,
                email=application.proposed_admin_email,
                role_codes=[RoleCode.FACILITY_ADMIN],
                service_point_ids=[],
                actor=actor,
                request=None,
                source=InvitationSource.APPLICATION_APPROVAL,
                source_ref=str(application_id),
                full_name=application.proposed_admin_name,
                phone=work_phone(application.proposed_admin_phone),
                preferred_language=application.preferred_language,
            )
        if facility.status == FacilityStatus.APPROVED and actor is not None:
            change_facility_status(
                facility,
                "start_setup",
                version=facility_version(facility),
                actor=actor,
                idempotency_key=f"s2-setup-{application_id}",
            )
