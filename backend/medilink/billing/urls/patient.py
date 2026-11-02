"""/api/v1/patient/bills/... (contract sprint-08 §3.2)."""

from django.urls import path

from medilink.billing import views_patient as v

urlpatterns = [
    path("", v.PatientBillsView.as_view(), name="patient-bills"),
    path("<uuid:bill_id>/", v.PatientBillView.as_view(), name="patient-bill"),
]
