"""/api/v1/public/master-data/{kind}/"""

from django.urls import path

from medilink.masterdata.views import VIEWS

urlpatterns = [
    path(f"{slug}/", views["public"].as_view(), name=f"public-master-data-{slug}")
    for slug, views in VIEWS.items()
    if "public" in views
]
