from django.urls import path

from medilink.support import views

urlpatterns = [
    path(
        "contact-messages/",
        views.PlatformContactListView.as_view(),
        name="platform-contact-messages",
    ),
    path(
        "contact-messages/<uuid:message_id>/handled/",
        views.PlatformContactHandleView.as_view(),
        name="platform-contact-message-handled",
    ),
    path(
        "support-requests/",
        views.PlatformRequestListView.as_view(),
        name="platform-support-requests",
    ),
    path(
        "support-requests/<uuid:request_id>/",
        views.PlatformRequestDetailView.as_view(),
        name="platform-support-request",
    ),
    path(
        "support-requests/<uuid:request_id>/replies/",
        views.PlatformRequestReplyView.as_view(),
        name="platform-support-request-replies",
    ),
    path(
        "support-requests/<uuid:request_id>/close/",
        views.PlatformRequestCloseView.as_view(),
        name="platform-support-request-close",
    ),
    path(
        "help-articles/",
        views.PlatformArticleListView.as_view(),
        name="platform-help-articles",
    ),
    path(
        "help-articles/<uuid:article_id>/",
        views.PlatformArticleDetailView.as_view(),
        name="platform-help-article",
    ),
    path(
        "help-articles/<uuid:article_id>/publish/",
        views.PlatformArticlePublishView.as_view(),
        name="platform-help-article-publish",
    ),
    path(
        "help-articles/<uuid:article_id>/unpublish/",
        views.PlatformArticleUnpublishView.as_view(),
        name="platform-help-article-unpublish",
    ),
]
