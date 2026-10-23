"""/api/v1/staff/master-data/{kind}/"""

from django.urls import path

from medilink.masterdata.views import VIEWS

urlpatterns = [
    path(f"{slug}/", views["staff"].as_view(), name=f"staff-master-data-{slug}")
    for slug, views in VIEWS.items()
]
