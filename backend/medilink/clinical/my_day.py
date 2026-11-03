"""Doctor Today (upgrade 05 §3): one clinician's day in counts, and what waits for them.

Counts only, except open pharmacy questions, which name the patient so the doctor can open the
record they already treat. No clinical content leaves this module.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.utils import timezone

from medilink.clinical.models import Consultation, ConsultationStatus, ResultReview, ResultStatus
from medilink.pharmacy.models import PrescriptionQuery, QueryStatus
from medilink.scheduling.models import FollowUp, FollowUpStatus
from medilink.visits.models import Stage, Ticket

OVERDUE_AFTER = dt.timedelta(hours=24)
TREND_DAYS = 7


def _minutes(delta: dt.timedelta) -> float:
    return delta.total_seconds() / 60


def my_day(facility_id: Any, membership_id: Any) -> dict[str, Any]:
    now = timezone.now()
    today = timezone.localdate()
    since = today - dt.timedelta(days=TREND_DAYS - 1)
    tickets = Ticket.objects.filter(
        facility_id=facility_id,
        assigned_membership_id=membership_id,
        stage=Stage.CONSULTATION,
        service_date__gte=since,
        started_at__isnull=False,
        ended_at__isnull=False,
    ).values_list("service_date", "started_at", "ended_at")
    per_day = {since + dt.timedelta(days=i): 0 for i in range(TREND_DAYS)}
    durations: list[float] = []
    for day, started, ended in tickets:
        per_day[day] = per_day.get(day, 0) + 1
        if day == today and started is not None and ended is not None:
            durations.append(_minutes(ended - started))

    drafts = Consultation.objects.filter(
        facility_id=facility_id,
        author_membership_id=membership_id,
        status=ConsultationStatus.DRAFT,
    ).values_list("started_at", flat=True)
    queries = (
        PrescriptionQuery.objects.filter(
            facility_id=facility_id,
            status=QueryStatus.OPEN,
            prescription__prescriber_membership_id=membership_id,
        )
        .select_related("prescription__patient")
        .order_by("created_at")
    )
    return {
        "date": today,
        "seen_today": per_day[today],
        "avg_consult_min": round(sum(durations) / len(durations)) if durations else None,
        "signed_today": Consultation.objects.filter(
            facility_id=facility_id,
            author_membership_id=membership_id,
            status=ConsultationStatus.SIGNED,
            signed_at__date=today,
        ).count(),
        "trend": [{"date": d, "seen": n} for d, n in sorted(per_day.items())],
        "unsigned": len(drafts),
        "unsigned_overdue": sum(1 for started in drafts if now - started > OVERDUE_AFTER),
        "results_waiting": ResultReview.objects.filter(
            facility_id=facility_id,
            assigned_membership_id=membership_id,
            status=ResultStatus.PENDING,
        ).count(),
        "follow_ups_today": FollowUp.objects.filter(
            facility_id=facility_id,
            membership_id=membership_id,
            due_on=today,
            status__in=[FollowUpStatus.BOOKED, FollowUpStatus.DUE],
        ).count(),
        "open_questions": [
            {
                "id": q.pk,
                "prescription_id": q.prescription_id,
                "consultation_id": q.prescription.consultation_id,
                "patient_display_name": str(
                    q.prescription.patient.preferred_name or q.prescription.patient.full_name
                ),
                "raised_at": q.created_at,
            }
            for q in queries[:10]
        ],
        "updated_at": now,
    }
