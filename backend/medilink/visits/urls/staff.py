"""/api/v1/staff/ S4 routes ([S4] block): check-in, queue, tickets, duty, reorders, displays."""

from django.urls import path

from medilink.visits import views as v

urlpatterns = [
    path("visits/check-in/", v.CheckInView.as_view(), name="staff-check-in"),
    path("visits/<uuid:visit_id>/", v.VisitDetailView.as_view(), name="staff-visit"),
    path("queue/board/", v.BoardView.as_view(), name="staff-queue-board"),
    path("queue/mine/", v.MineView.as_view(), name="staff-queue-mine"),
    path("queue/call-next/", v.CallNextView.as_view(), name="staff-call-next"),
    path("queue/reorders/", v.ReordersView.as_view(), name="staff-reorders"),
    path(
        "queue/reorders/<uuid:event_id>/review/",
        v.ReorderReviewView.as_view(),
        name="staff-reorder-review",
    ),
    path(
        "tickets/<uuid:ticket_id>/<str:action>/",
        v.TicketActionView.as_view(),
        name="staff-ticket-action",
    ),
    path("duty-status/", v.DutyView.as_view(), name="staff-duty-status"),
    path("reports/operations/", v.OperationsView.as_view(), name="staff-reports-operations"),
    path("display-links/", v.DisplayLinksView.as_view(), name="staff-display-links"),
    path(
        "display-links/<uuid:link_id>/revoke/",
        v.DisplayLinkRevokeView.as_view(),
        name="staff-display-link-revoke",
    ),
]
