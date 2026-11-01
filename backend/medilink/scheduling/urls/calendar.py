"""/api/v1/calendar/ (public with the feed token, contract sprint-05 §3.2 B11, D-6)."""

from django.urls import path

from medilink.scheduling import views_s5b as b

urlpatterns = [path("<str:token>.ics", b.CalendarFeedIcsView.as_view(), name="calendar-feed-ics")]
