"""S5b endpoints (contract sprint-05 §3): disruptions (R7), follow-ups (R8), the reception calendar
(R9), the patient's answer to a disruption offer (B10) and the private calendar feed (B11)."""

from __future__ import annotations

import datetime as dt
from collections import Counter
from typing import Any, cast

from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import exceptions, status
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.authz.permissions import PublicEndpoint
from medilink.facilities.calendar import KIGALI
from medilink.facilities.models import Service
from medilink.facilities.views_base import Needs, err, query_date
from medilink.patients.errors import PatientsAPIView
from medilink.scheduling import booking as svc
from medilink.scheduling import calendar_feed, disruptions, follow_ups
from medilink.scheduling import disruption_serializers as s
from medilink.scheduling.booking_serializers import BookingSerializer
from medilink.scheduling.models import (
    Booking,
    BookingStatus,
    Disruption,
    DisruptionItem,
    FollowUp,
    PatientResponse,
    Slot,
)
from medilink.scheduling.services import blocks
from medilink.scheduling.views_booking import (
    PatientView,
    StaffBookingView,
    _lang,
    _names,
    _scalar,
    _uuid,
    booking_data,
    ics,
    staff_rows,
)
from medilink.tenancy.context import rls_context
from medilink.visits.models import Ticket, Visit
from medilink.visits.views import short_name

TAGS = ["booking"]
MANAGE, VIEW, CALL, OPERATE = "schedule.manage", "schedule.view", "queue.call", "queue.operate"
MAX_CALENDAR_DAYS = 31
CALENDAR_STATUSES = (BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.NO_SHOW)


# ---- R7 disruptions ----------------------------------------------------------------------------


def disruption_data(d: Disruption, counts: Counter[str] | None = None) -> dict[str, Any]:
    if counts is None:
        counts = _counts([d.pk])[d.pk]
    service = Service.objects.filter(pk=d.service_id).first() if d.service_id else None
    creator = d.created_by.full_name if d.created_by_id and d.created_by else None
    return {
        "id": d.pk,
        "kind": d.kind,
        "membership_id": d.membership_id,
        "doctor": _names({d.membership_id}).get(d.membership_id) if d.membership_id else None,
        "service_id": d.service_id,
        "service_name_i18n": service.name_i18n if service else None,
        "starts_at": d.starts_at,
        "ends_at": d.ends_at,
        "reason": d.reason,
        "status": d.status,
        "created_by": creator,
        "created_at": d.created_at,
        "resolved_at": d.resolved_at,
        "counts": {
            "total": counts["total"],
            "not_applied": counts["not_applied"],
            "pending": counts[PatientResponse.PENDING],
            "accepted": counts[PatientResponse.ACCEPTED],
            "declined": counts[PatientResponse.DECLINED],
            "rebooked_other": counts[PatientResponse.REBOOKED_OTHER],
            "cancelled": counts[PatientResponse.CANCELLED],
        },
        "version": d.version,
    }


def _counts(ids: list[Any]) -> dict[Any, Counter[str]]:
    out: dict[Any, Counter[str]] = {i: Counter() for i in ids}
    rows = DisruptionItem.objects.filter(disruption_id__in=ids).values_list(
        "disruption_id", "action", "patient_response", "resolved_at"
    )
    for disruption_id, action, response, resolved_at in rows:
        c = out[disruption_id]
        c["total"] += 1
        if action is None and resolved_at is None:
            c["not_applied"] += 1
        else:
            c[response] += 1
    return out


def item_rows(items: list[DisruptionItem]) -> list[dict[str, Any]]:
    booking_ids = [i.booking_id for i in items if i.booking_id]
    ticket_ids = [i.ticket_id for i in items if i.ticket_id]
    found = {b.pk: b for b in Booking.objects.filter(pk__in=booking_ids)}
    rows_by_booking = {r["id"]: r for r in staff_rows(list(found.values()))}
    tickets = {
        t.pk: t for t in Ticket.objects.filter(pk__in=ticket_ids).select_related("visit__patient")
    }
    names = _names(
        {i.previous_membership_id for i in items if i.previous_membership_id}
        | {t.assigned_membership_id for t in tickets.values() if t.assigned_membership_id}
    )
    out = []
    for i in items:
        row: dict[str, Any] = {
            "id": i.pk,
            "target": "booking" if i.booking_id else "ticket",
            "booking_id": i.booking_id,
            "booking_code": None,
            "ticket_id": i.ticket_id,
            "ticket_number": None,
            "previous_starts_at": i.previous_starts_at,
            "previous_doctor": names.get(i.previous_membership_id),
            "action": i.action,
            "patient_response": i.patient_response,
            "reply_by": None,
            "auto_accept": None,
            "new_booking_id": i.new_booking_id,
            "applied_at": i.applied_at,
            "resolved_at": i.resolved_at,
            "version": i.version,
        }
        if i.booking_id:
            b, r = found[i.booking_id], rows_by_booking[i.booking_id]
            change = b.pending_change or {}
            row.update(
                booking_code=b.booking_code,
                facility_patient_id=b.facility_patient_id,
                display_name=r["display_name"],
                contact_phone=b.contact_phone_e164,
                service_id=b.service_id,
                starts_at=b.starts_at,
                doctor=r["doctor"],
                reply_by=change.get("reply_by"),
                auto_accept=change.get("auto_accept"),
            )
        else:
            t = tickets[cast(Any, i.ticket_id)]
            patient = t.visit.patient
            row.update(
                ticket_number=t.number,
                facility_patient_id=t.visit.facility_patient_id,
                display_name=short_name(patient.preferred_name or patient.full_name),
                contact_phone=None,
                service_id=t.service_id,
                starts_at=t.arrival_at,
                doctor=names.get(t.assigned_membership_id),
            )
        out.append(row)
    return out


def detail(d: Disruption, problems: dict[str, str] | None = None) -> dict[str, Any]:
    items = list(d.items.order_by("created_at"))
    out: dict[str, Any] = {"disruption": disruption_data(d), "items": item_rows(items)}
    if problems is not None:
        out["problems"] = problems
    return out


class DisruptionsView(StaffBookingView):
    permission_classes = [Needs(MANAGE)]

    @extend_schema(
        operation_id="staff_disruptions",
        tags=TAGS,
        parameters=[OpenApiParameter("status", str, enum=["open", "resolved"])],
        responses={200: s.DisruptionPageSerializer},
    )
    def get(self, request: Request) -> Response:
        qs = Disruption.objects.filter(facility_id=self.facility_id()).select_related("created_by")
        wanted = request.query_params.get("status")
        if wanted:
            qs = qs.filter(status=wanted)
        rows = list(qs.order_by("-starts_at")[:100])
        counts = _counts([d.pk for d in rows])
        return Response(
            {"count": len(rows), "results": [disruption_data(d, counts[d.pk]) for d in rows]}
        )

    @extend_schema(
        operation_id="staff_disruption_create",
        tags=TAGS,
        request=s.DisruptionCreateSerializer,
        responses={201: s.DisruptionDetailSerializer, 422: err("Window or doctor not valid")},
        description="FR-SCH-14. Closes the open slots in scope and lists the affected confirmed "
        "bookings and today's waiting remote tickets.",
    )
    def post(self, request: Request) -> Response:
        body = s.DisruptionCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        d = disruptions.create(
            facility_id=self.facility_id(),
            kind=data["kind"],
            membership_id=data.get("membership_id"),
            service_id=data.get("service_id"),
            starts_at=data["starts_at"],
            ends_at=data["ends_at"],
            reason=data["reason"],
            who=self.who(),
        )
        return Response(detail(d), status=status.HTTP_201_CREATED)


class DisruptionView(StaffBookingView):
    permission_classes = [Needs(MANAGE)]

    def disruption(self, disruption_id: Any) -> Disruption:
        d = Disruption.objects.filter(pk=disruption_id, facility_id=self.facility_id()).first()
        if d is None:
            raise exceptions.NotFound()
        return d

    @extend_schema(
        operation_id="staff_disruption", tags=TAGS, responses={200: s.DisruptionDetailSerializer}
    )
    def get(self, request: Request, disruption_id: Any) -> Response:
        return Response(detail(self.disruption(disruption_id)))


class DisruptionApplyView(DisruptionView):
    @extend_schema(
        operation_id="staff_disruption_apply",
        tags=TAGS,
        request=s.DisruptionApplySerializer,
        responses={200: s.DisruptionDetailSerializer, 422: err("Already resolved")},
        description="One action per item, or `all` for every item not yet applied. Items that "
        "can't be changed are listed in `problems` with a code; the others go ahead.",
    )
    def post(self, request: Request, disruption_id: Any) -> Response:
        self.disruption(disruption_id)
        body = s.DisruptionApplySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        steps = None
        if "items" in data:
            steps = [
                disruptions.Step(i["id"], i["action"], i.get("membership_id"))
                for i in data["items"]
            ]
        d, problems = disruptions.apply(
            disruption_id,
            who=self.who(),
            steps=steps,
            all_action=data.get("all"),
            membership_id=data.get("membership_id"),
        )
        d.refresh_from_db()
        return Response(detail(d, problems))


# ---- R8 follow-up ------------------------------------------------------------------------------


def follow_up_data(fu: FollowUp) -> dict[str, Any]:
    booking = Booking.objects.filter(pk=fu.booking_id).first() if fu.booking_id else None
    return {
        "id": fu.pk,
        "visit_id": fu.visit_id,
        "due_on": fu.due_on,
        "mode": fu.mode,
        "status": fu.status,
        "booking": staff_rows([booking])[0] if booking else None,
        "created_at": fu.created_at,
        "version": fu.version,
    }


class FollowUpView(StaffBookingView):
    permission_classes = [Needs(CALL)]

    def visit(self, visit_id: Any) -> Visit:
        visit = Visit.objects.filter(pk=visit_id, facility_id=self.facility_id()).first()
        if visit is None:
            raise exceptions.NotFound()
        return visit

    @extend_schema(
        operation_id="staff_visit_follow_up",
        tags=TAGS,
        responses={200: s.FollowUpSerializer, 404: err("No follow-up for this visit")},
    )
    def get(self, request: Request, visit_id: Any) -> Response:
        fu = FollowUp.objects.filter(visit=self.visit(visit_id)).first()
        if fu is None:
            raise exceptions.NotFound()
        return Response(follow_up_data(fu))

    @extend_schema(
        operation_id="staff_visit_follow_up_create",
        tags=TAGS,
        request=s.FollowUpCreateSerializer,
        responses={201: s.FollowUpSerializer, 409: err("follow_up_exists")},
        description="FR-SCH-15. `booking` books the first open slot on or after the day (same "
        "service, the same doctor when possible); `status=no_slot` when none is free.",
    )
    def post(self, request: Request, visit_id: Any) -> Response:
        body = s.FollowUpCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        fu = follow_ups.create(
            visit=self.visit(visit_id),
            in_days=body.validated_data["in_days"],
            mode=body.validated_data["mode"],
            who=self.who(),
        )
        return Response(follow_up_data(fu), status=status.HTTP_201_CREATED)


# ---- R9 reception and doctor calendar ------------------------------------------------------------


class StaffCalendarView(StaffBookingView):
    # Doctors hold queue.call, not schedule.view, in the S0 grants: they get their own calendar
    permission_classes = [Needs(VIEW, CALL)]

    @extend_schema(
        operation_id="staff_calendar",
        tags=TAGS,
        parameters=[
            OpenApiParameter("from", str, description="YYYY-MM-DD, default today"),
            OpenApiParameter("to", str, description="YYYY-MM-DD, default from the view"),
            OpenApiParameter("view", str, enum=["day", "week"]),
            OpenApiParameter("service_id", str),
            OpenApiParameter("membership_id", str),
        ],
        responses={200: s.StaffCalendarSerializer},
        description="FR-SCH-12. Staff without queue.operate or schedule.manage (doctors) see "
        "only their own calendar.",
    )
    def get(self, request: Request) -> Response:
        view = request.query_params.get("view", "week")
        if view not in ("day", "week"):
            raise exceptions.ValidationError({"view": ["Use day or week."]})
        start = query_date(request, "from", timezone.localdate())
        end = query_date(request, "to", start + dt.timedelta(days=0 if view == "day" else 6))
        if end < start or (end - start).days >= MAX_CALENDAR_DAYS:
            raise exceptions.ValidationError({"to": ["Choose at most 31 days."]})
        facility_id = self.facility_id()
        service_id = _uuid(request.query_params.get("service_id"))
        membership_id = _uuid(request.query_params.get("membership_id"))
        only_own = not self.can(OPERATE, MANAGE)
        if only_own:
            membership = self.principal().membership
            membership_id = membership.pk if membership else None

        def wanted(sid: Any, mid: Any) -> bool:
            return (not service_id or str(sid) == str(service_id)) and (
                not membership_id or str(mid) == str(membership_id)
            )

        begin = dt.datetime.combine(start, dt.time.min, KIGALI)
        finish = dt.datetime.combine(end + dt.timedelta(days=1), dt.time.min, KIGALI)
        all_blocks = blocks(facility_id, start, end)
        chosen = [b for b in all_blocks if wanted(b["service_id"], b["membership_id"])]
        qs = Booking.objects.filter(
            facility_id=facility_id,
            starts_at__gte=begin,
            starts_at__lt=finish,
            status__in=CALENDAR_STATUSES,
        )
        if service_id:
            qs = qs.filter(service_id=service_id)
        if membership_id:
            qs = qs.filter(membership_id=membership_id)
        found = list(qs.order_by("starts_at", "booking_code")[:2000])
        rows = {r["id"]: r for r in staff_rows(found)}
        slots = list(
            Slot.objects.filter(
                facility_id=facility_id, starts_at__gte=begin, starts_at__lt=finish
            ).values_list("service_id", "membership_id", "starts_at", "bookable_capacity")
        )
        names = _names({b["membership_id"] for b in all_blocks} | {b.membership_id for b in found})
        days: dict[dt.date, dict[str, Any]] = {
            start + dt.timedelta(days=i): {"blocks": [], "other_bookings": []}
            for i in range((end - start).days + 1)
        }
        placed: set[Any] = set()
        for block in chosen:
            inside = [
                b
                for b in found
                if str(b.service_id) == block["service_id"]
                and str(b.membership_id) == str(block["membership_id"])
                and block["starts_at"] <= b.starts_at < block["ends_at"]
            ]
            placed |= {b.pk for b in inside}
            capacity = sum(
                cap
                for sid, mid, at, cap in slots
                if str(sid) == block["service_id"]
                and str(mid) == str(block["membership_id"])
                and block["starts_at"] <= at < block["ends_at"]
            )
            day = block["starts_at"].astimezone(KIGALI).date()
            if day in days:
                days[day]["blocks"].append(
                    {
                        "service_id": block["service_id"],
                        "membership_id": block["membership_id"],
                        "doctor": names.get(_uuid(block["membership_id"])),
                        "starts_at": block["starts_at"],
                        "ends_at": block["ends_at"],
                        "capacity": capacity,
                        "booked": sum(1 for b in inside if b.status != BookingStatus.NO_SHOW),
                        "bookings": [rows[b.pk] for b in inside],
                    }
                )
        for b in found:
            if b.pk not in placed:
                day = b.starts_at.astimezone(KIGALI).date()
                if day in days:
                    days[day]["other_bookings"].append(rows[b.pk])
        doctor_ids = {b["membership_id"] for b in all_blocks}
        overlapping = Disruption.objects.filter(
            facility_id=facility_id, starts_at__lt=finish, ends_at__gt=begin
        ).order_by("starts_at")
        return Response(
            {
                "view": view,
                "from_date": start,
                "to_date": end,
                "only_own": only_own,
                "services": [
                    {"id": sv.pk, "name_i18n": sv.name_i18n}
                    for sv in Service.objects.filter(
                        facility_id=facility_id, is_active=True, is_bookable=True
                    ).order_by("catalogue_item_code")
                ],
                "doctors": sorted(
                    (
                        {"id": mid, "name": names.get(_uuid(mid), "")}
                        for mid in doctor_ids
                        if not only_own or str(mid) == str(membership_id)
                    ),
                    key=lambda d: d["name"],
                ),
                "days": [{"date": d, **v} for d, v in sorted(days.items())],
                "disruptions": [
                    {
                        "id": d.pk,
                        "kind": d.kind,
                        "membership_id": d.membership_id,
                        "service_id": d.service_id,
                        "starts_at": d.starts_at,
                        "ends_at": d.ends_at,
                        "status": d.status,
                    }
                    for d in overlapping
                    if wanted(d.service_id or service_id, d.membership_id or membership_id)
                ],
            }
        )


# ---- B10 patient answer to a disruption offer ----------------------------------------------------


class PatientRespondView(PatientView):
    @extend_schema(
        operation_id="patient_booking_respond",
        tags=TAGS,
        request=s.RespondSerializer,
        responses={
            200: OpenApiResponse(BookingSerializer, "The booking (for hold_id: the new one)"),
            409: err("Stale version"),
            422: err("no_offer, hold_expired"),
        },
        description="Accept the moved time, cancel (never a late cancellation) or choose another "
        "time with a hold (FR-SCH-14).",
    )
    def post(self, request: Request, booking_id: Any) -> Response:
        body = s.RespondSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        facility_id = self.booking_facility(booking_id)
        if "hold_id" in data:
            hold_facility = _scalar(
                "SELECT scheduling_hold_facility(%s, %s)", [data["hold_id"], self.user().pk]
            )
            if hold_facility is None or str(hold_facility) != str(facility_id):
                raise svc.BookingRule(svc.HOLD_EXPIRED, "hold_expired")
        with rls_context(facility_id=facility_id, user_id=self.user().pk):
            booking = Booking.objects.get(pk=booking_id)
            self.own_booking(booking)
            disruptions.require_offer(booking)
            version = data.get("version")
            if data.get("response") == "accept":
                result = disruptions.accept(booking.pk, version=version, who=self.who())
            elif data.get("response") == "cancel":
                result = svc.cancel(booking.pk, version=version, who=self.who())
            else:
                result = svc.reschedule(
                    booking.pk,
                    version=version,
                    hold_id=data["hold_id"],
                    who=self.who(),
                    language=_lang(request),
                )
            return Response(booking_data(result))


# ---- B11 calendar feed ---------------------------------------------------------------------------


def feed_url(request: Request, token: str) -> str:
    return request.build_absolute_uri(f"/api/v1/calendar/{token}.ics")


class PatientCalendarFeedView(PatientView):
    @extend_schema(
        operation_id="patient_calendar_feed", tags=TAGS, responses={200: s.CalendarFeedSerializer}
    )
    def get(self, request: Request) -> Response:
        feed = calendar_feed.active(self.user())
        return Response(
            {
                "is_active": feed is not None,
                "created_at": feed.created_at if feed else None,
                "last_accessed_at": feed.last_accessed_at if feed else None,
            }
        )

    @extend_schema(
        operation_id="patient_calendar_feed_create",
        tags=TAGS,
        request=None,
        responses={201: s.CalendarFeedCreatedSerializer},
        description="A new private link, shown once; the previous link stops working.",
    )
    def post(self, request: Request) -> Response:
        feed, token = calendar_feed.create(self.user(), request)
        response = Response(
            {"url": feed_url(request, token), "created_at": feed.created_at},
            status=status.HTTP_201_CREATED,
        )
        response["Cache-Control"] = "no-store"
        return response

    @extend_schema(operation_id="patient_calendar_feed_revoke", tags=TAGS, responses={204: None})
    def delete(self, request: Request) -> Response:
        calendar_feed.revoke(self.user(), request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CalendarFeedIcsView(PatientsAPIView):
    permission_classes = [PublicEndpoint]
    authentication_classes: list[Any] = []

    @extend_schema(
        operation_id="calendar_feed_ics",
        tags=TAGS,
        responses={
            (200, "text/calendar"): OpenApiResponse(description="iCalendar feed"),
            404: err("Unknown or revoked link"),
        },
        description="Public with the token (D-6). Facility, service, time and booking code only.",
    )
    def get(self, request: Request, token: str) -> HttpResponse:
        account_id = calendar_feed.find(token)
        if account_id is None:
            raise exceptions.NotFound()
        calendar_feed.touch(account_id)
        rows = []
        for booking_id, facility_id in calendar_feed.booking_refs(account_id):
            with rls_context(facility_id=facility_id, user_id=account_id):
                b = Booking.objects.filter(pk=booking_id).first()
                if b is not None:
                    rows.append(booking_data(b))
        response = HttpResponse(ics(rows), content_type="text/calendar; charset=utf-8")
        response["Cache-Control"] = "private, no-store"
        return response
