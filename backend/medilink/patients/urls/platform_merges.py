"""/api/v1/platform/merge-requests/ routes ([S3] block of config/urls.py)."""

from django.urls import path

from medilink.patients import views_merge as v

urlpatterns = [
    path("", v.PlatformMergeListView.as_view(), name="platform-merges"),
    path("<uuid:merge_id>/", v.PlatformMergeDetailView.as_view(), name="platform-merges-detail"),
    path(
        "<uuid:merge_id>/approve/",
        v.PlatformMergeApproveView.as_view(),
        name="platform-merges-approve",
    ),
    path(
        "<uuid:merge_id>/reject/",
        v.PlatformMergeRejectView.as_view(),
        name="platform-merges-reject",
    ),
    path("<uuid:merge_id>/undo/", v.PlatformMergeUndoView.as_view(), name="platform-merges-undo"),
]
