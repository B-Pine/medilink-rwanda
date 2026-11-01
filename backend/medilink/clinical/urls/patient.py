"""/api/v1/patient/records/... (contract sprint-06 §3.2)."""

from django.urls import path

from medilink.clinical import views_patient as v

urlpatterns = [
    path("", v.PatientRecordsView.as_view(), name="patient-records"),
    path("<uuid:consultation_id>/", v.PatientRecordView.as_view(), name="patient-record"),
]
