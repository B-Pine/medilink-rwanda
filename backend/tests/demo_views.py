"""Test-only facility-scoped endpoints over FacilityNote (the RLS demo table).

They use the production policy layer, so tests can prove end to end that another facility's
object is a 404 and that RLS filters rows even when the application forgets to.
"""

from __future__ import annotations

from typing import Any

from django.urls import include, path
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from medilink.accounts.authentication import StaffSessionAuthentication
from medilink.authz.permissions import HasFacilityPermission, IsStaffAuthenticated, get_principal
from medilink.authz.policy import authorize, get_scoped_object_or_404, scoped
from medilink.tenancy.models import FacilityNote


class NoteListView(APIView):
    authentication_classes = [StaffSessionAuthentication]
    permission_classes = [IsStaffAuthenticated]

    def get(self, request: Request) -> Response:
        notes = scoped(get_principal(request), FacilityNote.objects)
        return Response([{"id": str(n.pk), "title": n.title} for n in notes])


class UnscopedNoteListView(APIView):
    """Simulates a developer forgetting the scope: RLS must still filter."""

    authentication_classes = [StaffSessionAuthentication]
    permission_classes = [IsStaffAuthenticated]

    def get(self, request: Request) -> Response:
        return Response([str(n.facility_id) for n in FacilityNote.objects.all()])


class NoteDetailView(APIView):
    authentication_classes = [StaffSessionAuthentication]
    permission_classes = [HasFacilityPermission("visit.reason.view")]

    def get(self, request: Request, note_id: Any) -> Response:
        principal = get_principal(request)
        note = get_scoped_object_or_404(principal, FacilityNote.objects, pk=note_id)
        authorize(principal, "visit.reason.view", note)
        return Response({"id": str(note.pk), "title": note.title})


class ConfigureView(APIView):
    authentication_classes = [StaffSessionAuthentication]
    permission_classes = [HasFacilityPermission("facility.configure")]

    def post(self, request: Request) -> Response:
        return Response({"ok": True})


class BoomView(APIView):
    authentication_classes = [StaffSessionAuthentication]
    permission_classes = [IsStaffAuthenticated]

    def get(self, request: Request) -> Response:
        raise RuntimeError("unexpected failure with patient@example.test inside")


demo_patterns = [
    path("notes/", NoteListView.as_view()),
    path("notes-unscoped/", UnscopedNoteListView.as_view()),
    path("notes/<str:note_id>/", NoteDetailView.as_view()),
    path("configure/", ConfigureView.as_view()),
    path("boom/", BoomView.as_view()),
]

urlpatterns = [
    path("api/v1/staff/demo/", include(demo_patterns)),
    path("", include("config.urls")),
]
