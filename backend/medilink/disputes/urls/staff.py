"""/api/v1/staff/disputes/... (contract sprint-10b §3 S1-S8)."""

from django.urls import path

from medilink.disputes import views as v

urlpatterns = [
    path("", v.StaffDisputesView.as_view(), name="staff-disputes"),
    path("<uuid:dispute_id>/", v.StaffDisputeView.as_view(), name="staff-dispute"),
    path(
        "<uuid:dispute_id>/acknowledge/",
        v.StaffAcknowledgeView.as_view(),
        name="staff-dispute-acknowledge",
    ),
    path(
        "<uuid:dispute_id>/request-info/",
        v.StaffRequestInfoView.as_view(),
        name="staff-dispute-request-info",
    ),
    path(
        "<uuid:dispute_id>/messages/", v.StaffMessageView.as_view(), name="staff-dispute-messages"
    ),
    path(
        "<uuid:dispute_id>/comment-requests/",
        v.StaffCommentRequestView.as_view(),
        name="staff-dispute-comment-requests",
    ),
    path(
        "<uuid:dispute_id>/comments/", v.StaffCommentView.as_view(), name="staff-dispute-comments"
    ),
    path("<uuid:dispute_id>/resolve/", v.StaffResolveView.as_view(), name="staff-dispute-resolve"),
]
