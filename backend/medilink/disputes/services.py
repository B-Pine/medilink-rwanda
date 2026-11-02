"""Dispute lifecycle (contract sprint-10b §2.1). Every change runs under a row lock on the dispute
with its `version`, writes a `disputes_dispute_event`, an audit entry (IDs only) and, after
commit, the S9 notice."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
from dataclasses import dataclass
from typing import Any

from django.core.exceptions import ObjectDoesNotExist
from django.db import IntegrityError, connection, transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions

from medilink.audit.services import record
from medilink.core.exceptions import BusinessRuleViolation, Conflict
from medilink.disputes.models import (
    OPEN_STATUSES,
    Action,
    ActionStatus,
    AuthorRole,
    Channel,
    CommentRequest,
    Disagreement,
    Dispute,
    DisputeEvent,
    DisputeStatus,
    DisputeType,
    Evidence,
    HandlerLevel,
    Message,
    Outcome,
    SubjectType,
    Visibility,
)
from medilink.patients.crypto.fields import decrypt, encrypt
from medilink.patients.errors import FieldRule

ACKNOWLEDGE_WITHIN = dt.timedelta(hours=72)
DECIDE_WITHIN = dt.timedelta(days=10)
ACCEPT_WITHIN = dt.timedelta(days=7)
DISAGREE_WITHIN = dt.timedelta(days=14)
REOPEN_WITHIN = dt.timedelta(days=30)
MAX_OPEN = 5
FLAG_AFTER_REJECTED = 3

TYPES = {
    SubjectType.BILL: DisputeType.BILLING,
    SubjectType.PRESCRIPTION: DisputeType.MEDICATION,
    SubjectType.VISIT: DisputeType.QUEUE_BOOKING,
    SubjectType.TICKET: DisputeType.QUEUE_BOOKING,
    SubjectType.BOOKING: DisputeType.QUEUE_BOOKING,
    SubjectType.NO_SHOW_STRIKE: DisputeType.QUEUE_BOOKING,
    SubjectType.DOCUMENT: DisputeType.RECORD_CORRECTION,
}

TOO_MANY = _("You have 5 open disputes. Wait for one to close before raising another.")
ALREADY_OPEN = _("A dispute about this is already open.")
WRONG_STATUS = _("This dispute can't do that now.")
TOO_LATE = _("The time to do this has passed.")
CONFLICT = _("You are involved in this dispute: you can comment, not decide.")
BAD_OUTCOME = _("This outcome doesn't fit what the dispute is about.")
NO_STATEMENT = _("A statement can only follow a refused correction.")


# ---- text ----------------------------------------------------------------------------------------


def _enc(text: str, table: str, column: str, row_id: Any) -> bytes:
    return encrypt(text, table=table, column=column, row_id=row_id)


def description(d: Dispute) -> str:
    return decrypt(
        bytes(d.description_enc), table="disputes_dispute", column="description_enc", row_id=d.pk
    )


def body(m: Message) -> str:
    return decrypt(bytes(m.body_enc), table="disputes_message", column="body_enc", row_id=m.pk)


def statement(s: Disagreement) -> str:
    return decrypt(
        bytes(s.statement_enc), table="disputes_disagreement", column="statement_enc", row_id=s.pk
    )


# ---- subjects ------------------------------------------------------------------------------------


def subject_facility(subject_type: str, subject_id: Any, patient_id: Any) -> Any:
    """SECURITY DEFINER: the subject's facility when it belongs to the patient, else None."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT disputes_subject_facility(%s, %s, %s)", [subject_type, subject_id, patient_id]
        )
        return cursor.fetchone()[0]


@dataclass(frozen=True)
class Subject:
    facility_patient_id: Any
    snapshot: dict[str, Any]
    consultation_id: Any = None
    booking_id: Any = None
    object_ids: tuple[str, ...] = ()


def _iso(value: Any) -> Any:
    return value.isoformat() if hasattr(value, "isoformat") else value


def load_subject(subject_type: str, subject_id: Any, patient_id: Any) -> Subject:
    """In the facility's RLS context. IDs, numbers, amounts, times and statuses only."""
    from medilink.billing.models import Bill
    from medilink.documents.models import Document
    from medilink.pharmacy.models import Prescription
    from medilink.scheduling.models import Booking, NoShowStrike
    from medilink.visits.models import Ticket, Visit

    sid = str(subject_id)
    if subject_type == SubjectType.VISIT:
        v = Visit.objects.get(pk=subject_id, patient_id=patient_id)
        return Subject(
            v.facility_patient_id,
            {"service_date": _iso(v.service_date), "status": v.status},
            object_ids=(sid,),
        )
    if subject_type == SubjectType.TICKET:
        t = Ticket.objects.select_related("visit").get(pk=subject_id, visit__patient_id=patient_id)
        return Subject(
            t.visit.facility_patient_id,
            {"ticket_number": t.number, "state": t.state, "service_date": _iso(t.service_date)},
            object_ids=(sid, str(t.visit_id)),
        )
    if subject_type == SubjectType.BOOKING:
        b = Booking.objects.get(pk=subject_id, patient_id=patient_id)
        return Subject(
            b.facility_patient_id,
            {"booking_code": b.booking_code, "starts_at": _iso(b.starts_at), "status": b.status},
            booking_id=b.pk,
            object_ids=(sid,),
        )
    if subject_type == SubjectType.NO_SHOW_STRIKE:
        s = NoShowStrike.objects.select_related("booking").get(pk=subject_id, patient_id=patient_id)
        return Subject(
            s.booking.facility_patient_id,
            {
                "booking_code": s.booking.booking_code,
                "starts_at": _iso(s.booking.starts_at),
                "occurred_at": _iso(s.occurred_at),
                "reversed_at": _iso(s.reversed_at),
            },
            booking_id=s.booking_id,
            object_ids=(sid, str(s.booking_id)),
        )
    if subject_type == SubjectType.PRESCRIPTION:
        p = Prescription.objects.get(pk=subject_id, patient_id=patient_id)
        return Subject(
            p.facility_patient_id,
            {"number": p.number, "status": p.status, "issued_at": _iso(p.issued_at)},
            consultation_id=p.consultation_id,
            object_ids=(sid,),
        )
    if subject_type == SubjectType.BILL:
        bill = Bill.objects.get(pk=subject_id, patient_id=patient_id)
        return Subject(
            bill.facility_patient_id,
            {
                "status": bill.status,
                "total_rwf": bill.total_rwf,
                "patient_share_rwf": bill.patient_share_rwf,
                "paid_rwf": bill.paid_rwf,
                "balance_rwf": bill.balance_rwf,
            },
            object_ids=(sid, str(bill.visit_id)),
        )
    d = Document.objects.get(pk=subject_id, patient_id=patient_id)
    return Subject(
        d.facility_patient_id,
        {"number": d.number, "kind": d.kind, "document_date": _iso(d.document_date)},
        consultation_id=d.consultation_id,
        object_ids=(sid,),
    )


def _audit_extract(subject: Subject) -> list[dict[str, Any]]:
    from medilink.audit.models import AuditEntry

    rows = (
        AuditEntry.objects.filter(object_id__in=subject.object_ids)
        .select_related("actor")
        .order_by("occurred_at")[:200]
    )
    return [
        {
            "action": r.action,
            "at": r.occurred_at.isoformat(),
            "actor_name": str(r.actor.full_name) if r.actor is not None else "",
            "actor_id": str(r.actor_id) if r.actor_id else None,
        }
        for r in rows
    ]


# ---- helpers -------------------------------------------------------------------------------------


def _event(d: Dispute, before: str, actor: Any, reason: str = "") -> None:
    DisputeEvent.objects.create(
        facility_id=d.facility_id,
        dispute=d,
        from_status=before,
        to_status=d.status,
        actor=actor,
        reason=reason[:300],
    )


def _audit(action: str, d: Dispute, request: Any = None, **metadata: Any) -> None:
    record(
        action,
        request=request,
        facility_id=d.facility_id,
        object_type="disputes.dispute",
        object_id=d.pk,
        metadata={"dispute_id": str(d.pk), "status": d.status, **metadata},
    )


def _notify_after(event: str, d: Dispute, **extra: Any) -> None:
    from medilink.disputes import notices

    ids = {"dispute_id": d.pk, "facility_id": d.facility_id, **extra}
    transaction.on_commit(lambda: notices.send(event, **ids))


def _locked(dispute_id: Any, version: Any = None) -> Dispute:
    d = Dispute.objects.select_for_update().get(pk=dispute_id)
    if version is not None and int(version) != d.version:
        raise Conflict()
    return d


def _move(d: Dispute, status: str, actor: Any, reason: str = "", **fields: Any) -> None:
    before = d.status
    d.status = status
    for name, value in fields.items():
        setattr(d, name, value)
    d.version += 1
    d.save()
    _event(d, before, actor, reason)


def _single_handler(facility_id: Any) -> bool:
    """One active member with `disputes.handle`: the dispute goes to the platform (FR-DSP-08)."""
    from medilink.tenancy.models import FacilityMembership

    return (
        FacilityMembership.objects.filter(
            facility_id=facility_id,
            is_active=True,
            roles__permissions__code="disputes.handle",
        )
        .distinct()
        .count()
        <= 1
    )


# ---- raise ---------------------------------------------------------------------------------------


def raise_dispute(
    *,
    facility_id: Any,
    patient_id: Any,
    subject_type: str,
    subject_id: Any,
    text: str,
    account: Any = None,
    membership: Any = None,
    request: Any = None,
) -> Dispute:
    """In the facility's RLS context (the caller found the facility)."""
    with transaction.atomic():
        try:
            subject = load_subject(subject_type, subject_id, patient_id)
        except ObjectDoesNotExist:
            raise exceptions.NotFound() from None
        open_count = Dispute.objects.filter(patient_id=patient_id, status__in=OPEN_STATUSES).count()
        if open_count >= MAX_OPEN:
            raise BusinessRuleViolation(TOO_MANY)
        now = timezone.now()
        d = Dispute(
            facility_id=facility_id,
            patient_id=patient_id,
            facility_patient_id=subject.facility_patient_id,
            raised_by_account=account,
            raised_by_membership=membership,
            channel=Channel.COUNTER if membership is not None else Channel.APP,
            type=TYPES[SubjectType(subject_type)],
            subject_type=subject_type,
            subject_id=subject_id,
            subject_snapshot={**subject.snapshot, "consultation_id": _iso_id(subject)},
            description_enc=b"",
            acknowledge_by=now + ACKNOWLEDGE_WITHIN,
            handler_level=HandlerLevel.PLATFORM
            if _single_handler(facility_id)
            else HandlerLevel.FACILITY,
        )
        d.description_enc = _enc(text.strip(), "disputes_dispute", "description_enc", d.pk)
        try:
            with transaction.atomic():
                d.save()
        except IntegrityError as error:
            if "disputes_one_open_per_subject" in str(error):
                raise Conflict(ALREADY_OPEN) from None
            raise
        extract = _audit_extract(subject)
        Evidence.objects.create(
            facility_id=facility_id,
            dispute=d,
            kind="audit_extract",
            snapshot={"entries": extract},
            snapshot_sha256=hashlib.sha256(json.dumps(extract, sort_keys=True).encode()).digest(),
        )
        _event(d, "", account or (membership.user if membership is not None else None))
        _audit("disputes.raised", d, request, channel=d.channel, type=d.type)
        _notify_after("opened", d)
    return d


def _iso_id(subject: Subject) -> str | None:
    return str(subject.consultation_id) if subject.consultation_id else None


def flagged(patient_id: Any) -> bool:
    return (
        Dispute.objects.filter(patient_id=patient_id, outcome=Outcome.REJECTED).count()
        >= FLAG_AFTER_REJECTED
    )


# ---- handling ------------------------------------------------------------------------------------


def involved_user_ids(d: Dispute) -> set[str]:
    """Staff in the evidence or asked for a comment (conflict of interest, FR-DSP-08)."""
    ids: set[str] = set()
    for row in d.evidence.all():
        for entry in row.snapshot.get("entries", []):
            if entry.get("actor_id"):
                ids.add(str(entry["actor_id"]))
    for req in d.comment_requests.select_related("requested_membership"):
        ids.add(str(req.requested_membership.user_id))
    return ids


def _check_handler(d: Dispute, user: Any) -> None:
    if str(user.pk) in involved_user_ids(d):
        raise BusinessRuleViolation(CONFLICT)


def acknowledge(dispute_id: Any, *, version: Any, user: Any, request: Any = None) -> Dispute:
    with transaction.atomic():
        d = _locked(dispute_id, version)
        if d.status not in (DisputeStatus.OPEN, DisputeStatus.REOPENED):
            raise BusinessRuleViolation(WRONG_STATUS)
        _check_handler(d, user)
        now = timezone.now()
        _move(
            d,
            DisputeStatus.UNDER_REVIEW,
            user,
            acknowledged_at=d.acknowledged_at or now,
            decide_by=now + DECIDE_WITHIN,
        )
        _audit("disputes.acknowledged", d, request)
        _notify_after("updated", d)
    return d


def add_message(
    dispute_id: Any, *, user: Any, role: str, visibility: str, text: str, request: Any = None
) -> Message:
    with transaction.atomic():
        d = _locked(dispute_id)
        if d.status == DisputeStatus.CLOSED:
            raise BusinessRuleViolation(WRONG_STATUS)
        m = Message(
            facility_id=d.facility_id,
            dispute=d,
            author_user=user,
            author_role=role,
            visibility=visibility,
            body_enc=b"",
        )
        m.body_enc = _enc(text.strip(), "disputes_message", "body_enc", m.pk)
        m.save()
        if role == AuthorRole.PATIENT and d.status == DisputeStatus.INFO_REQUESTED:
            _move(d, DisputeStatus.UNDER_REVIEW, user, "patient replied")
        else:
            d.version += 1
            d.save(update_fields=["version", "updated_at"])
        _audit("disputes.message", d, request, visibility=visibility, message_id=str(m.pk))
        if visibility == Visibility.THREAD and role != AuthorRole.PATIENT:
            _notify_after("updated", d)
    return m


def request_info(
    dispute_id: Any, *, version: Any, user: Any, text: str, request: Any = None
) -> Dispute:
    with transaction.atomic():
        d = _locked(dispute_id, version)
        if d.status not in (DisputeStatus.UNDER_REVIEW, DisputeStatus.ESCALATED):
            raise BusinessRuleViolation(WRONG_STATUS)
        m = Message(
            facility_id=d.facility_id,
            dispute=d,
            author_user=user,
            author_role=AuthorRole.HANDLER,
            visibility=Visibility.THREAD,
            body_enc=b"",
        )
        m.body_enc = _enc(text.strip(), "disputes_message", "body_enc", m.pk)
        m.save()
        _move(d, DisputeStatus.INFO_REQUESTED, user)
        _audit("disputes.info_requested", d, request)
        _notify_after("updated", d)
    return d


def ask_comment(dispute_id: Any, *, membership_id: Any, user: Any, request: Any = None) -> Any:
    from medilink.tenancy.models import FacilityMembership

    with transaction.atomic():
        d = _locked(dispute_id)
        member = FacilityMembership.objects.filter(
            pk=membership_id, facility_id=d.facility_id, is_active=True
        ).first()
        if member is None:
            raise FieldRule("membership_id", _("Choose a member of this facility."))
        req = CommentRequest.objects.create(
            facility_id=d.facility_id, dispute=d, requested_membership=member, requested_by=user
        )
        _audit("disputes.comment_requested", d, request, membership_id=str(member.pk))
        _notify_after("comment_requested", d, user_id=member.user_id)
    return req


def add_comment(dispute_id: Any, *, membership: Any, text: str, request: Any = None) -> Message:
    with transaction.atomic():
        req = (
            CommentRequest.objects.select_for_update()
            .filter(dispute_id=dispute_id, requested_membership=membership)
            .order_by("-created_at")
            .first()
        )
        if req is None:
            raise BusinessRuleViolation(WRONG_STATUS)
        m = add_message(
            dispute_id,
            user=membership.user,
            role=AuthorRole.STAFF,
            visibility=Visibility.STAFF_COMMENT,
            text=text,
            request=request,
        )
        req.responded_message = m
        req.responded_at = timezone.now()
        req.save(update_fields=["responded_message", "responded_at", "updated_at"])
    return m


# ---- outcomes ------------------------------------------------------------------------------------

LINKS = {
    Outcome.REFUND: ("billing.bill", SubjectType.BILL),
    Outcome.BILL_CORRECTION: ("billing.bill", SubjectType.BILL),
    Outcome.NO_SHOW_REVERSED: ("scheduling.no_show_strike", SubjectType.NO_SHOW_STRIKE),
}


def _actions(d: Dispute, outcome: str, user: Any, reason: str) -> None:
    from medilink.scheduling import booking as bookings
    from medilink.scheduling.models import NoShowStrike

    snapshot_consultation = d.subject_snapshot.get("consultation_id")
    if outcome == Outcome.NO_SHOW_REVERSED:
        strike: NoShowStrike | None
        if d.subject_type == SubjectType.NO_SHOW_STRIKE:
            strike = NoShowStrike.objects.select_related("booking").get(pk=d.subject_id)
        elif d.subject_type == SubjectType.BOOKING:
            strike = (
                NoShowStrike.objects.select_related("booking")
                .filter(booking_id=d.subject_id)
                .first()
            )
        else:
            strike = None
        if strike is None:
            raise BusinessRuleViolation(BAD_OUTCOME)
        if strike.reversed_at is None:
            from medilink.tenancy.models import FacilityMembership

            member = FacilityMembership.objects.filter(facility_id=d.facility_id, user=user).first()
            bookings.reverse_no_show(
                strike.booking_id,
                version=strike.booking.version,
                who=bookings.Who(user=user, membership=member),
                reason_code="other",
                reason_text=f"Dispute: {reason}"[:300],
            )
        Action.objects.create(
            facility_id=d.facility_id,
            dispute=d,
            outcome=outcome,
            linked_object_type="scheduling.no_show_strike",
            linked_object_id=strike.pk,
            status=ActionStatus.DONE,
            created_by=user,
            done_at=timezone.now(),
        )
        return
    if outcome in (Outcome.REFUND, Outcome.BILL_CORRECTION) and d.subject_type != SubjectType.BILL:
        raise BusinessRuleViolation(BAD_OUTCOME)
    if outcome in (Outcome.RECORD_CORRECTED, Outcome.CORRECTION_REFUSED) and not (
        snapshot_consultation
    ):
        raise BusinessRuleViolation(BAD_OUTCOME)
    if outcome == Outcome.REJECTED or outcome == Outcome.CORRECTION_REFUSED:
        return
    linked_type, linked_id = (
        ("clinical.consultation", snapshot_consultation)
        if outcome == Outcome.RECORD_CORRECTED
        else (f"{d.subject_type}", d.subject_id)
    )
    Action.objects.create(
        facility_id=d.facility_id,
        dispute=d,
        outcome=outcome,
        linked_object_type=linked_type,
        linked_object_id=linked_id,
        status=ActionStatus.PENDING,
        created_by=user,
    )


def resolve(
    dispute_id: Any,
    *,
    version: Any,
    user: Any,
    outcome: str,
    reason: str,
    final: bool = False,
    request: Any = None,
) -> Dispute:
    with transaction.atomic():
        d = _locked(dispute_id, version)
        allowed = (
            (DisputeStatus.ESCALATED,)
            if final
            else (DisputeStatus.UNDER_REVIEW, DisputeStatus.INFO_REQUESTED)
        )
        if d.status not in allowed:
            raise BusinessRuleViolation(WRONG_STATUS)
        if not final:
            _check_handler(d, user)
        _actions(d, outcome, user, reason)
        _move(
            d,
            DisputeStatus.FINAL_DECISION if final else DisputeStatus.RESOLVED,
            user,
            reason,
            outcome=outcome,
            decision_reason=reason.strip()[:1000],
            decided_by=user,
            resolved_at=timezone.now(),
        )
        _audit(
            "disputes.final_decision" if final else "disputes.resolved", d, request, outcome=outcome
        )
        _notify_after("updated", d)
    return d


# ---- patient after the decision ------------------------------------------------------------------


def accept(dispute_id: Any, *, version: Any, user: Any, request: Any = None) -> Dispute:
    with transaction.atomic():
        d = _locked(dispute_id, version)
        if d.status not in (DisputeStatus.RESOLVED, DisputeStatus.FINAL_DECISION):
            raise BusinessRuleViolation(WRONG_STATUS)
        _move(d, DisputeStatus.CLOSED, user, closed_at=timezone.now())
        _audit("disputes.closed", d, request, by="patient")
    return d


def escalate(dispute_id: Any, *, version: Any, user: Any, request: Any = None) -> Dispute:
    with transaction.atomic():
        d = _locked(dispute_id, version)
        if d.status != DisputeStatus.RESOLVED:
            raise BusinessRuleViolation(WRONG_STATUS)
        if d.resolved_at and timezone.now() > d.resolved_at + DISAGREE_WITHIN:
            raise BusinessRuleViolation(TOO_LATE)
        _move(
            d,
            DisputeStatus.ESCALATED,
            user,
            "patient disagrees",
            escalated_at=timezone.now(),
            handler_level=HandlerLevel.PLATFORM,
        )
        _audit("disputes.escalated", d, request, by="patient")
        _notify_after("escalated", d)
    return d


def reopen(dispute_id: Any, *, version: Any, user: Any, request: Any = None) -> Dispute:
    with transaction.atomic():
        d = _locked(dispute_id, version)
        if d.status != DisputeStatus.CLOSED or d.reopen_count >= 1:
            raise BusinessRuleViolation(WRONG_STATUS)
        if d.closed_at and timezone.now() > d.closed_at + REOPEN_WITHIN:
            raise BusinessRuleViolation(TOO_LATE)
        now = timezone.now()
        _move(
            d,
            DisputeStatus.REOPENED,
            user,
            reopen_count=d.reopen_count + 1,
            acknowledge_by=now + ACKNOWLEDGE_WITHIN,
            closed_at=None,
        )
        _audit("disputes.reopened", d, request)
        _notify_after("opened", d)
    return d


def add_statement(dispute_id: Any, *, user: Any, text: str, request: Any = None) -> Disagreement:
    with transaction.atomic():
        d = _locked(dispute_id)
        if d.outcome != Outcome.CORRECTION_REFUSED or hasattr(d, "disagreement"):
            raise BusinessRuleViolation(NO_STATEMENT)
        s = Disagreement(
            facility_id=d.facility_id,
            dispute=d,
            consultation_id=d.subject_snapshot.get("consultation_id"),
            patient_id=d.patient_id,
            statement_enc=b"",
            created_by_account=user,
        )
        s.statement_enc = _enc(text.strip(), "disputes_disagreement", "statement_enc", s.pk)
        s.save()
        _audit("disputes.statement_added", d, request)
    return s


# ---- deadlines (hourly job) ----------------------------------------------------------------------


def apply_deadlines(facility_id: Any, *, now: dt.datetime | None = None) -> dict[str, int]:
    now = now or timezone.now()
    counts = {"escalated": 0, "closed": 0}
    late_ack = Dispute.objects.filter(
        facility_id=facility_id,
        status__in=[DisputeStatus.OPEN, DisputeStatus.REOPENED],
        acknowledge_by__lt=now,
    )
    late_decision = Dispute.objects.filter(
        facility_id=facility_id,
        status__in=[
            DisputeStatus.ACKNOWLEDGED,
            DisputeStatus.UNDER_REVIEW,
            DisputeStatus.INFO_REQUESTED,
        ],
        decide_by__lt=now,
    )
    for pk in [*late_ack.values_list("pk", flat=True), *late_decision.values_list("pk", flat=True)]:
        with transaction.atomic():
            d = _locked(pk)
            _move(
                d,
                DisputeStatus.ESCALATED,
                None,
                "deadline passed",
                escalated_at=now,
                handler_level=HandlerLevel.PLATFORM,
            )
            _notify_after("escalated", d)
            counts["escalated"] += 1
    for pk in Dispute.objects.filter(
        facility_id=facility_id, status=DisputeStatus.RESOLVED, resolved_at__lt=now - ACCEPT_WITHIN
    ).values_list("pk", flat=True):
        with transaction.atomic():
            d = _locked(pk)
            _move(d, DisputeStatus.CLOSED, None, "no reply in 7 days", closed_at=now)
            counts["closed"] += 1
    if any(counts.values()):
        record(
            "disputes.deadlines",
            facility_id=facility_id,
            object_type="disputes.dispute",
            metadata=counts,
        )
    return counts
