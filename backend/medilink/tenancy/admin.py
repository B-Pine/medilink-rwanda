"""Admin for platform data. Facility memberships are RLS-protected and managed by seed/invites,
so they are deliberately not editable here."""

from typing import Any

from django.contrib import admin
from django.http import HttpRequest

from medilink.tenancy.models import Facility, Organization, Permission, Role


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "created_at")
    search_fields = ("name",)


@admin.register(Facility)
class FacilityAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "facility_type", "ownership", "status", "organization")
    list_filter = ("facility_type", "ownership", "status")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}

    def has_delete_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False  # facilities are deactivated, never deleted


class _ReadOnlyAdmin(admin.ModelAdmin):
    def has_add_permission(self, request: HttpRequest) -> bool:
        return False

    def has_change_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def has_delete_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False


@admin.register(Role)
class RoleAdmin(_ReadOnlyAdmin):
    list_display = ("code", "name")
    filter_horizontal = ("permissions",)


@admin.register(Permission)
class PermissionAdmin(_ReadOnlyAdmin):
    list_display = ("code", "description")
