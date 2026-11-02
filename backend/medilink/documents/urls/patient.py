"""/api/v1/patient/documents/... (contract sprint-07 §3.3 D4, D5)."""

from django.urls import path

from medilink.documents import views_patient as v

urlpatterns = [
    path("", v.PatientDocumentsView.as_view(), name="patient-documents"),
    path("archive/", v.PatientArchiveView.as_view(), name="patient-documents-archive"),
    path("<uuid:document_id>/", v.PatientDocumentView.as_view(), name="patient-document"),
    path(
        "<uuid:document_id>/download-link/",
        v.PatientDownloadLinkView.as_view(),
        name="patient-document-download-link",
    ),
    path(
        "<uuid:document_id>/share-links/",
        v.ShareLinksView.as_view(),
        name="patient-document-share-links",
    ),
    path(
        "<uuid:document_id>/share-links/<uuid:link_id>/",
        v.ShareLinkView.as_view(),
        name="patient-document-share-link",
    ),
]
