"""The laboratory loop (upgrade 06 §3, FR-CLN-11, #201). Callers run inside the active facility's
RLS context; every change is one transaction and one audit entry linked to the patient.

    ordered -> sample_taken -> resulted -> reviewed -> released      (cancelled: from ordered)

The doctor orders tests in the draft consultation and sends the patient to the lab. The lab
records each sample and enters each result; when the last test of the visit is resulted, the
patient goes back to the ordering doctor's queue with return priority. A clinician reviews the
result and releases it; the patient sees released results only.
"""

from __future__ import annotations

import json
from typing import Any

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions

from medilink.clinical.lab_catalogue import BY_CODE, flag, parse_values, pick
from medilink.clinical.models import (
    LAB_OPEN_STATES,
    Consultation,
    ConsultationStatus,
    LabOrder,
    LabOrderState,
)
from medilink.core.exceptions import BusinessRuleViolation, Conflict
from medilink.patients.audit import record_patient_event
from medilink.patients.crypto.fields import decrypt, encrypt
from medilink.patients.errors import FieldRule

STALE = _("Someone else changed this test. It was reloaded.")
NOT_NOW = _("This test can't do that now.")
NOT_DRAFT = _("Order tests while the consultation is a draft.")
NOT_AUTHOR = _("Only the doctor who wrote this consultation can order tests in it.")
NOT_ORDERER = _("Only the doctor who ordered this test can cancel it.")
VISIT_CLOSED = _("Tests can be ordered only while the patient is here.")
UNKNOWN_TEST = _("Choose tests from the list.")
ALREADY_ORDERED = _("This test is already ordered for this visit.")
NO_TESTS = _("Choose at least one test.")
MAX_TESTS = 10

_TABLE = "clinical_lab_order"


# ---- encrypted text ---------------------------------------------------------------------------


def _write(order: LabOrder, column: str, value: str) -> None:
    setattr(
        order,
        column,
        encrypt(value, table=_TABLE, column=column, row_id=order.pk) if value else None,
    )


def _read(order: LabOrder, column: str) -> str:
    blob = getattr(order, column)
    if not blob:
        return ""
    return decrypt(bytes(blob), table=_TABLE, column=column, row_id=order.pk)


def request_reason(order: LabOrder) -> str:
    return _read(order, "reason_enc")


def review_note(order: LabOrder) -> str:
    return _read(order, "review_note_enc")


def result(order: LabOrder) -> dict[str, Any] | None:
    """`{values: {item: value}, comment}`, or None before the lab enters it."""
    text = _read(order, "result_enc")
    return dict(json.loads(text)) if text else None


# ---- reads ------------------------------------------------------------------------------------


def _name(membership: Any) -> str | None:
    return membership.user.full_name if membership is not None else None


def result_rows(order: LabOrder, lang: str) -> list[dict[str, Any]]:
    from medilink.clinical.lab_catalogue import result_rows as rows

    data = result(order)
    return rows(order.test_code, (data or {}).get("values", {}), lang) if data else []


def test_name(order: LabOrder, lang: str) -> str:
    test = BY_CODE.get(order.test_code)
    return pick(test.name, lang) if test else order.test_name


def order_data(order: LabOrder, lang: str, *, clinician: bool) -> dict[str, Any]:
    """A lab order for staff. The lab technician (`clinician=False`) never sees the doctor's
    review note (upgrade 06 §3: no notes)."""
    data = result(order)
    test = BY_CODE.get(order.test_code)
    return {
        "id": order.pk,
        "visit_id": order.visit_id,
        "consultation_id": order.consultation_id,
        "test_code": order.test_code,
        "test_name": test_name(order, lang),
        "specimen": test.specimen if test else "",
        "state": order.state,
        "reason": request_reason(order),
        "ordered_at": order.ordered_at,
        "ordered_by_name": _name(order.ordered_by_membership),
        "sample_taken_at": order.sample_taken_at,
        "sample_taken_by_name": _name(order.sample_taken_by_membership),
        "resulted_at": order.resulted_at,
        "resulted_by_name": _name(order.resulted_by_membership),
        "result": (
            {"items": result_rows(order, lang), "comment": data.get("comment", "")}
            if data
            else None
        ),
        "is_abnormal": order.is_abnormal,
        "reviewed_at": order.reviewed_at,
        "reviewed_by_name": _name(order.reviewed_by_membership),
        "review_note": review_note(order) if clinician else "",
        "released_at": order.released_at,
        "version": order.version,
    }


WHO = (
    "ordered_by_membership__user",
    "sample_taken_by_membership__user",
    "resulted_by_membership__user",
    "reviewed_by_membership__user",
)


# ---- doctor: order and cancel -----------------------------------------------------------------


def _audit(action: str, request: Any, order: LabOrder, **metadata: Any) -> None:
    record_patient_event(
        action,
        request=request,
        patient=order.patient,
        object_type="clinical.lab_order",
        object_id=order.pk,
        metadata={
            "visit_id": str(order.visit_id),
            "test_code": order.test_code,
            **{k: str(v) for k, v in metadata.items()},
        },
    )


def order_tests(
    consultation_id: Any, *, codes: list[str], reason: str, membership: Any, request: Any
) -> list[LabOrder]:
    """The doctor orders tests in their draft consultation; each adds a bill line when the test
    has a price."""
    from medilink.billing.bills import add_lab_line
    from medilink.visits.models import VisitStatus

    codes = list(dict.fromkeys(c.strip() for c in codes if c and c.strip()))
    if not codes:
        raise FieldRule("tests", NO_TESTS)
    if len(codes) > MAX_TESTS or any(c not in BY_CODE for c in codes):
        raise FieldRule("tests", UNKNOWN_TEST)
    with transaction.atomic():
        consultation = (
            Consultation.objects.select_for_update()
            .select_related("visit", "patient")
            .get(pk=consultation_id)
        )
        if consultation.author_membership_id != getattr(membership, "pk", None):
            raise BusinessRuleViolation(NOT_AUTHOR)
        if consultation.status != ConsultationStatus.DRAFT:
            raise BusinessRuleViolation(NOT_DRAFT)
        visit = consultation.visit
        if visit.status != VisitStatus.ON_SITE:
            raise BusinessRuleViolation(VISIT_CLOSED)
        open_codes = set(
            LabOrder.objects.filter(visit=visit, state__in=LAB_OPEN_STATES).values_list(
                "test_code", flat=True
            )
        )
        if open_codes & set(codes):
            raise FieldRule("tests", ALREADY_ORDERED)
        now = timezone.now()
        orders = []
        for code in codes:
            test = BY_CODE[code]
            order = LabOrder(
                facility_id=consultation.facility_id,
                visit=visit,
                consultation=consultation,
                patient_id=consultation.patient_id,
                facility_patient_id=consultation.facility_patient_id,
                ordered_by_membership=membership,
                test_code=code,
                test_name=test.name["en"],
                ordered_at=now,
            )
            _write(order, "reason_enc", reason.strip()[:500])
            order.bill_line_id = add_lab_line(
                visit,
                test_code=code,
                test_name=test.name["en"],
                membership=membership,
                request=request,
            )
            order.save()
            _audit("clinical.lab_order.ordered", request, order)
            orders.append(order)
    return orders


def _locked(order_id: Any, version: Any) -> LabOrder:
    order = (
        LabOrder.objects.select_for_update(of=("self",))
        .select_related("patient", "visit")
        .get(pk=order_id)
    )
    if version != order.version:
        raise Conflict(STALE)
    return order


def _save(order: LabOrder, *fields: str) -> None:
    order.version += 1
    order.save(update_fields=[*fields, "version", "updated_at"])


def _actor(membership: Any, request: Any) -> Any:
    from medilink.visits.services import Actor

    return Actor(user=getattr(request, "user", None), membership=membership, request=request)


def _maybe_back_to_doctor(order: LabOrder, membership: Any, request: Any) -> None:
    """When the visit has no test left for the lab, the patient goes back to the doctor."""
    if LabOrder.objects.filter(visit_id=order.visit_id, state__in=LAB_OPEN_STATES).exists():
        return
    from medilink.visits.services import back_from_lab

    back_from_lab(
        order.visit_id,
        doctor_membership_id=order.ordered_by_membership_id,
        actor=_actor(membership, request),
    )


def cancel(order_id: Any, *, version: Any, membership: Any, request: Any) -> LabOrder:
    """The ordering doctor takes back a test the lab has not sampled; its bill line goes while
    nothing is paid."""
    from medilink.billing.bills import remove_lab_line

    with transaction.atomic():
        order = _locked(order_id, version)
        if order.ordered_by_membership_id != getattr(membership, "pk", None):
            raise BusinessRuleViolation(NOT_ORDERER)
        if order.state != LabOrderState.ORDERED:
            raise BusinessRuleViolation(NOT_NOW)
        order.state = LabOrderState.CANCELLED
        order.cancelled_at = timezone.now()
        order.cancelled_by_membership = membership
        _save(order, "state", "cancelled_at", "cancelled_by_membership")
        if order.bill_line_id:
            remove_lab_line(order.bill_line_id, membership=membership, request=request)
        _audit("clinical.lab_order.cancelled", request, order)
        _maybe_back_to_doctor(order, membership, request)
    return order


# ---- lab: sample and result -------------------------------------------------------------------


def take_sample(order_id: Any, *, version: Any, membership: Any, request: Any) -> LabOrder:
    with transaction.atomic():
        order = _locked(order_id, version)
        if order.state != LabOrderState.ORDERED:
            raise BusinessRuleViolation(NOT_NOW)
        order.state = LabOrderState.SAMPLE_TAKEN
        order.sample_taken_at = timezone.now()
        order.sample_taken_by_membership = membership
        _save(order, "state", "sample_taken_at", "sample_taken_by_membership")
        _audit("clinical.lab_order.sample_taken", request, order)
        if not LabOrder.objects.filter(
            visit_id=order.visit_id, state=LabOrderState.ORDERED
        ).exists():
            from medilink.visits.services import lab_sampled

            lab_sampled(order.visit_id, _actor(membership, request))
    return order


def enter_result(
    order_id: Any,
    *,
    version: Any,
    values: dict[str, Any],
    comment: str,
    membership: Any,
    request: Any,
) -> LabOrder:
    with transaction.atomic():
        order = _locked(order_id, version)
        if order.state != LabOrderState.SAMPLE_TAKEN:
            raise BusinessRuleViolation(NOT_NOW)
        test = BY_CODE.get(order.test_code)
        if test is None:
            raise BusinessRuleViolation(NOT_NOW)
        clean, errors = parse_values(test, values)
        if errors:
            raise exceptions.ValidationError({f"values.{k}": v for k, v in errors.items()})
        _write(
            order,
            "result_enc",
            json.dumps({"values": clean, "comment": comment.strip()[:500]}, ensure_ascii=False),
        )
        order.is_abnormal = any(flag(i, clean[i.code]) for i in test.items)
        order.state = LabOrderState.RESULTED
        order.resulted_at = timezone.now()
        order.resulted_by_membership = membership
        _save(order, "state", "result_enc", "is_abnormal", "resulted_at", "resulted_by_membership")
        _audit("clinical.lab_order.resulted", request, order, abnormal=order.is_abnormal)
        _maybe_back_to_doctor(order, membership, request)
    return order


# ---- clinician: review and release ------------------------------------------------------------


def review(order_id: Any, *, version: Any, note: str, membership: Any, request: Any) -> LabOrder:
    """A clinician reads the result; the note goes to the patient with it."""
    with transaction.atomic():
        order = _locked(order_id, version)
        if order.state != LabOrderState.RESULTED:
            raise BusinessRuleViolation(NOT_NOW)
        _write(order, "review_note_enc", note.strip()[:1000])
        order.state = LabOrderState.REVIEWED
        order.reviewed_at = timezone.now()
        order.reviewed_by_membership = membership
        _save(order, "state", "review_note_enc", "reviewed_at", "reviewed_by_membership")
        _audit("clinical.lab_order.reviewed", request, order)
    return order


def release(order_id: Any, *, version: Any, membership: Any, request: Any) -> LabOrder:
    """The patient sees the result from now on (FR-CLN-11: nothing before release)."""
    with transaction.atomic():
        order = _locked(order_id, version)
        if order.state != LabOrderState.REVIEWED:
            raise BusinessRuleViolation(NOT_NOW)
        order.state = LabOrderState.RELEASED
        order.released_at = timezone.now()
        order.released_by_membership = membership
        _save(order, "state", "released_at", "released_by_membership")
        _audit("clinical.lab_order.released", request, order)
    return order
