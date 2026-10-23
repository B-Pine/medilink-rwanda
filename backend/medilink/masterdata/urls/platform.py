"""/api/v1/platform/master-data/{kind}/... (no DELETE: retire with is_active=false)."""

from django.urls import URLPattern, path

from medilink.masterdata.views import VIEWS

urlpatterns: list[URLPattern] = []
for slug, views in VIEWS.items():
    urlpatterns += [
        path(f"{slug}/", views["platform_list"].as_view(), name=f"platform-master-data-{slug}"),
        path(
            f"{slug}/<uuid:item_id>/",
            views["platform_detail"].as_view(),
            name=f"platform-master-data-{slug}-detail",
        ),
        path(
            f"{slug}/<uuid:item_id>/changes/",
            views["platform_changes"].as_view(),
            name=f"platform-master-data-{slug}-changes",
        ),
    ]
    if "import_create" in views:
        urlpatterns += [
            path(
                f"{slug}/imports/",
                views["import_create"].as_view(),
                name=f"platform-master-data-{slug}-imports",
            ),
            path(
                f"{slug}/imports/<uuid:import_id>/",
                views["import_detail"].as_view(),
                name=f"platform-master-data-{slug}-import",
            ),
            path(
                f"{slug}/imports/<uuid:import_id>/confirm/",
                views["import_confirm"].as_view(),
                name=f"platform-master-data-{slug}-import-confirm",
            ),
        ]
