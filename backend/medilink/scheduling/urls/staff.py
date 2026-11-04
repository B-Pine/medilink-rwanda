"""/api/v1/staff/ S5 routes: bookings, phone booking (S5a); disruptions, follow-ups and the
calendar (S5b) (contract sprint-05 §3.3)."""

from django.urls import path

from medilink.scheduling import views_booking as v
from medilink.scheduling import views_care as care
from medilink.scheduling import views_s5b as b

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
    # S5b
    path("disruptions/", b.DisruptionsView.as_view(), name="staff-disruptions"),
    path(
        "disruptions/<uuid:disruption_id>/",
        b.DisruptionView.as_view(),
        name="staff-disruption",
    ),
    path(
        "disruptions/<uuid:disruption_id>/apply/",
        b.DisruptionApplyView.as_view(),
        name="staff-disruption-apply",
    ),
    path(
        "visits/<uuid:visit_id>/follow-up/",
        b.FollowUpView.as_view(),
        name="staff-visit-follow-up",
    ),
    path("calendar/", b.StaffCalendarView.as_view(), name="staff-calendar"),
    # W7: the care schedule of a patient
    path(
        "care-schedule/patients/<uuid:facility_patient_id>/",
        care.StaffCareScheduleView.as_view(),
        name="staff-patient-care-schedule",
    ),
    path(
        "care-schedule/<uuid:entry_id>/cancel/",
        care.StaffCareScheduleCancelView.as_view(),
        name="staff-care-schedule-cancel",
    ),
]
