"""/api/v1/staff/auth/invitations/ ([S2] block): before login, token in the body."""

from django.urls import path

from medilink.facilities import views_staff as team

urlpatterns = [
    path("lookup/", team.InvitationLookupView.as_view(), name="staff-invitation-lookup"),
    path("accept/", team.InvitationAcceptView.as_view(), name="staff-invitation-accept"),
]
