"""/api/v1/platform/disputes/... (contract sprint-10b §3 PL1-PL2)."""

from django.urls import path

from medilink.disputes import views as v

urlpatterns = [
    path("", v.PlatformDisputesView.as_view(), name="platform-disputes"),
    path("<uuid:dispute_id>/", v.PlatformDisputeView.as_view(), name="platform-dispute"),
    path(
        "<uuid:dispute_id>/messages/",
        v.PlatformMessageView.as_view(),
        name="platform-dispute-messages",
    ),
    path(
        "<uuid:dispute_id>/final-decision/",
        v.PlatformDecisionView.as_view(),
        name="platform-dispute-final-decision",
    ),
]
