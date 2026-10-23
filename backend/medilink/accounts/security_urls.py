"""S1 staff security routes, included at /api/v1/staff/auth/ ([S1] block of config/urls.py),
after Sprint 0's staff auth routes."""

from django.urls import path

from medilink.accounts import security_views as views

urlpatterns = [
    path("lock/", views.LockView.as_view(), name="staff-auth-lock"),
    path("unlock/", views.UnlockView.as_view(), name="staff-auth-unlock"),
    path("pin/", views.PinView.as_view(), name="staff-auth-pin"),
    path("step-up/", views.StepUpView.as_view(), name="staff-auth-step-up"),
]
