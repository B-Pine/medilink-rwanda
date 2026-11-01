"""/api/v1/patient/prescriptions/... (contract sprint-07 §3.2)."""

from django.urls import path

from medilink.pharmacy import views_patient as v

urlpatterns = [
    path("", v.PatientPrescriptionsView.as_view(), name="patient-prescriptions"),
    path(
        "<uuid:prescription_id>/",
        v.PatientPrescriptionView.as_view(),
        name="patient-prescription",
    ),
]
