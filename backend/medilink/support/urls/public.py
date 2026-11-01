from django.urls import path

from medilink.support import views

urlpatterns = [
    path("help-articles/", views.PublicArticleListView.as_view(), name="public-help-articles"),
    path(
        "help-articles/<slug:slug>/",
        views.PublicArticleDetailView.as_view(),
        name="public-help-article",
    ),
]
