"""/api/v1/patient/disputes/... (contract sprint-10b §3 P1-P5)."""

from django.urls import path

from medilink.disputes import views as v

urlpatterns = [
    path("", v.PatientDisputesView.as_view(), name="patient-disputes"),
    path("<uuid:dispute_id>/", v.PatientDisputeView.as_view(), name="patient-dispute"),
    path(
        "<uuid:dispute_id>/messages/",
        v.PatientMessageView.as_view(),
        name="patient-dispute-messages",
    ),
    path("<uuid:dispute_id>/accept/", v.PatientAcceptView.as_view(), name="patient-dispute-accept"),
    path(
        "<uuid:dispute_id>/escalate/",
        v.PatientEscalateView.as_view(),
        name="patient-dispute-escalate",
    ),
    path("<uuid:dispute_id>/reopen/", v.PatientReopenView.as_view(), name="patient-dispute-reopen"),
    path(
        "<uuid:dispute_id>/disagreement/",
        v.PatientStatementView.as_view(),
        name="patient-dispute-statement",
    ),
]
