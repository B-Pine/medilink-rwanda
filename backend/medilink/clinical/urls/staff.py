"""/api/v1/staff/... clinical routes (contract sprint-06 §3.1)."""

from django.urls import path

from medilink.clinical import views as v
from medilink.clinical import views_doctor as d
from medilink.clinical import views_import as imp
from medilink.clinical import views_lab as lab
from medilink.clinical import views_s6b as b

urlpatterns = [
    # upgrade 06 §3 (#201): the laboratory loop
    path("lab/tests/", lab.LabTestsView.as_view(), name="staff-lab-tests"),
    path("lab/queue/", lab.LabQueueView.as_view(), name="staff-lab-queue"),
    path("lab/results/", lab.LabInboxView.as_view(), name="staff-lab-results"),
    path(
        "consultations/<uuid:consultation_id>/lab-orders/",
        lab.ConsultationLabOrdersView.as_view(),
        name="staff-consultation-lab-orders",
    ),
    path(
        "lab-orders/<uuid:order_id>/sample/", lab.LabSampleView.as_view(), name="staff-lab-sample"
    ),
    path(
        "lab-orders/<uuid:order_id>/result/", lab.LabResultView.as_view(), name="staff-lab-result"
    ),
    path(
        "lab-orders/<uuid:order_id>/review/", lab.LabReviewView.as_view(), name="staff-lab-review"
    ),
    path(
        "lab-orders/<uuid:order_id>/release/",
        lab.LabReleaseView.as_view(),
        name="staff-lab-release",
    ),
    path(
        "lab-orders/<uuid:order_id>/cancel/", lab.LabCancelView.as_view(), name="staff-lab-cancel"
    ),
    path(
        "visits/<uuid:visit_id>/consultation/",
        v.VisitConsultationView.as_view(),
        name="staff-visit-consultation",
    ),
    path("visits/<uuid:visit_id>/vitals/", v.VisitVitalsView.as_view(), name="staff-visit-vitals"),
    path("consultations/", v.ConsultationListView.as_view(), name="staff-consultations"),
    path("clinical/my-day/", v.MyDayView.as_view(), name="staff-clinical-my-day"),
    # upgrade 05 §3: doctor tools
    path("clinical/questions/", d.QuestionsView.as_view(), name="staff-clinical-questions"),
    path(
        "clinical/questions/<uuid:query_id>/reply/",
        d.QuestionReplyView.as_view(),
        name="staff-clinical-question-reply",
    ),
    path("clinical/my-follow-ups/", d.MyFollowUpsView.as_view(), name="staff-clinical-follow-ups"),
    path("clinical/my-activity/", d.MyActivityView.as_view(), name="staff-clinical-activity"),
    path("clinical/templates/", d.TemplatesView.as_view(), name="staff-clinical-templates"),
    path(
        "clinical/templates/<uuid:template_id>/",
        d.TemplateView.as_view(),
        name="staff-clinical-template",
    ),
    path(
        "clinical/templates/<uuid:template_id>/used/",
        d.TemplateUsedView.as_view(),
        name="staff-clinical-template-used",
    ),
    path("clinical/favourites/", d.FavouritesView.as_view(), name="staff-clinical-favourites"),
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
    # S6b (contract §3.3)
    path("results-inbox/", b.ResultsInboxView.as_view(), name="staff-results-inbox"),
    path(
        "results-inbox/<uuid:review_id>/review/",
        b.ResultReviewView.as_view(),
        name="staff-result-review",
    ),
    path(
        "clinical/patients/<uuid:facility_patient_id>/scans/",
        b.ScansView.as_view(),
        name="staff-patient-scans",
    ),
    path(
        "clinical/scans/<uuid:scan_id>/download-link/",
        b.ScanLinkView.as_view(),
        name="staff-scan-download-link",
    ),
    path(
        "clinical/patients/<uuid:facility_patient_id>/history-entries/",
        b.HistoryEntriesView.as_view(),
        name="staff-patient-history-entries",
    ),
    path(
        "clinical/patients/<uuid:facility_patient_id>/health-attributes/",
        b.HealthAttributesView.as_view(),
        name="staff-patient-health-attributes",
    ),
    path("patient-imports/", imp.ImportsView.as_view(), name="staff-patient-imports"),
    path(
        "patient-imports/<uuid:batch_id>/",
        imp.ImportDetailView.as_view(),
        name="staff-patient-import",
    ),
    path(
        "patient-imports/<uuid:batch_id>/mapping/",
        imp.ImportMappingView.as_view(),
        name="staff-patient-import-mapping",
    ),
    path(
        "patient-imports/<uuid:batch_id>/rows/",
        imp.ImportRowsView.as_view(),
        name="staff-patient-import-rows",
    ),
    path(
        "patient-imports/<uuid:batch_id>/confirm/",
        imp.ImportConfirmView.as_view(),
        name="staff-patient-import-confirm",
    ),
    path(
        "patient-imports/<uuid:batch_id>/rollback/",
        imp.ImportRollbackView.as_view(),
        name="staff-patient-import-rollback",
    ),
]
