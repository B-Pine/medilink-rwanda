"""/api/v1/platform/{overview,facility-applications,facilities,feature-flags}/ (one module per
include, so config/urls.py only adds include() lines in the [S1] block)."""

from django.urls import path

from medilink.onboarding import views_platform as v

APP = "<uuid:application_id>/"
DOC = APP + "documents/<uuid:document_id>/"
FAC = "<uuid:facility_id>/"

overview = [path("", v.OverviewView.as_view(), name="platform-overview")]

applications = [
    path("", v.ApplicationsView.as_view(), name="platform-applications"),
    path(APP, v.ApplicationView.as_view(), name="platform-application"),
    path(APP + "documents/", v.DocumentsView.as_view(), name="platform-application-documents"),
    path(
        APP + "send-resume-link/",
        v.SendResumeLinkView.as_view(),
        name="platform-application-send-link",
    ),
    path(APP + "start-review/", v.StartReviewView.as_view(), name="platform-application-review"),
    path(DOC + "review/", v.DocumentReviewView.as_view(), name="platform-application-doc-review"),
    path(
        DOC + "download-links/", v.DocumentLinkView.as_view(), name="platform-application-doc-link"
    ),
    path(
        APP + "request-changes/",
        v.RequestChangesView.as_view(),
        name="platform-application-request-changes",
    ),
    path(APP + "approve/", v.ApproveView.as_view(), name="platform-application-approve"),
    path(APP + "reject/", v.RejectView.as_view(), name="platform-application-reject"),
    path(APP + "notes/", v.NotesView.as_view(), name="platform-application-notes"),
    path(APP + "events/", v.EventsView.as_view(), name="platform-application-events"),
]

facilities = [
    path("", v.FacilitiesView.as_view(), name="platform-facilities"),
    path(FAC, v.FacilityView.as_view(), name="platform-facility"),
    path(FAC + "status-events/", v.StatusEventsView.as_view(), name="platform-facility-events"),
    path(FAC + "start-setup/", v.StartSetupView.as_view(), name="platform-facility-start-setup"),
    path(FAC + "go-live/", v.GoLiveView.as_view(), name="platform-facility-go-live"),
    path(FAC + "suspend/", v.SuspendView.as_view(), name="platform-facility-suspend"),
    path(FAC + "reactivate/", v.ReactivateView.as_view(), name="platform-facility-reactivate"),
    path(FAC + "deactivate/", v.DeactivateView.as_view(), name="platform-facility-deactivate"),
    path(FAC + "licences/", v.LicencesView.as_view(), name="platform-facility-licences"),
    path(
        FAC + "licences/<uuid:licence_id>/",
        v.LicenceView.as_view(),
        name="platform-facility-licence",
    ),
    path(FAC + "feature-flags/", v.FacilityFlagsView.as_view(), name="platform-facility-flags"),
    path(
        FAC + "feature-flags/<str:code>/",
        v.FacilityFlagView.as_view(),
        name="platform-facility-flag",
    ),
]

flags = [
    path("", v.FlagsView.as_view(), name="platform-flags"),
    path("<str:code>/", v.FlagView.as_view(), name="platform-flag"),
]
