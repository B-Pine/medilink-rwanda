"""/api/v1/platform/memberships/ ([S2] block)."""

from django.urls import path

from medilink.facilities import views_staff as team

urlpatterns = [
    path(
        "<uuid:membership_id>/mfa-reset/",
        team.PlatformMfaResetView.as_view(),
        name="platform-membership-mfa-reset",
    ),
]
