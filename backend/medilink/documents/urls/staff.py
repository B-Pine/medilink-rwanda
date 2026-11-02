"""/api/v1/staff/... documents routes (contract sprint-07 §3.3 CR1, D1-D3)."""

from django.urls import path

from medilink.documents import views as v

urlpatterns = [
    path(
        "consultations/<uuid:consultation_id>/referrals/",
        v.ReferralsView.as_view(),
        name="staff-consultation-referrals",
    ),
    path(
        "consultations/<uuid:consultation_id>/lab-requests/",
        v.LabRequestsView.as_view(),
        name="staff-consultation-lab-requests",
    ),
    path(
        "consultations/<uuid:consultation_id>/sick-notes/",
        v.SickNotesView.as_view(),
        name="staff-consultation-sick-notes",
    ),
    path("documents/", v.DocumentListView.as_view(), name="staff-documents"),
    path("documents/<uuid:document_id>/", v.DocumentView.as_view(), name="staff-document"),
    path(
        "documents/<uuid:document_id>/download-link/",
        v.DownloadLinkView.as_view(),
        name="staff-document-download-link",
    ),
    path(
        "documents/<uuid:document_id>/print/",
        v.PrintView.as_view(),
        name="staff-document-print",
    ),
]
