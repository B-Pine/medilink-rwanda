"""Append-only, hash-chained audit log (security 05 §6).

Append-only is enforced three times:
  1. ORM: save() only inserts; update()/delete() raise (this module)
  2. PostgreSQL trigger rejects UPDATE, DELETE and TRUNCATE for every role (migration 0002)
  3. The runtime role has only SELECT + INSERT on the table (medilink.core.db, after migrate)
Each entry stores hash = SHA-256(prev_hash || canonical JSON of the entry): see services.py.
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.db import models

from medilink.core.ids import uuid7


class AppendOnlyError(RuntimeError):
    pass


class AuditQuerySet(models.QuerySet):
    def update(self, **kwargs: Any) -> int:
        raise AppendOnlyError("The audit log is append-only.")

    def delete(self) -> tuple[int, dict[str, int]]:
        raise AppendOnlyError("The audit log is append-only.")

    update.queryset_only = True  # type: ignore[attr-defined]
    delete.queryset_only = True  # type: ignore[attr-defined]


class AuditEntry(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    sequence = models.BigIntegerField(unique=True, editable=False)
    occurred_at = models.DateTimeField(db_index=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
        help_text="Null for system actions and unknown accounts.",
    )
    actor_role = models.CharField(max_length=100, blank=True)
    facility = models.ForeignKey(
        "tenancy.Facility", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    action = models.CharField(max_length=64, db_index=True)
    object_type = models.CharField(max_length=64, blank=True)
    object_id = models.CharField(max_length=64, blank=True)
    reason = models.CharField(max_length=500, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True)
    request_id = models.CharField(max_length=64, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    prev_hash = models.CharField(max_length=64)
    hash = models.CharField(max_length=64, unique=True)

    objects = AuditQuerySet.as_manager()

    class Meta:
        ordering = ["sequence"]
        verbose_name_plural = "audit entries"
        indexes = [models.Index(fields=["facility", "occurred_at"], name="audit_facility_time")]

    def __str__(self) -> str:
        return f"#{self.sequence} {self.action}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise AppendOnlyError("Audit entries can't be changed.")
        kwargs["force_insert"] = True
        super().save(*args, **kwargs)

    def delete(self, *args: Any, **kwargs: Any) -> tuple[int, dict[str, int]]:
        raise AppendOnlyError("Audit entries can't be deleted.")
