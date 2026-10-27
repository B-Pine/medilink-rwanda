"""S5 endpoints (contract sprint-05 §3): public discovery, patient booking, staff bookings."""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any, cast

from django.db import connection
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import exceptions, status
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.accounts.models import User
from medilink.authz.permissions import IsPatientAuthenticated, PublicEndpoint
from medilink.core.exceptions import error_payload
from medilink.facilities.calendar import KIGALI, effective_calendar
from medilink.facilities.models import Profile, PublicListing, Service, ServicePoint
from medilink.facilities.views_base import FacilityView, Needs, err, query_date
from medilink.masterdata.models import Symptom
from medilink.patients.errors import PatientsAPIView
from medilink.patients.models import FacilityPatient, InsuranceProfile, Patient
from medilink.patients.normalize import age_years
from medilink.patients.self_service import link_for, require
from medilink.scheduling import booking as svc
from medilink.scheduling import booking_serializers as s
from medilink.scheduling import listing, slots
from medilink.scheduling.errors import BookingConflict
from medilink.scheduling.models import (
    Booking,
    BookingSource,
    BookingStatus,
    ScheduleTemplate,
    Slot,
    SlotHold,
)
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import Facility, FacilityMembership, FacilityStatus
from medilink.uploads.views import idempotency_key
from medilink.visits.models import ReasonSymptom
from medilink.visits.remote import arrived, facility_record, join
from medilink.visits.services import Actor, active_ticket
from medilink.visits.views import patient_active, short_name, tracker_data

TAGS = ["booking"]
OPERATE, VIEW = "queue.operate", "schedule.view"
WEEK = 7


def _uuid(value: Any) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value)) if value else None
    except ValueError:
        return None


def _lang(request: Request) -> str:
    return getattr(request, "LANGUAGE_CODE", "rw") or "rw"


def _scalar(sql: str, params: list[Any]) -> Any:
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        row = cursor.fetchone()
        return row[0] if row else None


def _live(slug: str) -> Facility:
    facility = Facility.objects.filter(slug=slug, status=FacilityStatus.LIVE).first()
    if facility is None:
        raise exceptions.NotFound()
    return facility


def _names(membership_ids: set[Any]) -> dict[Any, str]:
    return {
        m.pk: m.user.full_name
        for m in FacilityMembership.objects.filter(pk__in=membership_ids).select_related("user")
    }


def slot_rows(rows: list[Slot]) -> list[dict[str, Any]]:
    names = _names({r.membership_id for r in rows if r.membership_id})
    return [
        {
            "id": r.pk,
            "starts_at": r.starts_at,
            "ends_at": r.ends_at,
            "doctor": names.get(r.membership_id),
            "membership_id": r.membership_id,
            "open_places": r.open_places,
        }
        for r in rows
    ]


def week(
    facility_id: Any, service_id: Any, start: dt.date, membership_id: Any = None
) -> dict[str, Any]:
    begin = dt.datetime.combine(start, dt.time.min, KIGALI)
    rows = list(
        slots.bookable(
            facility_id,
            service_id,
            start=begin,
            end=begin + dt.timedelta(days=WEEK),
            membership_id=membership_id,
        )
    )
    by_day: dict[dt.date, list[Slot]] = {start + dt.timedelta(days=i): [] for i in range(WEEK)}
    for r in rows:
        by_day.setdefault(r.starts_at.astimezone(KIGALI).date(), []).append(r)
    return {
        "service_id": service_id,
        "days": [{"date": d, "slots": slot_rows(v)} for d, v in sorted(by_day.items())],
    }


def _symptom_rows(booking_ids: list[Any]) -> dict[Any, list[dict[str, Any]]]:
    out: dict[Any, list[dict[str, Any]]] = {}
    for row in ReasonSymptom.objects.filter(booking_id__in=booking_ids, visit__isnull=True):
        out.setdefault(row.booking_id, []).append(
            {
                "code": row.symptom_code,
                "label": row.symptom_label,
                "duration_days": row.duration_days,
                "severity": row.severity,
            }
        )
    return out


def booking_data(b: Booking) -> dict[str, Any]:
    """Patient view of one booking (inside its facility context)."""
    facility = Facility.objects.get(pk=b.facility_id)
    service = Service.objects.get(pk=b.service_id)
    patient = Patient.objects.get(pk=b.patient_id)
    slot = Slot.objects.filter(pk=b.slot_id).first() if b.slot_id else None
    point = (
        ServicePoint.objects.filter(pk=slot.service_point_id).first()
        if slot and slot.service_point_id
        else None
    )
    deadline = svc.cancel_deadline(b)
    return {
        "id": b.pk,
        "booking_code": b.booking_code,
        "status": b.status,
        "source": b.source,
        "patient_id": b.patient_id,
        "patient_display_name": patient.preferred_name or patient.full_name,
        "facility_slug": facility.slug,
        "facility_name": facility.name,
        "service_id": b.service_id,
        "service_name_i18n": service.name_i18n,
        "doctor": _names({b.membership_id}).get(b.membership_id) if b.membership_id else None,
        "starts_at": b.starts_at,
        "ends_at": slot.ends_at if slot else None,
        "service_point": point.name if point else None,
        "cost": {
            "fee_rwf": b.estimated_fee_rwf,
            "patient_share_rwf": b.estimated_patient_share_rwf,
            "insurer_code": b.insurer_code,
            "insurer_accepted": b.insurer_accepted,
        },
        "symptoms": _symptom_rows([b.pk]).get(b.pk, []),
        "can_change": b.status == BookingStatus.CONFIRMED and timezone.now() < deadline,
        "change_until": deadline,
        "rescheduled_to_id": b.rescheduled_to_id,
        "pending_change": b.pending_change,
        "version": b.version,
    }


def staff_rows(bookings: list[Booking]) -> list[dict[str, Any]]:
    from medilink.visits.services import queue_settings

    if not bookings:
        return []
    today = timezone.localdate()
    names = _names({b.membership_id for b in bookings if b.membership_id})
    symptoms = _symptom_rows([b.pk for b in bookings])
    patients = {p.pk: p for p in Patient.objects.filter(pk__in={b.patient_id for b in bookings})}
    grace = dt.timedelta(minutes=queue_settings(bookings[0].facility_id)["grace_after_minutes"])
    now = timezone.now()
    rows = []
    for b in bookings:
        p = patients[b.patient_id]
        rows.append(
            {
                "id": b.pk,
                "booking_code": b.booking_code,
                "status": b.status,
                "source": b.source,
                "patient_id": b.patient_id,
                "facility_patient_id": b.facility_patient_id,
                "display_name": short_name(p.preferred_name or p.full_name),
                "age_years": age_years(p.date_of_birth, today),
                "sex": p.sex,
                "service_id": b.service_id,
                "membership_id": b.membership_id,
                "doctor": names.get(b.membership_id),
                "starts_at": b.starts_at,
                "symptoms": symptoms.get(b.pk, []),
                "late": b.status == BookingStatus.CONFIRMED and now > b.starts_at + grace,
                "visit_id": b.visit_id,
                "version": b.version,
            }
        )
    return rows


def slot_taken(exc: BookingConflict, slot_id: Any) -> Response:
    """409 with the error envelope plus up to 3 nearby open times (contract §3.2 B1)."""
    slot = Slot.objects.filter(pk=slot_id).first()
    body = error_payload(exc.default_code, exc.detail)
    body["alternatives"] = slot_rows(slots.alternatives(slot)) if slot else []
    return Response(body, status=status.HTTP_409_CONFLICT)


# ---- public (no account) -------------------------------------------------------------------------


class PublicView(PatientsAPIView):
    permission_classes = [PublicEndpoint]
    authentication_classes: list[Any] = []


class SearchView(PublicView):
    @extend_schema(
        operation_id="public_facilities_search",
        tags=TAGS,
        request=s.FacilitySearchSerializer,
        responses={200: s.FacilitySearchPageSerializer},
        description="POST so that the location never appears in a URL or an access log (D-2).",
    )
    def post(self, request: Request) -> Response:
        body = s.FacilitySearchSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        near = data.get("near")
        query = listing.Query(
            service_code=data.get("service_code") or None,
            district_code=data.get("district_code") or None,
            sector_code=data.get("sector_code") or None,
            near=(near["lat"], near["lng"]) if near else None,
            insurer_code=data.get("insurer_code") or None,
            open_now=data["open_now"],
            level_of_care=data.get("level_of_care") or None,
            available_today=data["available_today"],
            page=data["page"],
        )
        response = Response(listing.search(query))
        response["Cache-Control"] = "no-store"
        return response


class FacilityProfileView(PublicView):
    @extend_schema(
        operation_id="public_facility_profile",
        tags=TAGS,
        responses={200: s.PublicFacilitySerializer, 404: err("Not a live facility")},
    )
    def get(self, request: Request, slug: str) -> Response:
        facility = _live(slug)
        rows = {r.service_id: r for r in PublicListing.objects.filter(facility_id=facility.pk)}
        today = timezone.localdate()
        with rls_context(facility_id=facility.pk):
            profile = Profile.objects.filter(facility_id=facility.pk).first()
            services = list(
                Service.objects.filter(facility_id=facility.pk, is_active=True).order_by(
                    "catalogue_item_code"
                )
            )
            days = effective_calendar(facility.pk, today, today + dt.timedelta(days=30))
            templates = list(
                ScheduleTemplate.objects.filter(
                    facility_id=facility.pk, ended_at__isnull=True
                ).select_related("membership__user")
            )
        doctors: dict[Any, dict[str, Any]] = {}
        for t in templates:
            row = doctors.setdefault(
                t.membership_id,
                {
                    "membership_id": t.membership_id,
                    "name": t.membership.user.full_name,
                    "days": set(),
                    "service_ids": set(),
                },
            )
            row["days"].add(t.weekday)
            row["service_ids"].add(t.service_id)
        place = next(iter(rows.values()), None)
        hours = place.hours if place else []
        response = Response(
            {
                "slug": facility.slug,
                "name": facility.name,
                "type": facility.facility_type,
                "ownership": facility.ownership,
                "level_of_care": place.level_of_care if place else "",
                "verified": True,
                "description_i18n": (profile.description_i18n if profile else {}) or {},
                "address": profile.address if profile else "",
                "phone": profile.phone if profile else "",
                "district": place.district if place else "",
                "sector": place.sector if place else "",
                "lat": float(profile.latitude) if profile and profile.latitude else None,
                "lng": float(profile.longitude) if profile and profile.longitude else None,
                "open_now": listing.is_open(hours, timezone.now()),
                "hours": hours,
                "closures": [
                    {"date": d.date, "reason": d.holiday_name or d.closed_reason or ""}
                    for d in days
                    if not d.open and d.closed_reason != "closed_weekday"
                ],
                "services": [
                    {
                        "id": sv.pk,
                        "code": sv.catalogue_item_code,
                        "name_i18n": sv.name_i18n,
                        "fee_rwf": rows[sv.pk].fee_rwf if sv.pk in rows else None,
                        "insurers": sorted((rows[sv.pk].insurers or {}).keys())
                        if sv.pk in rows
                        else [],
                        "bookable": sv.is_bookable,
                        "remote_join": sv.allows_remote_join,
                        "walk_in": sv.allows_walk_in,
                        "queue_load": rows[sv.pk].queue_load or None if sv.pk in rows else None,
                        "next_slot_at": rows[sv.pk].next_slot_at if sv.pk in rows else None,
                        "min_age_months": sv.min_age_months,
                        "max_age_months": sv.max_age_months,
                    }
                    for sv in services
                ],
                "doctors": [
                    {
                        **d,
                        "days": sorted(d["days"]),
                        "service_ids": sorted(d["service_ids"], key=str),
                    }
                    for d in sorted(doctors.values(), key=lambda d: d["name"])
                ],
            }
        )
        response["Cache-Control"] = "public, max-age=60"
        return response


class FacilitySlotsView(PublicView):
    @extend_schema(
        operation_id="public_facility_slots",
        tags=TAGS,
        parameters=[
            OpenApiParameter("service_id", str, required=True),
            OpenApiParameter("date", str),
            OpenApiParameter("membership_id", str),
        ],
        responses={200: s.SlotWeekSerializer, 404: err("Not a live facility")},
    )
    def get(self, request: Request, slug: str) -> Response:
        facility = _live(slug)
        service_id = _uuid(request.query_params.get("service_id"))
        if service_id is None:
            raise exceptions.NotFound()
        start = query_date(request, "date", timezone.localdate())
        with rls_context(facility_id=facility.pk):
            if not Service.objects.filter(
                pk=service_id, facility_id=facility.pk, is_active=True, is_bookable=True
            ).exists():
                raise exceptions.NotFound()
            data = week(
                facility.pk,
                service_id,
                start,
                _uuid(request.query_params.get("membership_id")),
            )
        response = Response(data)
        response["Cache-Control"] = "no-store"
        return response


class SymptomsView(PublicView):
    @extend_schema(
        operation_id="public_symptoms", tags=TAGS, responses={200: s.SymptomSerializer(many=True)}
    )
    def get(self, request: Request) -> Response:
        rows = Symptom.objects.filter(is_active=True).order_by("sort_order", "code")
        response = Response(
            [
                {
                    "code": r.code,
                    "name_i18n": r.name_i18n,
                    "body_system": r.body_system,
                    "is_red_flag": r.is_red_flag,
                }
                for r in rows
            ]
        )
        response["Cache-Control"] = "public, max-age=3600"
        return response


# ---- patient -------------------------------------------------------------------------------------


class PatientView(PatientsAPIView):
    permission_classes = [IsPatientAuthenticated]

    def user(self) -> User:
        return cast(User, self.request.user)

    def who(self) -> svc.Who:
        return svc.Who(user=self.request.user, request=self.request)

    def booking_facility(self, booking_id: Any) -> Any:
        for upcoming in (True, False):
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT booking_id, facility_id FROM scheduling_patient_bookings(%s, %s)",
                    [self.user().pk, upcoming],
                )
                for bid, fid in cursor.fetchall():
                    if str(bid) == str(booking_id):
                        return fid
        raise exceptions.NotFound()

    def own_booking(self, booking: Booking) -> None:
        """Changes need `self` or `guardian` (a delegate may only look)."""
        require(link_for(self.user(), booking.patient_id), "history")


class PatientHoldView(PatientView):
    @extend_schema(
        operation_id="patient_slot_hold",
        tags=TAGS,
        request=None,
        responses={
            201: s.HoldSerializer,
            409: OpenApiResponse(s.SlotTakenSerializer, "Taken or not bookable"),
        },
    )
    def post(self, request: Request, slot_id: Any) -> Response:
        facility_id = _scalar("SELECT scheduling_slot_facility(%s)", [slot_id])
        if facility_id is None:
            raise exceptions.NotFound()
        try:
            with rls_context(facility_id=facility_id, user_id=self.user().pk):
                h = slots.hold(slot_id, account=self.user())
        except BookingConflict as exc:
            with rls_context(facility_id=facility_id):
                return slot_taken(exc, slot_id)
        return Response(
            {"hold_id": h.pk, "expires_at": h.expires_at}, status=status.HTTP_201_CREATED
        )


class PatientHoldDeleteView(PatientView):
    @extend_schema(operation_id="patient_hold_release", tags=TAGS, responses={204: None})
    def delete(self, request: Request, hold_id: Any) -> Response:
        facility_id = _scalar("SELECT scheduling_hold_facility(%s, %s)", [hold_id, self.user().pk])
        if facility_id is None:
            raise exceptions.NotFound()
        with rls_context(facility_id=facility_id, user_id=self.user().pk):
            h = SlotHold.objects.filter(pk=hold_id, account=self.user()).first()
            if h is not None and h.booking_id is None:
                slots.release(h)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PatientBookingsView(PatientView):
    @extend_schema(
        operation_id="patient_bookings",
        tags=TAGS,
        parameters=[OpenApiParameter("when", str, enum=["upcoming", "past"])],
        responses={200: s.BookingListSerializer},
    )
    def get(self, request: Request) -> Response:
        upcoming = request.query_params.get("when", "upcoming") != "past"
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT booking_id, facility_id FROM scheduling_patient_bookings(%s, %s)",
                [self.user().pk, upcoming],
            )
            pairs = cursor.fetchall()
        results = []
        for booking_id, facility_id in pairs[:50]:
            with rls_context(facility_id=facility_id, user_id=self.user().pk):
                b = Booking.objects.filter(pk=booking_id).first()
                if b is not None:
                    results.append(booking_data(b))
        if not upcoming:
            results.reverse()
        return Response({"results": results})

    @extend_schema(
        operation_id="patient_booking_create",
        tags=TAGS,
        request=s.BookSerializer,
        responses={
            201: s.BookingSerializer,
            200: s.BookingSerializer,
            422: err(
                "age_rule, sex_rule, limit_active, limit_strikes, same_day_service, hold_expired"
            ),
        },
    )
    def post(self, request: Request) -> Response:
        body = s.BookSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        link = link_for(self.user(), data["patient_id"])
        require(link, "history")
        facility_id = _scalar(
            "SELECT scheduling_hold_facility(%s, %s)", [data["hold_id"], self.user().pk]
        )
        if facility_id is None:
            raise svc.BookingRule(svc.HOLD_EXPIRED, "hold_expired")
        insurance = None
        if data.get("insurance_profile_id"):
            insurance = InsuranceProfile.objects.filter(
                pk=data["insurance_profile_id"], patient_id=link.patient_id
            ).first()
            if insurance is None:
                raise exceptions.ValidationError({"insurance_profile_id": ["Unknown."]})
        with rls_context(facility_id=facility_id, user_id=self.user().pk):
            b, created = svc.book(
                hold_id=data["hold_id"],
                patient=link.patient,
                who=self.who(),
                symptoms=data["symptoms"],
                reason_text=data.get("reason_text", ""),
                insurance_profile=insurance,
                source=BookingSource.ONLINE,
                key=_uuid(idempotency_key(request)),
                language=_lang(request),
            )
            out = booking_data(b)
        return Response(out, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class PatientBookingDetailView(PatientView):
    @extend_schema(operation_id="patient_booking", tags=TAGS, responses={200: s.BookingSerializer})
    def get(self, request: Request, booking_id: Any) -> Response:
        facility_id = self.booking_facility(booking_id)
        with rls_context(facility_id=facility_id, user_id=self.user().pk):
            return Response(booking_data(Booking.objects.get(pk=booking_id)))


def _ics_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", " ")


def ics(bookings: list[dict[str, Any]], *, name: str = "MediLink") -> str:
    """Calendar file: facility, service, time and booking code only, never a reason for visit or
    a diagnosis (contract §2.2 Calendar)."""
    stamp = timezone.now().astimezone(dt.UTC).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//MediLink Rwanda//Bookings//EN",
        "CALSCALE:GREGORIAN",
        f"X-WR-CALNAME:{_ics_text(name)}",
    ]
    for b in bookings:
        start = b["starts_at"].astimezone(dt.UTC)
        end = (b["ends_at"] or b["starts_at"] + dt.timedelta(minutes=15)).astimezone(dt.UTC)
        service = b["service_name_i18n"].get("en") or next(
            iter(b["service_name_i18n"].values()), ""
        )
        lines += [
            "BEGIN:VEVENT",
            f"UID:{b['id']}@medilink.rw",
            f"DTSTAMP:{stamp}",
            f"DTSTART:{start:%Y%m%dT%H%M%SZ}",
            f"DTEND:{end:%Y%m%dT%H%M%SZ}",
            f"SUMMARY:{_ics_text(f'{service} · {b["facility_name"]}')}",
            f"LOCATION:{_ics_text(b['facility_name'])}",
            f"DESCRIPTION:{_ics_text('Booking code ' + b['booking_code'])}",
            "STATUS:CONFIRMED" if b["status"] == "confirmed" else "STATUS:CANCELLED",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


class PatientBookingIcsView(PatientView):
    @extend_schema(
        operation_id="patient_booking_ics",
        tags=TAGS,
        responses={(200, "text/calendar"): OpenApiResponse(description="iCalendar file")},
    )
    def get(self, request: Request, booking_id: Any) -> HttpResponse:
        facility_id = self.booking_facility(booking_id)
        with rls_context(facility_id=facility_id, user_id=self.user().pk):
            data = booking_data(Booking.objects.get(pk=booking_id))
        response = HttpResponse(ics([data]), content_type="text/calendar; charset=utf-8")
        response["Content-Disposition"] = (
            f'attachment; filename="medilink-{data["booking_code"]}.ics"'
        )
        response["Cache-Control"] = "private, no-store"
        return response


class PatientBookingCancelView(PatientView):
    @extend_schema(
        operation_id="patient_booking_cancel",
        tags=TAGS,
        request=s.VersionSerializer,
        responses={200: s.BookingSerializer, 409: err("Stale version")},
    )
    def post(self, request: Request, booking_id: Any) -> Response:
        body = s.VersionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        facility_id = self.booking_facility(booking_id)
        with rls_context(facility_id=facility_id, user_id=self.user().pk):
            self.own_booking(Booking.objects.get(pk=booking_id))
            b = svc.cancel(booking_id, version=body.validated_data["version"], who=self.who())
            return Response(booking_data(b))


class PatientBookingRescheduleView(PatientView):
    @extend_schema(
        operation_id="patient_booking_reschedule",
        tags=TAGS,
        request=s.RescheduleSerializer,
        responses={200: s.BookingSerializer, 409: err("Stale version"), 422: err("Closed")},
    )
    def post(self, request: Request, booking_id: Any) -> Response:
        body = s.RescheduleSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        facility_id = self.booking_facility(booking_id)
        hold_facility = _scalar(
            "SELECT scheduling_hold_facility(%s, %s)",
            [body.validated_data["hold_id"], self.user().pk],
        )
        if hold_facility is None or str(hold_facility) != str(facility_id):
            raise svc.BookingRule(svc.HOLD_EXPIRED, "hold_expired")
        with rls_context(facility_id=facility_id, user_id=self.user().pk):
            self.own_booking(Booking.objects.get(pk=booking_id))
            b = svc.reschedule(
                booking_id,
                version=body.validated_data["version"],
                hold_id=body.validated_data["hold_id"],
                who=self.who(),
                language=_lang(request),
            )
            return Response(booking_data(b))


class RemoteJoinView(PatientView):
    @extend_schema(
        operation_id="patient_remote_join",
        tags=TAGS,
        request=s.RemoteJoinSerializer,
        responses={201: OpenApiResponse(description="Tracker row (PT1)"), 422: err("Closed")},
    )
    def post(self, request: Request) -> Response:
        body = s.RemoteJoinSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        link = link_for(self.user(), data["patient_id"])
        require(link, "history")
        facility = _live(data["facility_slug"])
        with rls_context(facility_id=facility.pk, user_id=self.user().pk):
            service = Service.objects.filter(pk=data["service_id"], facility_id=facility.pk).first()
            if service is None:
                raise exceptions.NotFound()
            visit, _ticket, created = join(
                facility_id=facility.pk,
                service=service,
                patient_id=link.patient_id,
                actor=Actor(user=self.user(), membership=None, request=request),
                key=_uuid(idempotency_key(request)),
            )
            data_out = tracker_data(visit, self.user())
        return Response(data_out, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class ArrivedView(PatientView):
    @extend_schema(
        operation_id="patient_visit_arrived",
        tags=TAGS,
        request=None,
        responses={200: OpenApiResponse(description="Tracker row (PT1)")},
    )
    def post(self, request: Request, visit_id: Any) -> Response:
        match = [f for v, f in patient_active(self.user().pk) if str(v) == str(visit_id)]
        if not match:
            raise exceptions.NotFound()
        from medilink.visits.models import Visit

        with rls_context(facility_id=match[0], user_id=self.user().pk):
            visit = Visit.objects.select_related("patient").get(pk=visit_id)
            ticket = active_ticket(visit)
            if ticket is None:
                raise exceptions.NotFound()
            arrived(ticket, actor=Actor(user=self.user(), membership=None, request=request))
            visit.refresh_from_db()
            return Response(tracker_data(visit, self.user()))


# ---- staff -------------------------------------------------------------------------------------


class StaffBookingView(FacilityView):
    def facility_id(self) -> Any:
        return self.principal().active_facility_id

    def who(self) -> svc.Who:
        return svc.Who(
            user=self.request.user, membership=self.principal().membership, request=self.request
        )

    def booking(self, booking_id: Any) -> Booking:
        b = Booking.objects.filter(pk=booking_id, facility_id=self.facility_id()).first()
        if b is None:
            raise exceptions.NotFound()
        return b


class StaffBookingsView(StaffBookingView):
    permission_classes = [Needs(OPERATE, VIEW, methods={"POST": (OPERATE,)})]

    @extend_schema(
        operation_id="staff_bookings",
        tags=TAGS,
        parameters=[
            OpenApiParameter("date", str),
            OpenApiParameter("service_id", str),
            OpenApiParameter("membership_id", str),
            OpenApiParameter("status", str),
        ],
        responses={200: s.StaffBookingPageSerializer},
    )
    def get(self, request: Request) -> Response:
        day = query_date(request, "date", timezone.localdate())
        qs = Booking.objects.filter(facility_id=self.facility_id(), service_date=day)
        for name in ("service_id", "membership_id"):
            value = _uuid(request.query_params.get(name))
            if value:
                qs = qs.filter(**{name: value})
        wanted = request.query_params.get("status")
        if wanted:
            qs = qs.filter(status__in=wanted.split(","))
        else:
            qs = qs.exclude(status=BookingStatus.SUPERSEDED)
        rows = list(qs.order_by("starts_at", "booking_code")[:500])
        return Response({"count": len(rows), "results": staff_rows(rows)})

    @extend_schema(
        operation_id="staff_booking_create",
        tags=TAGS,
        request=s.StaffBookSerializer,
        responses={201: s.StaffBookingSerializer, 200: s.StaffBookingSerializer},
    )
    def post(self, request: Request) -> Response:
        body = s.StaffBookSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        record = FacilityPatient.objects.filter(
            pk=data["facility_patient_id"], facility_id=self.facility_id(), is_active=True
        ).first()
        if record is None:
            raise exceptions.NotFound()
        insurance = None
        if data.get("insurance_profile_id"):
            insurance = InsuranceProfile.objects.filter(
                pk=data["insurance_profile_id"], patient_id=record.patient_id
            ).first()
        b, created = svc.book(
            hold_id=data["hold_id"],
            patient=Patient.objects.get(pk=record.patient_id),
            who=self.who(),
            symptoms=data["symptoms"],
            reason_text=data.get("reason_text", ""),
            insurance_profile=insurance,
            facility_patient=record,
            contact_phone=data.get("contact_phone") or None,
            source=BookingSource.PHONE,
            key=_uuid(idempotency_key(request)),
            language=_lang(request),
        )
        return Response(
            staff_rows([b])[0], status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )


class StaffSlotsView(StaffBookingView):
    permission_classes = [Needs(OPERATE, VIEW)]

    @extend_schema(
        operation_id="staff_slots",
        tags=TAGS,
        parameters=[
            OpenApiParameter("service_id", str, required=True),
            OpenApiParameter("date", str),
            OpenApiParameter("membership_id", str),
        ],
        responses={200: s.SlotWeekSerializer},
    )
    def get(self, request: Request) -> Response:
        service_id = _uuid(request.query_params.get("service_id"))
        if service_id is None:
            raise exceptions.NotFound()
        if not Service.objects.filter(pk=service_id, facility_id=self.facility_id()).exists():
            raise exceptions.NotFound()
        return Response(
            week(
                self.facility_id(),
                service_id,
                query_date(request, "date", timezone.localdate()),
                _uuid(request.query_params.get("membership_id")),
            )
        )


class StaffHoldView(StaffBookingView):
    permission_classes = [Needs(OPERATE)]

    @extend_schema(
        operation_id="staff_slot_hold",
        tags=TAGS,
        request=None,
        responses={201: s.HoldSerializer, 409: OpenApiResponse(s.SlotTakenSerializer)},
    )
    def post(self, request: Request, slot_id: Any) -> Response:
        if not Slot.objects.filter(pk=slot_id, facility_id=self.facility_id()).exists():
            raise exceptions.NotFound()
        try:
            h = slots.hold(slot_id, membership=self.principal().membership)
        except BookingConflict as exc:
            return slot_taken(exc, slot_id)
        return Response(
            {"hold_id": h.pk, "expires_at": h.expires_at}, status=status.HTTP_201_CREATED
        )


class StaffCancelView(StaffBookingView):
    permission_classes = [Needs(OPERATE)]

    @extend_schema(
        operation_id="staff_booking_cancel",
        tags=TAGS,
        request=s.StaffCancelSerializer,
        responses={200: s.StaffBookingSerializer},
    )
    def post(self, request: Request, booking_id: Any) -> Response:
        body = s.StaffCancelSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        self.booking(booking_id)
        b = svc.cancel(
            booking_id,
            version=body.validated_data["version"],
            who=self.who(),
            reason_code=body.validated_data["reason_code"],
        )
        return Response(staff_rows([b])[0])


class StaffRescheduleView(StaffBookingView):
    permission_classes = [Needs(OPERATE)]

    @extend_schema(
        operation_id="staff_booking_reschedule",
        tags=TAGS,
        request=s.RescheduleSerializer,
        responses={200: s.StaffBookingSerializer},
    )
    def post(self, request: Request, booking_id: Any) -> Response:
        body = s.RescheduleSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        self.booking(booking_id)
        b = svc.reschedule(
            booking_id,
            version=body.validated_data["version"],
            hold_id=body.validated_data["hold_id"],
            who=self.who(),
            language=_lang(request),
        )
        return Response(staff_rows([b])[0])


class ReverseNoShowView(StaffBookingView):
    permission_classes = [Needs(OPERATE)]

    @extend_schema(
        operation_id="staff_booking_reverse_no_show",
        tags=TAGS,
        request=s.ReverseNoShowSerializer,
        responses={200: s.StaffBookingSerializer},
    )
    def post(self, request: Request, booking_id: Any) -> Response:
        body = s.ReverseNoShowSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        self.booking(booking_id)
        b = svc.reverse_no_show(
            booking_id,
            version=body.validated_data["version"],
            who=self.who(),
            reason_code=body.validated_data["reason_code"],
            reason_text=body.validated_data.get("reason_text", ""),
        )
        return Response(staff_rows([b])[0])


def booked_record(booking: Booking, user: Any) -> FacilityPatient:
    """For the S4 check-in of a booking: the booking's facility record, created on first visit."""
    if booking.facility_patient_id:
        return FacilityPatient.objects.get(pk=booking.facility_patient_id)
    return facility_record(booking.facility_id, booking.patient_id, user)
