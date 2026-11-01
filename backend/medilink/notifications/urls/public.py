from django.urls import path

from medilink.notifications import views

urlpatterns = [
    path("web-push-key/", views.WebPushKeyView.as_view(), name="notifications-web-push-key"),
]
