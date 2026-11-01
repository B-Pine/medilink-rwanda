from django.urls import path

from medilink.support import views

r = views.PATIENT_REQUESTS

urlpatterns = [
    path("support-requests/", r["list"].as_view(), name="patient-support-requests"),
    path(
        "support-requests/<uuid:request_id>/",
        r["detail"].as_view(),
        name="patient-support-request",
    ),
    path(
        "support-requests/<uuid:request_id>/messages/",
        r["messages"].as_view(),
        name="patient-support-request-messages",
    ),
    path(
        "support-requests/<uuid:request_id>/close/",
        r["close"].as_view(),
        name="patient-support-request-close",
    ),
]
