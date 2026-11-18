from django.urls import path

from medilink.images import views

urlpatterns = [
    path("", views.PatientSignatureView.as_view(), name="patient-upload-signature"),
]
