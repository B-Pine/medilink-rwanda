"""/api/v1/staff/uploads/ routes ([S1] block of config/urls.py)."""

from django.urls import path

from medilink.uploads import views

urlpatterns = [
    path("", views.StaffUploadCreateView.as_view(), name="staff-upload-create"),
    path("<uuid:upload_id>/", views.StaffUploadDetailView.as_view(), name="staff-upload-detail"),
    path(
        "<uuid:upload_id>/download-links/",
        views.StaffDownloadLinkView.as_view(),
        name="staff-upload-download-link",
    ),
]
