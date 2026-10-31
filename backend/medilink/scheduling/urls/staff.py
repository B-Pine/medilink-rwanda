"""/api/v1/staff/ S5 routes: bookings and phone booking (contract sprint-05 §3.3)."""

from django.urls import path

from medilink.scheduling import views_booking as v

urlpatterns = [
    path("bookings/", v.StaffBookingsView.as_view(), name="staff-bookings"),
    path(
        "bookings/<uuid:booking_id>/cancel/",
        v.StaffCancelView.as_view(),
        name="staff-booking-cancel",
    ),
    path(
        "bookings/<uuid:booking_id>/reschedule/",
        v.StaffRescheduleView.as_view(),
        name="staff-booking-reschedule",
    ),
    path(
        "bookings/<uuid:booking_id>/reverse-no-show/",
        v.ReverseNoShowView.as_view(),
        name="staff-booking-reverse-no-show",
    ),
    path("slots/", v.StaffSlotsView.as_view(), name="staff-slots"),
    path("slots/<uuid:slot_id>/hold/", v.StaffHoldView.as_view(), name="staff-slot-hold"),
]
