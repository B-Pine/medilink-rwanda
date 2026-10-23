"""URL configuration. One audience per prefix (architecture 02 §1)."""

from django.conf import settings
from django.contrib import admin
from django.urls import URLPattern, URLResolver, include, path

from medilink.accounts.urls import (
    account_urlpatterns,
    patient_auth_urlpatterns,
    staff_auth_urlpatterns,
)
from medilink.core.views import CsrfTokenView, HealthView

api_v1: list[URLPattern | URLResolver] = [
    path("health/", HealthView.as_view(), name="health"),
    path("csrf/", CsrfTokenView.as_view(), name="csrf"),
    path("staff/auth/", include(staff_auth_urlpatterns)),
    path("patient/auth/", include(patient_auth_urlpatterns)),
    path("auth/", include(account_urlpatterns)),
    # ---- Wave 1 routes: each sprint adds include() lines ONLY between its own markers ------
    # [S1]
    path("staff/uploads/", include("medilink.uploads.urls.staff")),
    path("patient/uploads/", include("medilink.uploads.urls.patient")),
    path("files/", include("medilink.uploads.urls.files")),
    # [/S1]
    # [S3]
    # [/S3]
    # [S9]
    # [/S9]
]

if settings.SCHEMA_ENABLED:  # non-production only (architecture 02 §7)
    from drf_spectacular.views import SpectacularAPIView

    api_v1.append(path("schema/", SpectacularAPIView.as_view(), name="schema"))
    if "drf_spectacular_sidecar" in settings.INSTALLED_APPS:
        from drf_spectacular.views import SpectacularSwaggerSplitView

        api_v1.append(
            path(
                "schema/swagger/",
                SpectacularSwaggerSplitView.as_view(url_name="schema"),
                name="swagger-ui",
            )
        )

urlpatterns: list[URLPattern | URLResolver] = [path("api/v1/", include(api_v1))]

if settings.ADMIN_ENABLED:
    urlpatterns.append(path(settings.ADMIN_URL, admin.site.urls))

handler400 = "medilink.core.exceptions.handler_bad_request"
handler403 = "medilink.core.exceptions.handler_permission_denied"
handler404 = "medilink.core.exceptions.handler_not_found"
handler500 = "medilink.core.exceptions.handler_server_error"
