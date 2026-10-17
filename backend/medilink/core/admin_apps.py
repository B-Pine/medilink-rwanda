from django.contrib.admin.apps import AdminConfig


class MedilinkAdminConfig(AdminConfig):
    """django.contrib.admin, but the default site requires a verified OTP device (django-otp)."""

    default_site = "medilink.core.admin_site.MedilinkAdminSite"
