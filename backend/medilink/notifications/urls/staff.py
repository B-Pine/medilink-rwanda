from django.urls import path

from medilink.notifications import views

inbox = views.STAFF_INBOX
ann = views.FACILITY_ANNOUNCEMENTS

urlpatterns = [
    path("notifications/", inbox["list"].as_view(), name="staff-notifications"),
    path(
        "notifications/unread-count/",
        inbox["count"].as_view(),
        name="staff-notifications-unread-count",
    ),
    path(
        "notifications/read-all/",
        inbox["read_all"].as_view(),
        name="staff-notifications-read-all",
    ),
    path(
        "notifications/<uuid:notification_id>/",
        inbox["detail"].as_view(),
        name="staff-notification",
    ),
    path(
        "notifications/<uuid:notification_id>/read/",
        inbox["read"].as_view(),
        name="staff-notification-read",
    ),
    path(
        "notification-preferences/",
        views.StaffPreferencesView.as_view(),
        name="staff-notification-preferences",
    ),
    path("announcements/", ann["list"].as_view(), name="staff-announcements"),
    path(
        "announcements/<uuid:announcement_id>/",
        ann["detail"].as_view(),
        name="staff-announcement",
    ),
    path(
        "announcements/<uuid:announcement_id>/publish/",
        ann["publish"].as_view(),
        name="staff-announcement-publish",
    ),
    path(
        "announcements/<uuid:announcement_id>/withdraw/",
        ann["withdraw"].as_view(),
        name="staff-announcement-withdraw",
    ),
    path(
        "notification-deliveries/",
        views.StaffDeliveriesView.as_view(),
        name="staff-notification-deliveries",
    ),
]
