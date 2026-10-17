from typing import Any

from django.contrib import admin
from django.http import HttpRequest

from medilink.audit.models import AuditEntry


@admin.register(AuditEntry)
class AuditEntryAdmin(admin.ModelAdmin):
    """Read-only view of the audit log."""

    list_display = ("sequence", "occurred_at", "action", "actor_role", "facility", "object_type")
    list_filter = ("action",)
    ordering = ("-sequence",)

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False

    def has_change_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def has_delete_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False
