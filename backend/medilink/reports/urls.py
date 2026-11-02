"""S10 part 2b routes (contract sprint-10c §3)."""

from django.urls import path

from medilink.reports import views as v

staff = [
    path("reports/period/", v.FacilityReportView.as_view(), name="staff-report-period"),
    path(
        "reports/period/export/",
        v.FacilityReportExportView.as_view(),
        name="staff-report-period-export",
    ),
    path("audit-entries/", v.FacilityAuditView.as_view(), name="staff-audit-entries"),
]
platform = [
    path("reports/", v.PlatformReportView.as_view(), name="platform-report"),
    path("audit-entries/", v.PlatformAuditView.as_view(), name="platform-audit-entries"),
]
patient = [
    path("data-export/", v.PatientDataExportView.as_view(), name="patient-data-export"),
]
