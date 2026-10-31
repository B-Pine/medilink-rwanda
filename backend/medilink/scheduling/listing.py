"""Public discovery read model and search (contract sprint-05 §2.3, P1-P3, FR-SCH-01..04).

`refresh(facility_id)` runs inside that facility's RLS context and copies only C0 data into
`facilities_public_listing`. Search reads only that table, never a facility table."""

from __future__ import annotations

import datetime as dt
import math
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from medilink.billing.models import InsurerRule
from medilink.billing.services import current_q, price
from medilink.facilities.calendar import KIGALI, effective_calendar
from medilink.facilities.models import Profile, PublicListing, Service
from medilink.masterdata.models import Location, LocationLevel
from medilink.scheduling.slots import bookable
from medilink.tenancy.models import Facility, FacilityStatus, FacilityType
from medilink.visits.models import DutyState, Ticket, TicketState
from medilink.visits.services import doctors_for

LEVEL_BY_TYPE: dict[str, str] = {
    FacilityType.HEALTH_POST: "primary",
    FacilityType.HEALTH_CENTER: "primary",
    FacilityType.PRIVATE_CLINIC: "primary",
    FacilityType.DISTRICT_HOSPITAL: "secondary",
    FacilityType.PROVINCIAL_HOSPITAL: "secondary",
    FacilityType.REFERRAL_HOSPITAL: "tertiary",
}
MUTUELLE = "mutuelle"
PAGE_SIZE = 20


def queue_load(waiting: int, doctors: int) -> str:
    """People waiting per doctor on duty: < 4 low, < 8 medium, else high (as the S4 dashboard)."""
    if waiting == 0:
        return "low"
    if doctors == 0:
        return "high"
    per_doctor = waiting / doctors
    return "low" if per_doctor < 4 else "medium" if per_doctor < 8 else "high"


def _place(facility: Facility, profile: Profile | None) -> dict[str, str]:
    code = profile.village_code if profile else ""
    node = Location.objects.filter(code=code).select_related("parent__parent__parent").first()
    if node is None:
        from medilink.onboarding.models import Application

        application = (
            Application.objects.filter(facility=facility)
            .select_related("village__parent__parent__parent")
            .first()
        )
        node = application.village if application else None
    out = {"district_code": "", "district": "", "sector_code": "", "sector": ""}
    while node is not None:
        if node.level == LocationLevel.SECTOR:
            out["sector_code"], out["sector"] = node.code, node.name
        if node.level == LocationLevel.DISTRICT:
            out["district_code"], out["district"] = node.code, node.name
            break
        node = node.parent
    return out


def _hours(facility_id: Any, start: dt.date) -> list[list[Any]]:
    days = effective_calendar(facility_id, start, start + dt.timedelta(days=6))
    return [
        [d.date.isoformat(), a.strftime("%H:%M"), b.strftime("%H:%M")]
        for d in days
        for a, b in d.open
    ]


def refresh(facility_id: Any) -> int:
    """Rebuild the listing rows of one facility (inside its RLS context). Facilities that are not
    live lose their rows."""
    facility = Facility.objects.filter(pk=facility_id).first()
    if facility is None or facility.status != FacilityStatus.LIVE:
        PublicListing.objects.filter(facility_id=facility_id).delete()
        return 0
    profile = Profile.objects.filter(facility_id=facility_id).first()
    place = _place(facility, profile)
    today = timezone.localdate()
    now = timezone.now()
    hours = _hours(facility_id, today)
    rules = list(InsurerRule.objects.filter(current_q(today), facility_id=facility_id))
    waiting: dict[Any, int] = {}
    for service_id in Ticket.objects.filter(
        facility_id=facility_id, service_date=today, state=TicketState.WAITING
    ).values_list("service_id", flat=True):
        waiting[service_id] = waiting.get(service_id, 0) + 1
    rows = []
    for service in Service.objects.filter(facility_id=facility_id, is_active=True):
        item = price(facility_id, service_id=service.pk, on=today)
        insurers = {
            r.insurer_code: r.patient_share_bp
            for r in rules
            if r.applies_to_all_services or str(service.pk) in {str(x) for x in r.service_ids}
        }
        next_slot = None
        if service.is_bookable:
            first = bookable(
                facility_id, service.pk, start=now, end=now + dt.timedelta(days=60)
            ).first()
            next_slot = first.starts_at if first else None
        doctors = doctors_for(facility_id, service.pk).filter(state=DutyState.ON_DUTY).count()
        rows.append(
            PublicListing(
                facility_id=facility.pk,
                facility_slug=facility.slug,
                facility_name=facility.name,
                facility_type=facility.facility_type,
                ownership=facility.ownership,
                level_of_care=(profile.level_of_care if profile else "")
                or LEVEL_BY_TYPE.get(str(facility.facility_type), ""),
                latitude=profile.latitude if profile else None,
                longitude=profile.longitude if profile else None,
                service_id=service.pk,
                service_code=service.catalogue_item_code,
                service_name_i18n=service.name_i18n,
                is_bookable=service.is_bookable,
                allows_remote_join=service.allows_remote_join,
                allows_walk_in=service.allows_walk_in,
                fee_rwf=item.amount_rwf if item else None,
                insurers=insurers,
                hours=hours,
                next_slot_at=next_slot,
                queue_load=queue_load(waiting.get(service.pk, 0), doctors),
                updated_at=now,
                **place,
            )
        )
    with transaction.atomic():
        PublicListing.objects.filter(facility_id=facility_id).delete()
        PublicListing.objects.bulk_create(rows)
    return len(rows)


# ---- search --------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Query:
    service_code: str | None = None
    district_code: str | None = None
    sector_code: str | None = None
    near: tuple[float, float] | None = None
    insurer_code: str | None = None
    open_now: bool = False
    level_of_care: str | None = None
    available_today: bool = False
    page: int = 1


def _km(a: tuple[float, float], lat: Decimal | None, lng: Decimal | None) -> float | None:
    if lat is None or lng is None:
        return None
    p1, p2 = math.radians(a[0]), math.radians(float(lat))
    dp, dl = p2 - p1, math.radians(float(lng) - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(6371 * 2 * math.asin(math.sqrt(h)), 1)


def is_open(hours: list[list[Any]], now: dt.datetime) -> bool:
    local = now.astimezone(KIGALI)
    day, time = local.date().isoformat(), local.strftime("%H:%M")
    return any(d == day and a <= time < b for d, a, b in hours)


def _accepts(row: PublicListing, insurer_code: str | None) -> str:
    if not insurer_code:
        return "unknown"
    return "yes" if insurer_code in (row.insurers or {}) else "no"


def _share(row: PublicListing, insurer_code: str | None) -> int | None:
    if row.fee_rwf is None:
        return None
    if not insurer_code or insurer_code not in (row.insurers or {}):
        return row.fee_rwf
    return round(row.fee_rwf * int(row.insurers[insurer_code]) / 10_000)


def search(query: Query) -> dict[str, Any]:
    """One result per facility (its best matching service), sorted by distance when a location is
    given, else by open now, then next slot, then name."""
    rows = PublicListing.objects.all()
    if query.service_code:
        rows = rows.filter(service_code=query.service_code)
    if query.district_code:
        rows = rows.filter(district_code=query.district_code)
    if query.sector_code:
        rows = rows.filter(sector_code=query.sector_code)
    if query.level_of_care:
        rows = rows.filter(level_of_care=query.level_of_care)
    now = timezone.now()
    if query.available_today:
        end_of_day = dt.datetime.combine(
            now.astimezone(KIGALI).date() + dt.timedelta(days=1), dt.time.min, KIGALI
        )
        rows = rows.filter(
            Q(next_slot_at__lt=end_of_day) | Q(allows_remote_join=True) | Q(allows_walk_in=True)
        )
    best: dict[Any, PublicListing] = {}
    # An insurer that is not accepted does not hide a facility: the result says "no" and the
    # patient may still choose to pay (analysis 05 §4)
    for row in rows.order_by("facility_name", "service_code"):
        if query.open_now and not is_open(row.hours, now):
            continue
        current = best.get(row.facility_id)
        if current is None or (row.next_slot_at and not current.next_slot_at):
            best[row.facility_id] = row
    results = []
    for row in best.values():
        distance = _km(query.near, row.latitude, row.longitude) if query.near else None
        results.append(
            {
                "slug": row.facility_slug,
                "name": row.facility_name,
                "type": row.facility_type,
                "ownership": row.ownership,
                "level_of_care": row.level_of_care,
                "district": row.district,
                "sector": row.sector,
                "distance_km": distance,
                "open_now": is_open(row.hours, now),
                "service_code": row.service_code,
                "service_name_i18n": row.service_name_i18n,
                "accepts_insurance": _accepts(row, query.insurer_code),
                "fee_rwf": row.fee_rwf,
                "patient_share_rwf": _share(row, query.insurer_code),
                "next_slot_at": row.next_slot_at,
                "queue_load": row.queue_load or None,
                "allows_remote_join": row.allows_remote_join,
                "referral_hint": query.insurer_code == MUTUELLE
                and row.level_of_care in ("secondary", "tertiary"),
                "lat": float(row.latitude) if row.latitude is not None else None,
                "lng": float(row.longitude) if row.longitude is not None else None,
            }
        )
    if query.near:
        results.sort(key=lambda r: (r["distance_km"] is None, r["distance_km"] or 0, r["name"]))
    else:
        far = dt.datetime.max.replace(tzinfo=dt.UTC)
        results.sort(key=lambda r: (not r["open_now"], r["next_slot_at"] or far, r["name"]))
    page = max(query.page, 1)
    start = (page - 1) * PAGE_SIZE
    return {"count": len(results), "page": page, "results": results[start : start + PAGE_SIZE]}


def live_facilities() -> list[Any]:
    return list(Facility.objects.filter(status=FacilityStatus.LIVE).values_list("pk", flat=True))
