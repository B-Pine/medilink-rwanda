"""/api/v1/staff/facility/ routes ([S2] block of config/urls.py)."""

from django.urls import path

from medilink.facilities import views as v

urlpatterns = [
    path("", v.ProfileView.as_view(), name="staff-facility"),
    path("photos/", v.PhotoView.as_view(), name="staff-facility-photos"),
    path("photos/<uuid:upload_id>/", v.PhotoDeleteView.as_view(), name="staff-facility-photo"),
    path("opening-hours/", v.HoursView.as_view(), name="staff-facility-hours"),
    path("calendar-events/", v.CalendarEventsView.as_view(), name="staff-facility-events"),
    path(
        "calendar-events/<uuid:event_id>/",
        v.CalendarEventDetailView.as_view(),
        name="staff-facility-event",
    ),
    path("calendar/", v.CalendarView.as_view(), name="staff-facility-calendar"),
    path("settings/", v.SettingsView.as_view(), name="staff-facility-settings"),
    path("branding/", v.BrandingView.as_view(), name="staff-facility-branding"),
    path("config-changes/", v.ConfigChangesView.as_view(), name="staff-facility-changes"),
    path("setup-checklist/", v.ChecklistView.as_view(), name="staff-facility-checklist"),
    path("go-live/", v.GoLiveView.as_view(), name="staff-facility-go-live"),
]
