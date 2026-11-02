"""/api/v1/public/... documents routes (contract sprint-07 §3.3 V1, D5)."""

from django.urls import path

from medilink.documents import views_patient as v

urlpatterns = [
    path("verify/<str:code>/", v.VerifyView.as_view(), name="public-verify"),
    path("verify/<str:code>/details/", v.VerifyDetailsView.as_view(), name="public-verify-details"),
    path(
        "shared-documents/<str:token>/",
        v.SharedDocumentView.as_view(),
        name="public-shared-document",
    ),
]
