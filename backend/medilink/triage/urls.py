from django.urls import path

from medilink.triage.views import TriageView

urlpatterns = [path("triage/", TriageView.as_view(), name="public-triage")]
