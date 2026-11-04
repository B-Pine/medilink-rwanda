"""Care schedule (upgrade 13 W7): a clinician plans a dated vaccination or antenatal visit for a
patient at their facility; the reminder engine (notifications/reminders.py) tells the patient.

Kept small on purpose: add and cancel, no editing (cancel and add again). The optional label is
encrypted like other clinical text and never goes into a notification. Callers run in the
facility's RLS context.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import NotFound

from medilink.audit.services import record
from medilink.core.exceptions import BusinessRuleViolation, Conflict
from medilink.patients.crypto.fields import decrypt, encrypt
from medilink.patients.errors import FieldRule
from medilink.scheduling.models import CareScheduleEntry, CareScheduleStatus

TABLE, COLUMN = "scheduling_care_schedule_entry", "label_encrypted"
LABEL_MAX = 80
HORIZON_DAYS = 2 * 366  # a vaccination plan rarely reaches further than two years

PAST = _("Choose today or a later day.")
TOO_FAR = _("Choose a day within the next two years.")
STALE = _("Someone else changed this entry. Reload and try again.")
NOT_NOW = _("This entry is already cancelled.")


def label(entry: CareScheduleEntry) -> str:
    if not entry.label_encrypted:
        return ""
    return decrypt(bytes(entry.label_encrypted), table=TABLE, column=COLUMN, row_id=entry.pk)


def data(entry: CareScheduleEntry) -> dict[str, Any]:
    return {
        "id": entry.pk,
        "kind": entry.kind,
        "due_on": entry.due_on,
        "note": label(entry),
        "status": entry.status,
        "created_at": entry.created_at,
        "version": entry.version,
    }


def check_day(due_on: dt.date) -> None:
    today = timezone.localdate()
    if due_on < today:
        raise FieldRule("due_on", PAST)
    if due_on > today + dt.timedelta(days=HORIZON_DAYS):
        raise FieldRule("due_on", TOO_FAR)


def create(
    *,
    facility_patient: Any,
    kind: str,
    due_on: dt.date,
    label_text: str,
    user: Any,
    membership: Any,
    request: Any,
) -> CareScheduleEntry:
    check_day(due_on)
    text = label_text.strip()[:LABEL_MAX]
    with transaction.atomic():
        entry = CareScheduleEntry(
            facility_id=facility_patient.facility_id,
            patient_id=facility_patient.patient_id,
            facility_patient=facility_patient,
            kind=kind,
            due_on=due_on,
            created_by=user,
            created_by_membership=membership,
        )
        if text:
            entry.label_encrypted = encrypt(text, table=TABLE, column=COLUMN, row_id=entry.pk)
        entry.save(force_insert=True)
        record(
            "scheduling.care_schedule.create",
            request=request,
            facility_id=entry.facility_id,
            object_type="scheduling.care_schedule_entry",
            object_id=entry.pk,
            metadata={"kind": kind, "due_on": due_on.isoformat()},
        )
    return entry


def cancel(entry_id: Any, *, version: int, facility_id: Any, request: Any) -> CareScheduleEntry:
    with transaction.atomic():
        entry = (
            CareScheduleEntry.objects.select_for_update()
            .filter(pk=entry_id, facility_id=facility_id)
            .first()
        )
        if entry is None:
            raise NotFound()
        if entry.version != version:
            raise Conflict(STALE, current=data(entry))
        if entry.status != CareScheduleStatus.DUE:
            raise BusinessRuleViolation(NOT_NOW)
        entry.status = CareScheduleStatus.CANCELLED
        entry.cancelled_at = timezone.now()
        entry.version += 1
        entry.save(update_fields=["status", "cancelled_at", "version", "updated_at"])
        record(
            "scheduling.care_schedule.cancel",
            request=request,
            facility_id=entry.facility_id,
            object_type="scheduling.care_schedule_entry",
            object_id=entry.pk,
            metadata={"kind": entry.kind},
        )
    return entry
