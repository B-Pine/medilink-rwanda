"""/api/v1/patient/uploads/ routes ([S1] block of config/urls.py)."""

from django.urls import path

from medilink.uploads import views

urlpatterns = [
    path("", views.PatientUploadCreateView.as_view(), name="patient-upload-create"),
    path(
        "<uuid:upload_id>/", views.PatientUploadDetailView.as_view(), name="patient-upload-detail"
    ),
    path(
        "<uuid:upload_id>/download-links/",
        views.PatientDownloadLinkView.as_view(),
        name="patient-upload-download-link",
    ),
]
