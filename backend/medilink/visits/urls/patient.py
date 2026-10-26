"""/api/v1/patient/ S4 routes: tracker, cancel, travel time."""

from django.urls import path

from medilink.visits import views as v

urlpatterns = [
    path("visits/active/", v.PatientVisitsView.as_view(), name="patient-visits-active"),
    path(
        "visits/<uuid:visit_id>/cancel/",
        v.PatientVisitCancelView.as_view(),
        name="patient-visit-cancel",
    ),
    path(
        "travel-times/<uuid:facility_id>/",
        v.TravelTimeView.as_view(),
        name="patient-travel-time",
    ),
]
