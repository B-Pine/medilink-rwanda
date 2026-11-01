from django.urls import path

from medilink.notifications import views

ann = views.PLATFORM_ANNOUNCEMENTS

urlpatterns = [
    path("announcements/", ann["list"].as_view(), name="platform-announcements"),
    path(
        "announcements/<uuid:announcement_id>/",
        ann["detail"].as_view(),
        name="platform-announcement",
    ),
    path(
        "announcements/<uuid:announcement_id>/publish/",
        ann["publish"].as_view(),
        name="platform-announcement-publish",
    ),
    path(
        "announcements/<uuid:announcement_id>/withdraw/",
        ann["withdraw"].as_view(),
        name="platform-announcement-withdraw",
    ),
    path(
        "notification-templates/",
        views.TemplatesView.as_view(),
        name="platform-notification-templates",
    ),
    path(
        "notification-templates/<uuid:template_id>/",
        views.TemplateDetailView.as_view(),
        name="platform-notification-template",
    ),
    path(
        "notification-templates/<uuid:template_id>/revise/",
        views.TemplateReviseView.as_view(),
        name="platform-notification-template-revise",
    ),
    path(
        "notification-templates/<uuid:template_id>/activate/",
        views.TemplateActivateView.as_view(),
        name="platform-notification-template-activate",
    ),
    path(
        "notification-deliveries/",
        views.PlatformDeliveriesView.as_view(),
        name="platform-notification-deliveries",
    ),
    path(
        "notification-deliveries/stats/",
        views.PlatformDeliveryStatsView.as_view(),
        name="platform-notification-delivery-stats",
    ),
]
