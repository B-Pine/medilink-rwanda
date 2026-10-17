from django.urls import path

from medilink.accounts import views

staff_auth_urlpatterns = [
    path("login/", views.StaffLoginView.as_view(), name="staff-auth-login"),
    path("mfa/setup/", views.StaffMfaSetupView.as_view(), name="staff-auth-mfa-setup"),
    path("mfa/confirm/", views.StaffMfaConfirmView.as_view(), name="staff-auth-mfa-confirm"),
    path("mfa/verify/", views.StaffMfaVerifyView.as_view(), name="staff-auth-mfa-verify"),
    path("logout/", views.StaffLogoutView.as_view(), name="staff-auth-logout"),
    path("me/", views.StaffMeView.as_view(), name="staff-auth-me"),
    path(
        "active-facility/",
        views.StaffActiveFacilityView.as_view(),
        name="staff-auth-active-facility",
    ),
]

patient_auth_urlpatterns = [
    path("register/", views.PatientRegisterView.as_view(), name="patient-auth-register"),
    path("login/", views.PatientLoginView.as_view(), name="patient-auth-login"),
    path("logout/", views.PatientLogoutView.as_view(), name="patient-auth-logout"),
    path("me/", views.PatientMeView.as_view(), name="patient-auth-me"),
]

account_urlpatterns = [
    path("password-reset/", views.PasswordResetView.as_view(), name="auth-password-reset"),
    path(
        "password-reset/confirm/",
        views.PasswordResetConfirmView.as_view(),
        name="auth-password-reset-confirm",
    ),
]
