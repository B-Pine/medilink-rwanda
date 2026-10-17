"""Engineering admin: platform admins only, TOTP-verified, disabled in production by default."""

from django.http import HttpRequest
from django_otp.admin import OTPAdminSite


class MedilinkAdminSite(OTPAdminSite):
    site_header = "MediLink Rwanda operations"
    site_title = "MediLink ops"
    index_title = "Operations"

    def has_permission(self, request: HttpRequest) -> bool:
        user = request.user
        return bool(super().has_permission(request) and getattr(user, "is_platform_admin", False))
