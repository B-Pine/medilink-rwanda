from django.urls import path

from medilink.triage.views import AssistantView, TriageView

urlpatterns = [
    path("triage/", TriageView.as_view(), name="public-triage"),
    path("assistant/", AssistantView.as_view(), name="public-assistant"),
]
