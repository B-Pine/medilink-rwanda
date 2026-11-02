"""S10 part 2a endpoints (contract sprint-10b §3): patient P1-P5, staff S1-S8, platform PL1-PL2.

Patients and platform admins reach disputes in other facilities through SECURITY DEFINER
listings, then read each one in its facility's RLS context. Patient shapes never carry internal
notes or staff comments.
"""

from __future__ import annotations

from typing import Any

from django.db import connection
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import exceptions, status
from rest_framework.request import Request
from rest_framework.response import Response

from medilink.authz.permissions import IsPatientAuthenticated, IsPlatformAdmin
from medilink.authz.stepup import has_recent_auth
from medilink.core.exceptions import StepUpRequired
from medilink.core.pagination import DefaultPagination
from medilink.disputes import serializers as s
from medilink.disputes import services
from medilink.disputes.models import (
    AuthorRole,
    Dispute,
    DisputeStatus,
    Outcome,
    Visibility,
)
from medilink.facilities.views_base import FacilityView, Needs, err, paginated
from medilink.patients.errors import PatientsAPIView
from medilink.patients.models import FacilityPatient
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import Facility

TAGS = ["disputes"]
HANDLE, COMMENT, COUNTER = "disputes.handle", "disputes.comment", "queue.operate"
STALE = err("Stale version: reload and try again")


def _name(user: Any) -> str:
    return str(user.full_name) if user is not None else ""


def _load(dispute_id: Any) -> Dispute:
    return (
        Dispute.objects.select_related("patient")
        .prefetch_related(
            "messages__author_user",
            "events__actor",
            "evidence",
            "actions",
            "comment_requests__requested_membership__user",
        )
        .get(pk=dispute_id)
    )


def _row(d: Dispute, facility_name: str) -> dict[str, Any]:
    now = timezone.now()
    overdue = (
        d.status in (DisputeStatus.OPEN, DisputeStatus.REOPENED) and d.acknowledge_by < now
    ) or (
        d.decide_by is not None
        and d.status
        in (DisputeStatus.ACKNOWLEDGED, DisputeStatus.UNDER_REVIEW, DisputeStatus.INFO_REQUESTED)
        and d.decide_by < now
    )
    return {
        "id": d.pk,
        "patient_id": d.patient_id,
        "patient_display_name": str(d.patient.preferred_name or d.patient.full_name),
        "facility_name": facility_name,
        "channel": d.channel,
        "type": d.type,
        "subject_type": d.subject_type,
        "subject_id": d.subject_id,
        "subject_snapshot": {k: v for k, v in d.subject_snapshot.items() if k != "consultation_id"},
        "status": d.status,
        "handler_level": d.handler_level,
        "acknowledge_by": d.acknowledge_by,
        "decide_by": d.decide_by,
        "is_overdue": overdue,
        "outcome": d.outcome,
        "created_at": d.created_at,
        "version": d.version,
    }


def _messages(d: Dispute, *, staff: bool) -> list[dict[str, Any]]:
    return [
        {
            "id": m.pk,
            "author_name": _name(m.author_user),
            "author_role": m.author_role,
            "visibility": m.visibility,
            "body": services.body(m),
            "created_at": m.created_at,
        }
        for m in d.messages.all()
        if staff or m.visibility == Visibility.THREAD
    ]


def _events(d: Dispute) -> list[dict[str, Any]]:
    return [
        {
            "from_status": e.from_status,
            "to_status": e.to_status,
            "actor_name": _name(e.actor),
            "reason": e.reason,
            "occurred_at": e.occurred_at,
        }
        for e in d.events.all()
    ]


def _statement(d: Dispute) -> str:
    found = getattr(d, "disagreement", None)
    return services.statement(found) if found is not None else ""


def _facility_name(facility_id: Any) -> str:
    return str(Facility.objects.values_list("name", flat=True).get(pk=facility_id))


def patient_data(d: Dispute, facility_name: str) -> dict[str, Any]:
    now = timezone.now()
    has_statement = Dispute.objects.filter(pk=d.pk, disagreement__isnull=False).exists()
    return {
        **_row(d, facility_name),
        "description": services.description(d),
        "decision_reason": d.decision_reason,
        "resolved_at": d.resolved_at,
        "closed_at": d.closed_at,
        "can_accept": d.status in (DisputeStatus.RESOLVED, DisputeStatus.FINAL_DECISION),
        "can_escalate": d.status == DisputeStatus.RESOLVED
        and d.resolved_at is not None
        and now <= d.resolved_at + services.DISAGREE_WITHIN,
        "can_reopen": d.status == DisputeStatus.CLOSED
        and d.reopen_count == 0
        and d.closed_at is not None
        and now <= d.closed_at + services.REOPEN_WITHIN,
        "can_add_statement": d.outcome == Outcome.CORRECTION_REFUSED and not has_statement,
        "statement": _statement(d) if has_statement else "",
        "messages": _messages(d, staff=False),
        "events": _events(d),
    }


def staff_data(d: Dispute, facility_name: str, user: Any) -> dict[str, Any]:
    has_statement = Dispute.objects.filter(pk=d.pk, disagreement__isnull=False).exists()
    evidence = [entry for row in d.evidence.all() for entry in row.snapshot.get("entries", [])]
    return {
        **_row(d, facility_name),
        "flagged": services.flagged(d.patient_id),
        "description": services.description(d),
        "decision_reason": d.decision_reason,
        "resolved_at": d.resolved_at,
        "statement": _statement(d) if has_statement else "",
        "can_decide": str(user.pk) not in services.involved_user_ids(d),
        "messages": _messages(d, staff=True),
        "events": _events(d),
        "evidence": [
            {"action": e["action"], "at": e["at"], "actor_name": e.get("actor_name", "")}
            for e in evidence
        ],
        "actions": [
            {
                "id": a.pk,
                "outcome": a.outcome,
                "linked_object_type": a.linked_object_type,
                "linked_object_id": a.linked_object_id,
                "status": a.status,
                "done_at": a.done_at,
            }
            for a in d.actions.all()
        ],
        "comment_requests": [
            {
                "id": r.pk,
                "member_name": _name(r.requested_membership.user),
                "membership_id": r.requested_membership_id,
                "responded_at": r.responded_at,
            }
            for r in d.comment_requests.all()
        ],
    }


# ---- patient -------------------------------------------------------------------------------------


def readable(account_id: Any) -> list[tuple[Any, Any, Any]]:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT dispute_id, facility_id, patient_id FROM disputes_patient_disputes(%s)",
            [account_id],
        )
        return list(cursor.fetchall())


def _linked(user: Any, patient_id: Any) -> bool:
    from medilink.patients.models import PatientLink

    return (
        PatientLink.objects.active()
        .filter(account=user, patient_id=patient_id, relationship__in=("self", "guardian"))
        .exists()
    )


class PatientBase(PatientsAPIView):
    permission_classes = [IsPatientAuthenticated]

    def find(self, dispute_id: Any) -> Any:
        for did, fid, _p in readable(self.request.user.pk):
            if str(did) == str(dispute_id):
                return fid
        raise exceptions.NotFound()

    def respond(self, dispute_id: Any, facility_id: Any, code: int = 200) -> Response:
        with rls_context(facility_id=facility_id, user_id=self.request.user.pk):
            d = _load(dispute_id)
            data = patient_data(d, _facility_name(facility_id))
        return Response(s.PatientDisputeSerializer(data).data, status=code)


class PatientDisputesView(PatientBase):
    @extend_schema(
        operation_id="patient_disputes",
        tags=TAGS,
        parameters=[OpenApiParameter("patient_id", str), OpenApiParameter("page", int)],
        responses={200: s.DisputeRowSerializer(many=True)},
        summary="Disputes of my profiles, newest first (P1)",
    )
    def get(self, request: Request) -> Response:
        rows = readable(request.user.pk)
        wanted = request.query_params.get("patient_id")
        if wanted:
            rows = [r for r in rows if str(r[2]) == wanted]
        paginator = DefaultPagination()
        page = paginator.paginate_queryset(rows, request, view=self) or []
        data = []
        for did, fid, _p in page:
            with rls_context(facility_id=fid, user_id=request.user.pk):
                d = Dispute.objects.select_related("patient").get(pk=did)
                data.append(s.DisputeRowSerializer(_row(d, _facility_name(fid))).data)
        return paginator.get_paginated_response(data)

    @extend_schema(
        operation_id="patient_dispute_raise",
        tags=TAGS,
        request=s.RaiseSerializer,
        responses={
            201: s.PatientDisputeSerializer,
            404: err("Not your subject"),
            409: err("A dispute about this is already open"),
            422: err("5 open disputes"),
        },
        summary="Raise a dispute from what went wrong (P1)",
    )
    def post(self, request: Request) -> Response:
        body = s.RaiseSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        if not _linked(request.user, data["patient_id"]):
            raise exceptions.NotFound()
        facility_id = services.subject_facility(
            data["subject_type"], data["subject_id"], data["patient_id"]
        )
        if facility_id is None:
            raise exceptions.NotFound()
        with rls_context(facility_id=facility_id, user_id=request.user.pk):
            d = services.raise_dispute(
                facility_id=facility_id,
                patient_id=data["patient_id"],
                subject_type=data["subject_type"],
                subject_id=data["subject_id"],
                text=data["description"],
                account=request.user,
                request=request,
            )
        return self.respond(d.pk, facility_id, status.HTTP_201_CREATED)


class PatientDisputeView(PatientBase):
    @extend_schema(
        operation_id="patient_dispute",
        tags=TAGS,
        responses={200: s.PatientDisputeSerializer},
        summary="Dispute thread and deadlines (P2); no internal notes",
    )
    def get(self, request: Request, dispute_id: Any) -> Response:
        return self.respond(dispute_id, self.find(dispute_id))


class PatientMessageView(PatientBase):
    @extend_schema(
        operation_id="patient_dispute_message",
        tags=TAGS,
        request=s.MessageInputSerializer,
        responses={201: s.PatientDisputeSerializer},
        summary="Reply in the thread (P3)",
    )
    def post(self, request: Request, dispute_id: Any) -> Response:
        facility_id = self.find(dispute_id)
        body = s.MessageInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with rls_context(facility_id=facility_id, user_id=request.user.pk):
            services.add_message(
                dispute_id,
                user=request.user,
                role=AuthorRole.PATIENT,
                visibility=Visibility.THREAD,
                text=body.validated_data["body"],
                request=request,
            )
        return self.respond(dispute_id, facility_id, status.HTTP_201_CREATED)


def _patient_step(name: str, fn: Any, summary: str) -> type[PatientBase]:
    class View(PatientBase):
        @extend_schema(
            operation_id=f"patient_dispute_{name}",
            tags=TAGS,
            request=s.DisputeVersionSerializer,
            responses={200: s.PatientDisputeSerializer, 409: STALE, 422: err("Not now")},
            summary=summary,
        )
        def post(self, request: Request, dispute_id: Any) -> Response:
            facility_id = self.find(dispute_id)
            body = s.DisputeVersionSerializer(data=request.data)
            body.is_valid(raise_exception=True)
            with rls_context(facility_id=facility_id, user_id=request.user.pk):
                fn(
                    dispute_id,
                    version=body.validated_data["version"],
                    user=request.user,
                    request=request,
                )
            return self.respond(dispute_id, facility_id)

    View.__name__ = f"Patient{name.title()}View"
    return View


PatientAcceptView = _patient_step("accept", services.accept, "Accept the decision (P4)")
PatientEscalateView = _patient_step(
    "escalate", services.escalate, "Disagree within 14 days: MediLink decides (P4)"
)
PatientReopenView = _patient_step(
    "reopen", services.reopen, "Reopen once within 30 days with new facts (P4)"
)


class PatientStatementView(PatientBase):
    @extend_schema(
        operation_id="patient_dispute_statement",
        tags=TAGS,
        request=s.StatementSerializer,
        responses={201: s.PatientDisputeSerializer, 422: err("Only after a refused correction")},
        summary="My disagreement statement, attached to the record (P5, FR-DSP-07)",
    )
    def post(self, request: Request, dispute_id: Any) -> Response:
        facility_id = self.find(dispute_id)
        body = s.StatementSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with rls_context(facility_id=facility_id, user_id=request.user.pk):
            services.add_statement(
                dispute_id,
                user=request.user,
                text=body.validated_data["statement"],
                request=request,
            )
        return self.respond(dispute_id, facility_id, status.HTTP_201_CREATED)


# ---- staff ---------------------------------------------------------------------------------------


class StaffBase(FacilityView):
    def facility_id(self) -> Any:
        return self.principal().active_facility_id

    def dispute(self, dispute_id: Any) -> Dispute:
        if not Dispute.objects.filter(pk=dispute_id, facility_id=self.facility_id()).exists():
            raise exceptions.NotFound()
        return _load(dispute_id)

    def respond(self, dispute_id: Any, code: int = 200) -> Response:
        d = self.dispute(dispute_id)
        data = staff_data(d, _facility_name(self.facility_id()), self.principal().user)
        return Response(s.StaffDisputeSerializer(data).data, status=code)


class StaffDisputesView(StaffBase):
    permission_classes = [Needs(HANDLE, methods={"POST": (COUNTER,)})]

    @extend_schema(
        operation_id="staff_disputes",
        tags=TAGS,
        parameters=[
            OpenApiParameter("status", str),
            OpenApiParameter("overdue", bool),
            OpenApiParameter("page", int),
        ],
        responses={200: s.StaffDisputeRowSerializer(many=True)},
        summary="The facility's disputes, oldest deadline first (S1)",
    )
    def get(self, request: Request) -> Response:
        rows = Dispute.objects.filter(facility_id=self.facility_id()).select_related("patient")
        wanted = request.query_params.get("status")
        if wanted == "open":
            rows = rows.exclude(status__in=[DisputeStatus.CLOSED, DisputeStatus.FINAL_DECISION])
        elif wanted:
            rows = rows.filter(status=wanted)
        name = _facility_name(self.facility_id())
        items = [
            {**_row(d, name), "flagged": services.flagged(d.patient_id)}
            for d in rows.order_by("acknowledge_by")
        ]
        if request.query_params.get("overdue") in ("true", "1"):
            items = [i for i in items if i["is_overdue"]]
        return paginated(self, request, items, lambda i: s.StaffDisputeRowSerializer(i).data)

    @extend_schema(
        operation_id="staff_dispute_raise",
        tags=TAGS,
        request=s.CounterRaiseSerializer,
        responses={201: s.StaffDisputeRowSerializer, 409: err("Already open"), 422: err("Limit")},
        summary="Raise a dispute at the counter for a patient (S2, FR-DSP-09)",
    )
    def post(self, request: Request) -> Response:
        body = s.CounterRaiseSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        fp = FacilityPatient.objects.filter(
            pk=data["facility_patient_id"], facility_id=self.facility_id()
        ).first()
        if fp is None:
            raise exceptions.NotFound()
        d = services.raise_dispute(
            facility_id=self.facility_id(),
            patient_id=fp.patient_id,
            subject_type=data["subject_type"],
            subject_id=data["subject_id"],
            text=data["description"],
            membership=self.principal().membership,
            request=request,
        )
        d = Dispute.objects.select_related("patient").get(pk=d.pk)
        row = {**_row(d, _facility_name(self.facility_id())), "flagged": False}
        return Response(s.StaffDisputeRowSerializer(row).data, status=status.HTTP_201_CREATED)


class StaffDisputeView(StaffBase):
    permission_classes = [Needs(HANDLE, COMMENT)]

    @extend_schema(
        operation_id="staff_dispute",
        tags=TAGS,
        responses={200: s.StaffDisputeSerializer},
        summary="Dispute with thread, notes, comments, evidence and actions (S3)",
    )
    def get(self, request: Request, dispute_id: Any) -> Response:
        d = self.dispute(dispute_id)
        if (
            not self.can(HANDLE)
            and not d.comment_requests.filter(
                requested_membership=self.principal().membership
            ).exists()
        ):
            raise exceptions.NotFound()
        return self.respond(dispute_id)


class StaffAcknowledgeView(StaffBase):
    permission_classes = [Needs(HANDLE)]

    @extend_schema(
        operation_id="staff_dispute_acknowledge",
        tags=TAGS,
        request=s.DisputeVersionSerializer,
        responses={200: s.StaffDisputeSerializer, 409: STALE, 422: err("Not now or involved")},
        summary="Acknowledge: the decision deadline starts (S4)",
    )
    def post(self, request: Request, dispute_id: Any) -> Response:
        self.dispute(dispute_id)
        body = s.DisputeVersionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        services.acknowledge(
            dispute_id, version=body.validated_data["version"], user=request.user, request=request
        )
        return self.respond(dispute_id)


class StaffRequestInfoView(StaffBase):
    permission_classes = [Needs(HANDLE)]

    @extend_schema(
        operation_id="staff_dispute_request_info",
        tags=TAGS,
        request=s.RequestInfoSerializer,
        responses={200: s.StaffDisputeSerializer, 409: STALE},
        summary="Ask the patient for more information (S4)",
    )
    def post(self, request: Request, dispute_id: Any) -> Response:
        self.dispute(dispute_id)
        body = s.RequestInfoSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        services.request_info(
            dispute_id,
            version=body.validated_data["version"],
            user=request.user,
            text=body.validated_data["body"],
            request=request,
        )
        return self.respond(dispute_id)


class StaffMessageView(StaffBase):
    permission_classes = [Needs(HANDLE)]

    @extend_schema(
        operation_id="staff_dispute_message",
        tags=TAGS,
        request=s.StaffMessageInputSerializer,
        responses={201: s.StaffDisputeSerializer},
        summary="Write to the patient, or an internal note (S5)",
    )
    def post(self, request: Request, dispute_id: Any) -> Response:
        self.dispute(dispute_id)
        body = s.StaffMessageInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        services.add_message(
            dispute_id,
            user=request.user,
            role=AuthorRole.HANDLER,
            visibility=body.validated_data["visibility"],
            text=body.validated_data["body"],
            request=request,
        )
        return self.respond(dispute_id, status.HTTP_201_CREATED)


class StaffCommentRequestView(StaffBase):
    permission_classes = [Needs(HANDLE)]

    @extend_schema(
        operation_id="staff_dispute_comment_request",
        tags=TAGS,
        request=s.CommentRequestInputSerializer,
        responses={201: s.StaffDisputeSerializer},
        summary="Ask a staff member for a comment (S6)",
    )
    def post(self, request: Request, dispute_id: Any) -> Response:
        self.dispute(dispute_id)
        body = s.CommentRequestInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        services.ask_comment(
            dispute_id,
            membership_id=body.validated_data["membership_id"],
            user=request.user,
            request=request,
        )
        return self.respond(dispute_id, status.HTTP_201_CREATED)


class StaffCommentView(StaffBase):
    permission_classes = [Needs(COMMENT, HANDLE)]

    @extend_schema(
        operation_id="staff_dispute_comment",
        tags=TAGS,
        request=s.MessageInputSerializer,
        responses={201: s.StaffDisputeSerializer, 422: err("Not asked")},
        summary="Answer a comment request (S7); involved staff comment, never decide",
    )
    def post(self, request: Request, dispute_id: Any) -> Response:
        self.dispute(dispute_id)
        body = s.MessageInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        services.add_comment(
            dispute_id,
            membership=self.principal().membership,
            text=body.validated_data["body"],
            request=request,
        )
        return self.respond(dispute_id, status.HTTP_201_CREATED)


class StaffResolveView(StaffBase):
    permission_classes = [Needs(HANDLE)]

    @extend_schema(
        operation_id="staff_dispute_resolve",
        tags=TAGS,
        request=s.ResolveSerializer,
        responses={200: s.StaffDisputeSerializer, 409: STALE, 422: err("Involved, or outcome")},
        summary="Decide and create the outcome's actions (S8)",
    )
    def post(self, request: Request, dispute_id: Any) -> Response:
        self.dispute(dispute_id)
        body = s.ResolveSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        services.resolve(
            dispute_id,
            version=body.validated_data["version"],
            user=request.user,
            outcome=body.validated_data["outcome"],
            reason=body.validated_data["reason"],
            request=request,
        )
        return self.respond(dispute_id)


# ---- platform ------------------------------------------------------------------------------------


def platform_rows() -> list[tuple[Any, Any]]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT dispute_id, facility_id FROM disputes_platform_disputes()")
        return list(cursor.fetchall())


class PlatformBase(PatientsAPIView):
    permission_classes = [IsPlatformAdmin]

    def find(self, dispute_id: Any) -> Any:
        for did, fid in platform_rows():
            if str(did) == str(dispute_id):
                return fid
        raise exceptions.NotFound()

    def respond(self, dispute_id: Any, facility_id: Any, code: int = 200) -> Response:
        with rls_context(facility_id=facility_id):
            d = _load(dispute_id)
            data = staff_data(d, _facility_name(facility_id), self.request.user)
            data["can_decide"] = d.status == DisputeStatus.ESCALATED
        return Response(s.StaffDisputeSerializer(data).data, status=code)


class PlatformDisputesView(PlatformBase):
    @extend_schema(
        operation_id="platform_disputes",
        tags=TAGS,
        parameters=[OpenApiParameter("page", int)],
        responses={200: s.StaffDisputeRowSerializer(many=True)},
        summary="Escalated and platform-level disputes (PL1)",
    )
    def get(self, request: Request) -> Response:
        paginator = DefaultPagination()
        page = paginator.paginate_queryset(platform_rows(), request, view=self) or []
        data = []
        for did, fid in page:
            with rls_context(facility_id=fid):
                d = Dispute.objects.select_related("patient").get(pk=did)
                row = {**_row(d, _facility_name(fid)), "flagged": services.flagged(d.patient_id)}
            data.append(s.StaffDisputeRowSerializer(row).data)
        return paginator.get_paginated_response(data)


class PlatformDisputeView(PlatformBase):
    @extend_schema(
        operation_id="platform_dispute",
        tags=TAGS,
        responses={200: s.StaffDisputeSerializer},
        summary="An escalated dispute with its evidence (PL1)",
    )
    def get(self, request: Request, dispute_id: Any) -> Response:
        return self.respond(dispute_id, self.find(dispute_id))


class PlatformMessageView(PlatformBase):
    @extend_schema(
        operation_id="platform_dispute_message",
        tags=TAGS,
        request=s.StaffMessageInputSerializer,
        responses={201: s.StaffDisputeSerializer},
        summary="Write to the patient or an internal note (PL2)",
    )
    def post(self, request: Request, dispute_id: Any) -> Response:
        facility_id = self.find(dispute_id)
        body = s.StaffMessageInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with rls_context(facility_id=facility_id):
            services.add_message(
                dispute_id,
                user=request.user,
                role=AuthorRole.PLATFORM,
                visibility=body.validated_data["visibility"],
                text=body.validated_data["body"],
                request=request,
            )
        return self.respond(dispute_id, facility_id, status.HTTP_201_CREATED)


class PlatformDecisionView(PlatformBase):
    @extend_schema(
        operation_id="platform_dispute_final_decision",
        tags=TAGS,
        request=s.ResolveSerializer,
        responses={200: s.StaffDisputeSerializer, 403: err("step_up_required"), 409: STALE},
        summary="Final decision on an escalated dispute (PL2); step-up",
    )
    def post(self, request: Request, dispute_id: Any) -> Response:
        facility_id = self.find(dispute_id)
        if not has_recent_auth(request):
            raise StepUpRequired()
        body = s.ResolveSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with rls_context(facility_id=facility_id):
            services.resolve(
                dispute_id,
                version=body.validated_data["version"],
                user=request.user,
                outcome=body.validated_data["outcome"],
                reason=body.validated_data["reason"],
                final=True,
                request=request,
            )
        return self.respond(dispute_id, facility_id)
