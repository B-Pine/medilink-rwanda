"""S4 endpoints (contract sprint-04 §3): staff queue, display, patient tracker."""

from __future__ import annotations

import datetime as dt
from typing import Any, cast

from django.db import connection
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import exceptions, status
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.accounts.models import User
from medilink.authz.permissions import IsPatientAuthenticated, PublicEndpoint
from medilink.facilities.models import Service, ServicePoint
from medilink.facilities.views_base import FacilityView, Needs, err
from medilink.patients.errors import PatientsAPIView
from medilink.patients.models import FacilityPatient
from medilink.patients.normalize import age_years
from medilink.scheduling.models import ScheduleTemplate
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import Facility
from medilink.uploads.views import idempotency_key
from medilink.visits import serializers as s
from medilink.visits import services
from medilink.visits.models import (
    ACTIVE_STATES,
    DisplayLink,
    DutyStatus,
    ReorderReview,
    Stage,
    Ticket,
    TicketEvent,
    TicketState,
    TravelTime,
    Visit,
)
from medilink.visits.services import Actor

TAGS = ["queue"]
OPERATE, CALL, DISPENSE, CONFIGURE = (
    "queue.operate",
    "queue.call",
    "pharmacy.dispense",
    "facility.configure",
)
STAGE_PERMISSION: dict[str, tuple[str, ...]] = {
    Stage.CONSULTATION: (CALL,),
    Stage.RECEPTION: (OPERATE,),
    Stage.PAYMENT: (OPERATE,),
    Stage.PHARMACY: (DISPENSE,),
}
OPERATE_ACTIONS = ("transfer", "cancel", "left", "step-out", "priority", "reorder")
SERVE_ACTIONS = ("recall", "no-response", "start", "hold", "return", "complete", "next-stage")


def short_name(full_name: str) -> str:
    """First name + initial of the last name: enough to call someone, less to overhear."""
    parts = full_name.split()
    if len(parts) < 2:
        return full_name
    return f"{parts[0]} {parts[-1][0]}."


class QueueView(FacilityView):
    def actor(self, client_occurred_at: dt.datetime | None = None) -> Actor:
        principal = self.principal()
        return Actor(
            user=self.request.user,
            membership=principal.membership,
            request=self.request,
            client_occurred_at=client_occurred_at,
        )

    def facility_id(self) -> Any:
        return self.principal().active_facility_id


def ticket_rows(tickets: list[Ticket], *, with_position: bool = False) -> list[dict[str, Any]]:
    today = services.today()
    points = {
        p.pk: p.name
        for p in ServicePoint.objects.filter(
            pk__in={t.service_point_id for t in tickets if t.service_point_id}
        )
    }
    rows = []
    for t in tickets:
        visit = t.visit
        patient = visit.patient
        flags = []
        if visit.is_emergency:
            flags.append("emergency")
        if visit.priority_class:
            flags.append(f"priority:{visit.priority_class}")
        if t.priority_rank == 1:
            flags.append("return")
        if t.step_out_until and t.step_out_until > timezone.now():
            flags.append("stepped_out")
        if t.no_response_count:
            flags.append("no_response")
        rows.append(
            {
                "id": t.pk,
                "visit_id": t.visit_id,
                "number": t.number,
                "state": t.state,
                "stage": t.stage,
                "service_id": t.service_id,
                "display_name": short_name(patient.preferred_name or patient.full_name),
                "age_years": age_years(patient.date_of_birth, today),
                "sex": patient.sex,
                "flags": flags,
                "priority_rank": t.priority_rank,
                "arrival_at": t.arrival_at,
                "called_at": t.called_at,
                "assigned_membership_id": t.assigned_membership_id,
                "service_point": points.get(t.service_point_id) if t.service_point_id else None,
                "step_out_until": t.step_out_until,
                "position": services.position(t) if with_position else None,
                "version": t.version,
            }
        )
    return rows


def duty_rows(facility_id: Any) -> list[dict[str, Any]]:
    rows = DutyStatus.objects.filter(facility_id=facility_id).select_related(
        "membership__user", "service_point"
    )
    return [
        {
            "membership_id": d.membership_id,
            "full_name": d.membership.user.full_name,
            "state": d.state,
            "service_point_id": d.service_point_id,
            "service_point": d.service_point.name if d.service_point else None,
            "until_at": d.until_at,
        }
        for d in rows
    ]


def estimate_data(value: services.Estimate) -> dict[str, Any]:
    return {
        "min": value.minimum,
        "max": value.maximum,
        "status": value.status,
        "until": value.until,
    }


def _tickets(**filters: Any) -> list[Ticket]:
    return list(
        Ticket.objects.filter(**filters)
        .select_related("visit__patient", "service")
        .order_by("priority_rank", "arrival_at", "sequence")
    )


class CheckInView(QueueView):
    permission_classes = [Needs(OPERATE)]

    @extend_schema(
        operation_id="staff_visits_check_in",
        tags=TAGS,
        request=s.CheckInSerializer,
        responses={
            200: s.CheckInResponseSerializer,
            201: s.CheckInResponseSerializer,
            422: err("Inactive record, service closed or missing reason"),
        },
    )
    def post(self, request: Request) -> Response:
        body = s.CheckInSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        facility_id = self.facility_id()
        booking = None
        record: FacilityPatient | None
        if data.get("booking_id"):
            from medilink.scheduling.models import Booking
            from medilink.scheduling.views_booking import booked_record

            booking = Booking.objects.filter(pk=data["booking_id"], facility_id=facility_id).first()
            if booking is None:
                raise exceptions.NotFound()
            record = booked_record(booking, request.user)
            service = Service.objects.filter(pk=booking.service_id).first()
        else:
            record = FacilityPatient.objects.filter(
                pk=data["facility_patient_id"], facility_id=facility_id
            ).first()
            service = Service.objects.filter(pk=data["service_id"], facility_id=facility_id).first()
        if record is None or service is None:
            raise exceptions.NotFound()
        visit, ticket, created = services.check_in(
            facility_id=facility_id,
            facility_patient=record,
            service=service,
            source=data["source"],
            actor=self.actor(),
            priority_class=data.get("priority_class"),
            priority_reason_code=data.get("priority_reason_code"),
            reason_text=data.get("reason_text"),
            insurance_profile_id=data.get("insurance_profile_id"),
            key=idempotency_key(request),
            booking=booking,
        )
        ticket = Ticket.objects.select_related("visit__patient", "service").get(pk=ticket.pk)
        return Response(
            {
                "visit_id": visit.pk,
                "created": created,
                "ticket": ticket_rows([ticket], with_position=True)[0],
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class BoardView(QueueView):
    permission_classes = [Needs(OPERATE, CALL, DISPENSE)]

    @extend_schema(
        operation_id="staff_queue_board",
        tags=TAGS,
        parameters=[OpenApiParameter("service_id", str), OpenApiParameter("stage", str)],
        responses={200: s.BoardSerializer},
    )
    def get(self, request: Request) -> Response:
        facility_id = self.facility_id()
        day = services.today()
        tickets = _tickets(facility_id=facility_id, service_date=day, state__in=ACTIVE_STATES)
        if request.query_params.get("service_id"):
            tickets = [
                t for t in tickets if str(t.service_id) == request.query_params["service_id"]
            ]
        if request.query_params.get("stage"):
            tickets = [t for t in tickets if t.stage == request.query_params["stage"]]
        groups: dict[tuple[Any, str], list[Ticket]] = {}
        for t in tickets:
            groups.setdefault((t.service_id, t.stage), []).append(t)
        queues = []
        for (service_id, stage), rows in sorted(
            groups.items(), key=lambda g: (str(g[0][0]), g[0][1])
        ):
            waiting = [t for t in rows if t.state == TicketState.WAITING]
            first = waiting[-1] if waiting else rows[0]
            queues.append(
                {
                    "service_id": service_id,
                    "stage": stage,
                    "waiting": ticket_rows(waiting, with_position=True),
                    "called": ticket_rows([t for t in rows if t.state == TicketState.CALLED]),
                    "in_service": ticket_rows(
                        [
                            t
                            for t in rows
                            if t.state in (TicketState.IN_SERVICE, TicketState.ON_HOLD)
                        ]
                    ),
                    "average_minutes": round(services.average_minutes(first), 1),
                    "estimate_next": estimate_data(services.estimate(first))
                    if waiting
                    else {"min": 0, "max": 5, "status": None, "until": None},
                }
            )
        return Response(
            {"queues": queues, "duty": duty_rows(facility_id), "updated_at": timezone.now()}
        )


def doctor_services(facility_id: Any, membership: Any) -> list[Any]:
    duty = DutyStatus.objects.filter(facility_id=facility_id, membership=membership).first()
    if duty and duty.service_point_id:
        ids = services.serving_point_services(facility_id, duty.service_point_id)
        if ids:
            return ids
    return list(
        ScheduleTemplate.objects.filter(
            facility_id=facility_id, membership=membership, ended_at__isnull=True
        )
        .values_list("service_id", flat=True)
        .distinct()
    ) or list(
        Service.objects.filter(facility_id=facility_id, is_active=True).values_list("pk", flat=True)
    )


class MineView(QueueView):
    permission_classes = [Needs(CALL)]

    @extend_schema(operation_id="staff_queue_mine", tags=TAGS, responses={200: s.MineSerializer})
    def get(self, request: Request) -> Response:
        facility_id = self.facility_id()
        membership = self.principal().membership
        service_ids = doctor_services(facility_id, membership)
        current = services._serving(facility_id, membership.pk if membership else None)
        waiting: list[Ticket] = []
        for service_id in service_ids:
            waiting.extend(
                services.waiting(
                    facility_id, service_id, Stage.CONSULTATION, membership_id=membership.pk
                ).select_related("visit__patient", "service")
            )
        waiting.sort(
            key=lambda t: (t.priority_rank, t.assigned_membership_id != membership.pk, t.arrival_at)
        )
        duty = [d for d in duty_rows(facility_id) if d["membership_id"] == membership.pk]
        current_row = None
        if current is not None:
            current = Ticket.objects.select_related("visit__patient", "service").get(pk=current.pk)
            current_row = ticket_rows([current])[0]
        return Response(
            {
                "current": current_row,
                "waiting": ticket_rows(waiting),
                "duty": duty[0] if duty else None,
                "service_ids": service_ids,
            }
        )


class CallNextView(QueueView):
    permission_classes = [Needs(CALL, OPERATE, DISPENSE)]

    @extend_schema(
        operation_id="staff_queue_call_next",
        tags=TAGS,
        request=s.CallNextSerializer,
        responses={
            200: s.TicketRowSerializer,
            204: OpenApiResponse(description="Nobody is waiting"),
            409: err("Already serving a patient"),
            422: err("Not on duty"),
        },
    )
    def post(self, request: Request) -> Response:
        body = s.CallNextSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        if not self.can(*STAGE_PERMISSION[data["stage"]]):
            raise exceptions.PermissionDenied()
        facility_id = self.facility_id()
        if not Service.objects.filter(pk=data["service_id"], facility_id=facility_id).exists():
            raise exceptions.NotFound()
        ticket = services.call_next(
            facility_id=facility_id,
            service_id=data["service_id"],
            stage=data["stage"],
            actor=self.actor(),
            service_point_id=data.get("service_point_id"),
        )
        if ticket is None:
            return Response(status=status.HTTP_204_NO_CONTENT)
        ticket = Ticket.objects.select_related("visit__patient", "service").get(pk=ticket.pk)
        return Response(ticket_rows([ticket])[0])


class TicketActionView(QueueView):
    permission_classes = [Needs(OPERATE, CALL, DISPENSE)]

    @extend_schema(
        operation_id="staff_ticket_action",
        tags=TAGS,
        request=s.TicketActionSerializer,
        responses={
            200: s.TicketRowSerializer,
            409: err("Stale version"),
            422: err("Not allowed in this state"),
        },
    )
    def post(self, request: Request, ticket_id: Any, action: str) -> Response:
        if action not in OPERATE_ACTIONS + SERVE_ACTIONS:
            raise exceptions.NotFound()
        ticket = Ticket.objects.filter(pk=ticket_id, facility_id=self.facility_id()).first()
        if ticket is None:
            raise exceptions.NotFound()
        needed = (OPERATE,) if action in OPERATE_ACTIONS else STAGE_PERMISSION[ticket.stage]
        if not self.can(*needed):
            raise exceptions.PermissionDenied()
        body = s.TicketActionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = dict(body.validated_data)
        result = services.act(
            ticket.pk,
            action,
            version=data.pop("version"),
            actor=self.actor(data.pop("client_occurred_at", None)),
            data=data,
        )
        result = Ticket.objects.select_related("visit__patient", "service").get(pk=result.pk)
        return Response(ticket_rows([result], with_position=True)[0])


class VisitDetailView(QueueView):
    permission_classes = [Needs(OPERATE, CALL)]

    @extend_schema(
        operation_id="staff_visit_detail", tags=TAGS, responses={200: s.VisitDetailSerializer}
    )
    def get(self, request: Request, visit_id: Any) -> Response:
        visit = (
            Visit.objects.filter(pk=visit_id, facility_id=self.facility_id())
            .select_related("patient")
            .first()
        )
        if visit is None:
            raise exceptions.NotFound()
        tickets = list(
            visit.tickets.select_related("visit__patient", "service").order_by("created_at")
        )
        events = (
            TicketEvent.objects.filter(ticket__visit=visit)
            .select_related("actor", "ticket")
            .order_by("occurred_at")
        )
        return Response(
            {
                "id": visit.pk,
                "facility_patient_id": visit.facility_patient_id,
                "display_name": visit.patient.preferred_name or visit.patient.full_name,
                "source": visit.source,
                "status": visit.status,
                "is_emergency": visit.is_emergency,
                "priority_class": visit.priority_class,
                "checked_in_at": visit.checked_in_at,
                "tickets": ticket_rows(tickets),
                "events": [
                    {
                        "id": e.pk,
                        "action": e.action,
                        "from_state": e.from_state,
                        "to_state": e.to_state,
                        "actor_name": e.actor.full_name if e.actor else None,
                        "reason_code": e.reason_code,
                        "occurred_at": e.occurred_at,
                        "ticket_number": e.ticket.number,
                    }
                    for e in events
                ],
            }
        )


class DutyView(QueueView):
    permission_classes = [Needs(CALL)]

    def _row(self) -> dict[str, Any] | None:
        membership = self.principal().membership
        rows = [d for d in duty_rows(self.facility_id()) if d["membership_id"] == membership.pk]
        return rows[0] if rows else None

    @extend_schema(
        operation_id="staff_duty_status", tags=TAGS, responses={200: s.DutyRowSerializer}
    )
    def get(self, request: Request) -> Response:
        membership = self.principal().membership
        return Response(
            self._row()
            or {
                "membership_id": membership.pk,
                "full_name": cast(User, request.user).full_name,
                "state": "off",
                "service_point_id": None,
                "service_point": None,
                "until_at": None,
            }
        )

    @extend_schema(
        operation_id="staff_duty_status_update",
        tags=TAGS,
        request=s.DutyUpdateSerializer,
        responses={200: s.DutyRowSerializer},
    )
    def put(self, request: Request) -> Response:
        body = s.DutyUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        services.set_duty(
            facility_id=self.facility_id(),
            membership=self.principal().membership,
            state=body.validated_data["state"],
            service_point_id=body.validated_data.get("service_point_id"),
            until_at=body.validated_data.get("until_at"),
        )
        return Response(self._row())


class ReordersView(QueueView):
    permission_classes = [Needs(CONFIGURE)]

    @extend_schema(
        operation_id="staff_queue_reorders",
        tags=TAGS,
        parameters=[OpenApiParameter("reviewed", bool)],
        responses={200: s.ReorderRowSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        rows = (
            TicketEvent.objects.filter(facility_id=self.facility_id(), action="reorder")
            .select_related("actor", "ticket")
            .order_by("-occurred_at")
        )
        reviewed = set(
            ReorderReview.objects.filter(facility_id=self.facility_id()).values_list(
                "ticket_event_id", flat=True
            )
        )
        flag = request.query_params.get("reviewed")
        if flag in ("true", "false"):
            rows = (
                rows.exclude(pk__in=reviewed) if flag == "false" else rows.filter(pk__in=reviewed)
            )
        return Response(
            {
                "results": [
                    {
                        "event_id": e.pk,
                        "ticket_number": e.ticket.number,
                        "actor_name": e.actor.full_name if e.actor else None,
                        "reason_code": e.reason_code,
                        "reason_text": e.reason_text,
                        "old_position": e.metadata.get("old_position"),
                        "new_position": e.metadata.get("new_position"),
                        "occurred_at": e.occurred_at,
                        "reviewed": e.pk in reviewed,
                    }
                    for e in rows[:200]
                ]
            }
        )


class ReorderReviewView(QueueView):
    permission_classes = [Needs(CONFIGURE)]

    @extend_schema(
        operation_id="staff_queue_reorder_review",
        tags=TAGS,
        request=s.ReviewSerializer,
        responses={201: OpenApiResponse(description="Reviewed"), 409: err("Already reviewed")},
    )
    def post(self, request: Request, event_id: Any) -> Response:
        from medilink.audit.services import record
        from medilink.core.exceptions import Conflict

        event = TicketEvent.objects.filter(
            pk=event_id, facility_id=self.facility_id(), action="reorder"
        ).first()
        if event is None:
            raise exceptions.NotFound()
        body = s.ReviewSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        if ReorderReview.objects.filter(ticket_event=event).exists():
            raise Conflict()
        ReorderReview.objects.create(
            facility_id=event.facility_id,
            ticket_event=event,
            reviewed_by=cast(User, request.user),
            reviewed_at=timezone.now(),
            comment=body.validated_data["comment"],
        )
        record(
            "visits.reorder.review",
            request=request,
            facility_id=event.facility_id,
            object_type="visits.ticket_event",
            object_id=event.pk,
        )
        return Response(status=status.HTTP_201_CREATED)


def link_data(link: DisplayLink) -> dict[str, Any]:
    return {
        "id": link.pk,
        "label": link.label,
        "service_ids": link.service_ids,
        "revoked_at": link.revoked_at,
        "last_seen_at": link.last_seen_at,
        "created_at": link.created_at,
    }


class DisplayLinksView(QueueView):
    permission_classes = [Needs(CONFIGURE)]

    @extend_schema(
        operation_id="staff_display_links",
        tags=TAGS,
        responses={200: s.DisplayLinkSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        rows = DisplayLink.objects.filter(facility_id=self.facility_id()).order_by("-created_at")
        return Response({"results": [link_data(link) for link in rows]})

    @extend_schema(
        operation_id="staff_display_links_create",
        tags=TAGS,
        request=s.DisplayLinkCreateSerializer,
        responses={201: s.DisplayLinkCreatedSerializer},
    )
    def post(self, request: Request) -> Response:
        body = s.DisplayLinkCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        link, token = services.create_display_link(
            facility_id=self.facility_id(),
            label=body.validated_data["label"],
            service_ids=body.validated_data["service_ids"],
            actor=request.user,
            request=request,
        )
        return Response({"link": link_data(link), "token": token}, status=status.HTTP_201_CREATED)


class DisplayLinkRevokeView(QueueView):
    permission_classes = [Needs(CONFIGURE)]

    @extend_schema(
        operation_id="staff_display_link_revoke",
        tags=TAGS,
        request=None,
        responses={200: s.DisplayLinkSerializer},
    )
    def post(self, request: Request, link_id: Any) -> Response:
        link = DisplayLink.objects.filter(pk=link_id, facility_id=self.facility_id()).first()
        if link is None:
            raise exceptions.NotFound()
        return Response(link_data(services.revoke_display_link(link, request=request)))


# ---- display (public, token) --------------------------------------------------------------------


def find_display_link(token: str) -> DisplayLink | None:
    """Resolve a display token without a facility context (SECURITY DEFINER lookup by hash)."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT * FROM visits_find_display_link(%s)", [services.hash_token(token)])
        row = cursor.fetchone()
    if row is None:
        return None
    with rls_context(facility_id=row[1]):
        return DisplayLink.objects.filter(pk=row[0], revoked_at__isnull=True).first()


def display_payload(link: DisplayLink) -> dict[str, Any]:
    facility = Facility.objects.get(pk=link.facility_id)
    out = []
    day = services.today()
    points = {p.pk: p.name for p in ServicePoint.objects.filter(facility_id=link.facility_id)}
    for service in Service.objects.filter(pk__in=link.service_ids, facility_id=link.facility_id):
        called = Ticket.objects.filter(
            facility_id=link.facility_id,
            service=service,
            service_date=day,
            state__in=(TicketState.CALLED, TicketState.IN_SERVICE),
        ).order_by("-called_at")[:4]
        nxt = services.waiting(link.facility_id, service.pk, Stage.CONSULTATION).values_list(
            "number", flat=True
        )[:5]
        out.append(
            {
                "service_id": service.pk,
                "name_i18n": service.name_i18n,
                "now_serving": [
                    {
                        "number": t.number,
                        "service_point": points.get(t.service_point_id)
                        if t.service_point_id
                        else None,
                        "state": t.state,
                    }
                    for t in called
                ],
                "next": list(nxt),
            }
        )
    return {"facility_name": facility.name, "services": out, "updated_at": timezone.now()}


class DisplayView(PatientsAPIView):
    permission_classes = [PublicEndpoint]
    authentication_classes: list[Any] = []

    @extend_schema(
        operation_id="display_board",
        tags=TAGS,
        responses={200: s.DisplaySerializer, 404: err("Unknown or revoked display link")},
    )
    def get(self, request: Request, token: str) -> Response:
        link = find_display_link(token)
        if link is None:
            raise exceptions.NotFound()
        with rls_context(facility_id=link.facility_id):
            DisplayLink.objects.filter(pk=link.pk).update(last_seen_at=timezone.now())
            payload = display_payload(link)
        response = Response(payload)
        response["Cache-Control"] = "no-store"
        return response


# ---- patient tracker -----------------------------------------------------------------------------


def patient_active(account_id: Any) -> list[tuple[Any, Any]]:
    """(visit_id, facility_id) of today's open visits of the account's own and guarded profiles."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT visit_id, facility_id FROM visits_patient_active(%s)", [account_id])
        return cursor.fetchall()


def tracker_data(visit: Visit, account: Any) -> dict[str, Any] | None:
    ticket = (
        visit.tickets.filter(state__in=ACTIVE_STATES)
        .select_related("service")
        .order_by("-created_at")
        .first()
    )
    if ticket is None:
        return None
    value = services.estimate(ticket)
    services.remember_estimate(ticket, value)
    travel = TravelTime.objects.filter(account=account, facility_id=visit.facility_id).first()
    leave_by = None
    if travel and value.minimum is not None and ticket.state == TicketState.WAITING:
        leave_by = timezone.now() + dt.timedelta(minutes=value.minimum - travel.minutes - 10)
    point = (
        ServicePoint.objects.filter(pk=ticket.service_point_id).first()
        if ticket.service_point_id
        else None
    )
    facility = Facility.objects.get(pk=visit.facility_id)
    patient = visit.patient
    return {
        "visit_id": visit.pk,
        "patient_id": visit.patient_id,
        "patient_display_name": patient.preferred_name or patient.full_name,
        "facility_id": visit.facility_id,
        "facility_name": facility.name,
        "service_name_i18n": ticket.service.name_i18n,
        "ticket_number": ticket.number,
        "state": ticket.state,
        "stage": ticket.stage,
        "service_point": point.name if point else None,
        "ahead": value.ahead,
        "estimate": estimate_data(value),
        "leave_by": leave_by,
        "travel_minutes": travel.minutes if travel else None,
        "version": ticket.version,
        "updated_at": timezone.now(),
    }


class PatientVisitsView(PatientsAPIView):
    permission_classes = [IsPatientAuthenticated]

    @extend_schema(
        operation_id="patient_visits_active",
        tags=TAGS,
        responses={200: s.PatientVisitSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        results = []
        for visit_id, facility_id in patient_active(request.user.pk):
            with rls_context(facility_id=facility_id, user_id=request.user.pk):
                visit = Visit.objects.select_related("patient").filter(pk=visit_id).first()
                data = tracker_data(visit, request.user) if visit else None
            if data:
                results.append(data)
        return Response({"results": results})


class PatientVisitCancelView(PatientsAPIView):
    permission_classes = [IsPatientAuthenticated]

    @extend_schema(
        operation_id="patient_visit_cancel",
        tags=TAGS,
        request=None,
        responses={
            200: s.PatientVisitSerializer,
            422: err("Only a waiting ticket can be cancelled"),
        },
    )
    def post(self, request: Request, visit_id: Any) -> Response:
        match = [f for v, f in patient_active(request.user.pk) if str(v) == str(visit_id)]
        if not match:
            raise exceptions.NotFound()
        with rls_context(facility_id=match[0], user_id=request.user.pk):
            visit = Visit.objects.select_related("patient").get(pk=visit_id)
            ticket = services.active_ticket(visit)
            if ticket is None:
                raise exceptions.NotFound()
            services.act(
                ticket.pk,
                "cancel",
                version=ticket.version,
                actor=Actor(user=request.user, membership=None, request=request),
                data={"reason_code": "patient_request"},
            )
            visit.refresh_from_db()
            data = tracker_data(visit, request.user)
        return Response(data or {"visit_id": visit_id})


class TravelTimeView(PatientsAPIView):
    permission_classes = [IsPatientAuthenticated]

    @extend_schema(
        operation_id="patient_travel_time", tags=TAGS, responses={200: s.TravelTimeSerializer}
    )
    def get(self, request: Request, facility_id: Any) -> Response:
        row = TravelTime.objects.filter(
            account=cast(User, request.user), facility_id=facility_id
        ).first()
        return Response({"minutes": row.minutes if row else None})

    @extend_schema(
        operation_id="patient_travel_time_update",
        tags=TAGS,
        request=s.TravelTimeSerializer,
        responses={200: s.TravelTimeSerializer},
    )
    def put(self, request: Request, facility_id: Any) -> Response:
        body = s.TravelTimeSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        if not Facility.objects.filter(pk=facility_id).exists():
            raise exceptions.NotFound()
        TravelTime.objects.update_or_create(
            account=cast(User, request.user),
            facility_id=facility_id,
            defaults={"minutes": body.validated_data["minutes"]},
        )
        return Response({"minutes": body.validated_data["minutes"]})
