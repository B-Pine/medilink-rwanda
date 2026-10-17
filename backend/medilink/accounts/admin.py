from typing import Any

from django.contrib import admin
from django.http import HttpRequest

from medilink.accounts.models import User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("id", "full_name", "is_platform_admin", "is_active", "created_at")
    list_filter = ("is_platform_admin", "is_active")
    search_fields = ("id",)
    fields = (
        "id",
        "email",
        "full_name",
        "preferred_language",
        "is_platform_admin",
        "is_active",
        "email_verified_at",
        "last_login",
        "created_at",
    )
    readonly_fields = ("id", "email", "last_login", "created_at", "email_verified_at")

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False  # accounts are created through sign-up, invitations or createsuperuser

    def has_delete_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False  # deactivate instead
