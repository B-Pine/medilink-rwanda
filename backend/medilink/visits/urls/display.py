"""/api/v1/display/ (public, display token)."""

from django.urls import path

from medilink.visits import views as v

urlpatterns = [path("<str:token>/", v.DisplayView.as_view(), name="display-board")]
