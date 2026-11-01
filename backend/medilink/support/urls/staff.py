from django.urls import path

from medilink.support import views

r = views.STAFF_REQUESTS

urlpatterns = [
    path("help-articles/", views.StaffArticleListView.as_view(), name="staff-help-articles"),
    path(
        "help-articles/<slug:slug>/",
        views.StaffArticleDetailView.as_view(),
        name="staff-help-article",
    ),
    path("support-requests/", r["list"].as_view(), name="staff-support-requests"),
    path(
        "support-requests/<uuid:request_id>/",
        r["detail"].as_view(),
        name="staff-support-request",
    ),
    path(
        "support-requests/<uuid:request_id>/messages/",
        r["messages"].as_view(),
        name="staff-support-request-messages",
    ),
    path(
        "support-requests/<uuid:request_id>/close/",
        r["close"].as_view(),
        name="staff-support-request-close",
    ),
]
