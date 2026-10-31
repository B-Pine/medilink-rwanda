"""/api/v1/public/ S5 routes: discovery and symptoms (contract sprint-05 §3.1)."""

from django.urls import path

from medilink.scheduling import views_booking as v

urlpatterns = [
    path("facilities/search/", v.SearchView.as_view(), name="public-facility-search"),
    path("facilities/<slug:slug>/", v.FacilityProfileView.as_view(), name="public-facility"),
    path(
        "facilities/<slug:slug>/slots/", v.FacilitySlotsView.as_view(), name="public-facility-slots"
    ),
    path("symptoms/", v.SymptomsView.as_view(), name="public-symptoms"),
]
