"""/api/v1/staff/... clinical routes (contract sprint-06 §3.1)."""

from django.urls import path

from medilink.clinical import views as v

urlpatterns = [
    path(
        "visits/<uuid:visit_id>/consultation/",
        v.VisitConsultationView.as_view(),
        name="staff-visit-consultation",
    ),
    path("visits/<uuid:visit_id>/vitals/", v.VisitVitalsView.as_view(), name="staff-visit-vitals"),
    path("consultations/", v.ConsultationListView.as_view(), name="staff-consultations"),
    path(
        "consultations/<uuid:consultation_id>/",
        v.ConsultationView.as_view(),
        name="staff-consultation",
    ),
    path(
        "consultations/<uuid:consultation_id>/sign/",
        v.SignView.as_view(),
        name="staff-consultation-sign",
    ),
    path(
        "consultations/<uuid:consultation_id>/addenda/",
        v.AddendaView.as_view(),
        name="staff-consultation-addenda",
    ),
    path(
        "consultations/<uuid:consultation_id>/entered-in-error/",
        v.EnteredInErrorView.as_view(),
        name="staff-consultation-entered-in-error",
    ),
    path(
        "vitals/<uuid:vitals_id>/entered-in-error/",
        v.VitalsEnteredInErrorView.as_view(),
        name="staff-vitals-entered-in-error",
    ),
    path(
        "clinical/patients/<uuid:facility_patient_id>/history/",
        v.HistoryView.as_view(),
        name="staff-patient-history",
    ),
    path(
        "clinical/patients/<uuid:facility_patient_id>/problem-summary/",
        v.ProblemSummaryView.as_view(),
        name="staff-patient-problem-summary",
    ),
    path(
        "clinical/patients/<uuid:facility_patient_id>/access-reasons/",
        v.AccessReasonView.as_view(),
        name="staff-patient-access-reasons",
    ),
    path(
        "clinical/patients/<uuid:facility_patient_id>/access/",
        v.AccessStateView.as_view(),
        name="staff-patient-access",
    ),
    path("clinical/alerts/", v.AlertsView.as_view(), name="staff-clinical-alerts"),
]
