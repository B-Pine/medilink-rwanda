"""/api/v1/platform/... super admin console routes ([S11] block of config/urls.py)."""

from django.urls import path

from medilink.platform_admin import views as v

urlpatterns = [
    path("command-center/", v.CommandCenterView.as_view(), name="platform-command-center"),
    path("users/", v.UsersView.as_view(), name="platform-users"),
    path("users/<uuid:user_id>/", v.UserView.as_view(), name="platform-user"),
    path("users/<uuid:user_id>/lock/", v.LockUserView.as_view(), name="platform-user-lock"),
    path("users/<uuid:user_id>/unlock/", v.UnlockUserView.as_view(), name="platform-user-unlock"),
    path(
        "users/<uuid:user_id>/reset-mfa/", v.ResetMfaView.as_view(), name="platform-user-mfa-reset"
    ),
    path(
        "users/<uuid:user_id>/revoke-sessions/",
        v.RevokeSessionsView.as_view(),
        name="platform-user-sessions-revoke",
    ),
    path("security-events/", v.SecurityEventsView.as_view(), name="platform-security-events"),
    path("access-events/", v.AccessEventsView.as_view(), name="platform-access-events"),
]
