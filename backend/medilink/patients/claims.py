"""Record claims (contract §2.5): a patient account takes over a record created at a facility.

The match needs a lookup plus the date of birth. With a contact email on the record a 6-digit code
is emailed (hashed, 15 minutes, 5 attempts); otherwise reception confirms after an ID check, using
the 8-character reference (7 days). Completion runs a `claim` merge: the claimed record survives
and the account's sign-up patient is merged into it.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.contrib.postgres.search import TrigramSimilarity
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from medilink.patients import identity
from medilink.patients import merge as engine
from medilink.patients.audit import record_patient_event
from medilink.patients.errors import rule
from medilink.patients.models import (
    ClaimMethod,
    ClaimStatus,
    Patient,
    PatientLink,
    RecordClaim,
)
from medilink.patients.normalize import CROCKFORD, InvalidValue, normalize_name

CODE_TTL = timedelta(minutes=15)
RECEPTION_TTL = timedelta(days=7)
MAX_ATTEMPTS = 5
NAME_SIMILARITY = 0.6

NO_MATCH = _("We couldn't match these details to a record you can claim.")
HAS_RECORDS = _(
    "Your profile already has facility records. Ask reception to request a merge instead."
)
WRONG_CODE = _("That code isn't right.")
TOO_MANY = _("Too many wrong codes. Start again or ask reception.")
EXPIRED = _("This claim has expired. Start again.")


def _hash(claim_id: Any, code: str) -> bytes:
    return hashlib.sha256(f"{claim_id}:{code}".encode()).digest()


def mask_email(email: str) -> str:
    local, _at, domain = email.partition("@")
    host, _dot, tld = domain.rpartition(".")
    return f"{local[:1]}•••@{host[:1]}•••.{tld}"


def _find(lookup: dict[str, Any], date_of_birth: Any) -> Patient | None:
    try:
        if lookup.get("identifier"):
            ident = lookup["identifier"]
            patient = identity.find_by_identifier(
                ident["kind"], ident.get("issuing_country", ""), ident["value"]
            )
        elif lookup.get("medilink_number"):
            patient = identity.find_by_medilink_number(lookup["medilink_number"])
        else:
            name = normalize_name(lookup.get("full_name", ""))
            patient = (
                Patient.objects.filter(
                    merged_into__isnull=True,
                    phone_e164=lookup.get("phone_e164"),
                    date_of_birth=date_of_birth,
                )
                .annotate(score=TrigramSimilarity("name_normalized", name))
                .filter(score__gte=NAME_SIMILARITY)
                .order_by("-score")
                .first()
            )
    except InvalidValue:
        return None
    if patient is None or patient.date_of_birth != date_of_birth:
        return None
    return patient


def _reference() -> str:
    for _attempt in range(10):
        value = "".join(secrets.choice(CROCKFORD) for _ in range(8))
        if not RecordClaim.objects.filter(reference=value).exists():
            return value
    raise RuntimeError("Could not allocate a claim reference")


def request_claim(
    *, account: Any, own: Patient, lookup: dict[str, Any], date_of_birth: Any, request: Any
) -> RecordClaim:
    target = _find(lookup, date_of_birth)
    if (
        target is None
        or target.pk == own.pk
        or PatientLink.objects.active().filter(patient=target, relationship="self").exists()
    ):
        raise rule(NO_MATCH)
    if identity.facilities_of(own.pk):
        raise rule(HAS_RECORDS)
    now = timezone.now()
    RecordClaim.objects.filter(
        account=account, status__in=[ClaimStatus.CODE_SENT, ClaimStatus.AWAITING_RECEPTION]
    ).update(status=ClaimStatus.CANCELLED)
    by_code = bool(target.email)
    claim = RecordClaim(
        account=account,
        patient=target,
        method=ClaimMethod.CONTACT_CODE if by_code else ClaimMethod.RECEPTION_CHECK,
        reference=_reference(),
        expires_at=now + (CODE_TTL if by_code else RECEPTION_TTL),
        status=ClaimStatus.CODE_SENT if by_code else ClaimStatus.AWAITING_RECEPTION,
    )
    if by_code:
        code = f"{secrets.randbelow(10**6):06d}"
        claim.code_hash = _hash(claim.pk, code)
        email = str(target.email)
        transaction.on_commit(lambda: _send_code(email, code))
    claim.save()
    record_patient_event(
        "patients.claim.requested",
        request=request,
        patient=target,
        object_type="record_claim",
        object_id=claim.pk,
        metadata={"method": claim.method},
    )
    return claim


def _send_code(email: str, code: str) -> None:
    send_mail(
        subject=str(_("Your MediLink verification code")),
        message=str(
            _(
                "Your code is %(code)s. It expires in 15 minutes. "
                "If you didn't ask for it, ignore it."
            )
        )
        % {"code": code},
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
    )


def _expire_if_needed(claim: RecordClaim) -> None:
    if claim.status in (ClaimStatus.CODE_SENT, ClaimStatus.AWAITING_RECEPTION) and (
        claim.expires_at <= timezone.now()
    ):
        claim.status = ClaimStatus.EXPIRED
        claim.save(update_fields=["status"])


def verify_code(claim: RecordClaim, *, code: str, request: Any) -> RecordClaim:
    """Check the code; a wrong code is committed even though the request fails."""
    _expire_if_needed(claim)
    if claim.status == ClaimStatus.EXPIRED:
        raise rule(EXPIRED)
    if claim.status != ClaimStatus.CODE_SENT:
        raise rule(NO_MATCH)
    if not hmac.compare_digest(bytes(claim.code_hash or b""), _hash(claim.pk, code.strip())):
        claim.attempts += 1
        if claim.attempts >= MAX_ATTEMPTS:
            claim.status = ClaimStatus.FAILED
        claim.save(update_fields=["attempts", "status"])
        record_patient_event(
            "patients.claim.code_failed",
            request=request,
            patient=claim.patient,
            object_type="record_claim",
            object_id=claim.pk,
            metadata={"attempts": claim.attempts},
        )
        if claim.status == ClaimStatus.FAILED:
            raise ClaimFailed(TOO_MANY)
        raise ClaimFailed(WRONG_CODE, field="code")
    return complete(claim, actor=claim.account, request=request)


class ClaimFailed(Exception):
    """Raised after the attempt is saved; the view turns it into 400/422 without a rollback."""

    def __init__(self, message: Any, field: str | None = None) -> None:
        super().__init__(str(message))
        self.message = message
        self.field = field


def complete(
    claim: RecordClaim, *, actor: Any, request: Any, facility_id: Any = None
) -> RecordClaim:
    own_link = (
        PatientLink.objects.active().filter(account=claim.account, relationship="self").first()
    )
    if own_link is None:
        raise rule(NO_MATCH)
    try:
        with transaction.atomic():
            merge = engine.create_claim_merge(
                survivor=claim.patient,
                merged=own_link.patient,
                actor=claim.account,
                reason="record claim",
            )
            engine.execute(merge, actor=actor)
    except IntegrityError:
        raise rule(NO_MATCH) from None
    claim.status = ClaimStatus.COMPLETED
    claim.completed_at = timezone.now()
    claim.merge = merge
    if facility_id is not None:
        claim.facility_id = facility_id
        claim.confirmed_by = actor
    claim.save()
    record_patient_event(
        "patients.claim.completed",
        request=request,
        patient=claim.patient,
        object_type="record_claim",
        object_id=claim.pk,
        metadata={"method": claim.method},
    )
    return claim


def confirm_at_reception(
    *, reference: str, patient: Patient, actor: Any, facility_id: Any, request: Any
) -> RecordClaim:
    from django.http import Http404

    claim = (
        RecordClaim.objects.select_for_update()
        .filter(
            reference=reference.strip().upper(),
            patient=patient,
            status=ClaimStatus.AWAITING_RECEPTION,
        )
        .first()
    )
    if claim is None:
        raise Http404
    _expire_if_needed(claim)
    if claim.status == ClaimStatus.EXPIRED:
        raise rule(EXPIRED)
    return complete(claim, actor=actor, request=request, facility_id=facility_id)


def expire_due() -> int:
    """Celery beat: close claims past their deadline (contract §5)."""
    now = timezone.now()
    count = 0
    for claim in RecordClaim.objects.filter(
        status__in=[ClaimStatus.CODE_SENT, ClaimStatus.AWAITING_RECEPTION], expires_at__lte=now
    ).select_related("patient"):
        claim.status = ClaimStatus.EXPIRED
        claim.save(update_fields=["status"])
        record_patient_event(
            "patients.claim.expired",
            request=None,
            patient=claim.patient,
            object_type="record_claim",
            object_id=claim.pk,
        )
        count += 1
    return count
