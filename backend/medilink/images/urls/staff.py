from django.urls import path

from medilink.images import views

urlpatterns = [
    path("", views.StaffSignatureView.as_view(), name="staff-upload-signature"),
]
