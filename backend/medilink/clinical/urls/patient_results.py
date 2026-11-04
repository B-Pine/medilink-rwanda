"""/api/v1/patient/results/ (upgrade 06 §3, FR-CLN-11, #201): released lab results only."""

from django.urls import path

from medilink.clinical import views_lab as lab

urlpatterns = [
    path("", lab.PatientLabResultsView.as_view(), name="patient-lab-results"),
]
