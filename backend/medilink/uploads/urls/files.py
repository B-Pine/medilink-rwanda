"""/api/v1/files/ (dev and test only, local storage). A plain Django view, so it's not in
the OpenAPI schema."""

from django.urls import path

from medilink.uploads import views

# Dev and test only (local storage); a plain Django view, so it's not in the OpenAPI schema.
urlpatterns = [
    path("<str:token>/", views.serve_local_file, name="files-download"),
]
