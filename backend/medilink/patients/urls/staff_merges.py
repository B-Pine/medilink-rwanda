"""/api/v1/staff/merge-requests/ routes ([S3] block of config/urls.py)."""

from django.urls import path

from medilink.patients import views_merge as v

urlpatterns = [
    path("", v.StaffMergeListView.as_view(), name="staff-merges"),
    path("<uuid:merge_id>/", v.StaffMergeDetailView.as_view(), name="staff-merges-detail"),
    path(
        "<uuid:merge_id>/approve/", v.StaffMergeApproveView.as_view(), name="staff-merges-approve"
    ),
    path("<uuid:merge_id>/reject/", v.StaffMergeRejectView.as_view(), name="staff-merges-reject"),
    path("<uuid:merge_id>/cancel/", v.StaffMergeCancelView.as_view(), name="staff-merges-cancel"),
    path(
        "<uuid:merge_id>/escalate/",
        v.StaffMergeEscalateView.as_view(),
        name="staff-merges-escalate",
    ),
    path("<uuid:merge_id>/undo/", v.StaffMergeUndoView.as_view(), name="staff-merges-undo"),
]
