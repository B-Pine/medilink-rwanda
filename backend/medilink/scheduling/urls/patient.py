"""/api/v1/patient/ S5 routes: holds, bookings, remote join (contract sprint-05 §3.2)."""

from django.urls import path

from medilink.scheduling import views_booking as v

urlpatterns = [
    path("slots/<uuid:slot_id>/hold/", v.PatientHoldView.as_view(), name="patient-slot-hold"),
    path("holds/<uuid:hold_id>/", v.PatientHoldDeleteView.as_view(), name="patient-hold"),
    path("bookings/", v.PatientBookingsView.as_view(), name="patient-bookings"),
    path(
        "bookings/<uuid:booking_id>/",
        v.PatientBookingDetailView.as_view(),
        name="patient-booking",
    ),
    path(
        "bookings/<uuid:booking_id>/calendar.ics",
        v.PatientBookingIcsView.as_view(),
        name="patient-booking-ics",
    ),
    path(
        "bookings/<uuid:booking_id>/cancel/",
        v.PatientBookingCancelView.as_view(),
        name="patient-booking-cancel",
    ),
    path(
        "bookings/<uuid:booking_id>/reschedule/",
        v.PatientBookingRescheduleView.as_view(),
        name="patient-booking-reschedule",
    ),
    path("visits/remote-join/", v.RemoteJoinView.as_view(), name="patient-remote-join"),
    path("visits/<uuid:visit_id>/arrived/", v.ArrivedView.as_view(), name="patient-visit-arrived"),
]
