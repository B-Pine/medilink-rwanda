"""/api/v1/staff/ S2 routes: catalogue, schedules, billing setup, team ([S2] block)."""

from django.urls import path

from medilink.billing import views as billing
from medilink.facilities import views as v
from medilink.facilities import views_staff as team
from medilink.scheduling import views as schedules

urlpatterns = [
    path("departments/", v.DepartmentsView.as_view(), name="staff-departments"),
    path(
        "departments/<uuid:department_id>/",
        v.DepartmentDetailView.as_view(),
        name="staff-department",
    ),
    path("services/", v.ServicesView.as_view(), name="staff-services"),
    path("services/<uuid:service_id>/", v.ServiceDetailView.as_view(), name="staff-service"),
    path("service-points/", v.ServicePointsView.as_view(), name="staff-service-points"),
    path(
        "service-points/<uuid:point_id>/",
        v.ServicePointDetailView.as_view(),
        name="staff-service-point",
    ),
    path("schedule-templates/", schedules.TemplatesView.as_view(), name="staff-templates"),
    path(
        "schedule-templates/<uuid:template_id>/",
        schedules.TemplateDetailView.as_view(),
        name="staff-template",
    ),
    path("schedule-exceptions/", schedules.ExceptionsView.as_view(), name="staff-exceptions"),
    path(
        "schedule-exceptions/<uuid:exception_id>/<str:action>/",
        schedules.ExceptionActionView.as_view(),
        name="staff-exception-action",
    ),
    path("schedule-overview/", schedules.OverviewView.as_view(), name="staff-schedule-overview"),
    path("tariff-items/", billing.TariffView.as_view(), name="staff-tariff"),
    path(
        "tariff-items/<uuid:item_id>/", billing.TariffDetailView.as_view(), name="staff-tariff-item"
    ),
    path(
        "tariff-items/<str:code>/history/",
        billing.TariffHistoryView.as_view(),
        name="staff-tariff-history",
    ),
    path("insurer-rules/", billing.RulesView.as_view(), name="staff-insurer-rules"),
    path(
        "insurer-rules/<uuid:rule_id>/", billing.RuleDetailView.as_view(), name="staff-insurer-rule"
    ),
    path("roles/", team.RolesView.as_view(), name="staff-roles"),
    path("memberships/", team.MembershipsView.as_view(), name="staff-memberships"),
    path(
        "memberships/<uuid:membership_id>/",
        team.MembershipDetailView.as_view(),
        name="staff-membership",
    ),
    path(
        "memberships/<uuid:membership_id>/<str:action>/",
        team.MembershipActionView.as_view(),
        name="staff-membership-action",
    ),
    path("invitations/", team.InvitationsView.as_view(), name="staff-invitations"),
    path(
        "invitations/<uuid:invitation_id>/<str:action>/",
        team.InvitationActionView.as_view(),
        name="staff-invitation-action",
    ),
    path("clinician-profile/", team.ClinicianProfileView.as_view(), name="staff-clinician-profile"),
]
