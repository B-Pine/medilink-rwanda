"""/api/v1/platform/break-glass/... (contract sprint-06 §3.3 G1, G2)."""

from django.urls import path

from medilink.clinical import views_s6b as b

urlpatterns = [
    path("", b.BreakGlassView.as_view(), name="platform-break-glass"),
    path(
        "<uuid:session_id>/review/",
        b.BreakGlassReviewView.as_view(),
        name="platform-break-glass-review",
    ),
    path("<uuid:session_id>/end/", b.BreakGlassEndView.as_view(), name="platform-break-glass-end"),
    path(
        "<uuid:session_id>/patients/<uuid:patient_id>/history/",
        b.BreakGlassHistoryView.as_view(),
        name="platform-break-glass-history",
    ),
]
