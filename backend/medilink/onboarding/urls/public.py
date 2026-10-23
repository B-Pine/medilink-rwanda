"""/api/v1/public/facility-applications/"""

from django.urls import path

from medilink.onboarding import views_public as v

urlpatterns = [
    path("", v.StartView.as_view(), name="public-application-start"),
    path("resume-links/", v.ResumeLinksView.as_view(), name="public-application-resume-links"),
    path("resume/", v.ResumeView.as_view(), name="public-application-resume"),
    path("<uuid:application_id>/", v.ApplicationView.as_view(), name="public-application"),
    path(
        "<uuid:application_id>/documents/",
        v.DocumentsView.as_view(),
        name="public-application-documents",
    ),
    path(
        "<uuid:application_id>/documents/<uuid:document_id>/",
        v.DocumentView.as_view(),
        name="public-application-document",
    ),
    path("<uuid:application_id>/submit/", v.SubmitView.as_view(), name="public-application-submit"),
    path(
        "<uuid:application_id>/end-session/",
        v.EndSessionView.as_view(),
        name="public-application-end-session",
    ),
]
