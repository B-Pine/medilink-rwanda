"""SESSION_ENGINE: database sessions bound to one audience (staff / patient / admin).

A session key only loads under the audience it was created for, so a staff session ID copied
into the patient cookie (or vice versa) is simply not found.
"""

from __future__ import annotations

from typing import Any, cast

from asgiref.sync import sync_to_async
from django.conf import settings
from django.contrib.auth import SESSION_KEY
from django.contrib.sessions.backends.base import CreateError, UpdateError
from django.contrib.sessions.backends.db import SessionStore as DBStore
from django.core.exceptions import SuspiciousOperation
from django.db import DatabaseError, IntegrityError, router, transaction
from django.utils import timezone

from medilink.accounts.models import UserSession

PENDING_KEY = "_ml_pending"
UPDATE_FIELDS = ["session_data", "expire_date", "audience", "user"]


class SessionStore(DBStore):
    def __init__(self, session_key: str | None = None, audience: str | None = None) -> None:
        super().__init__(session_key)
        self.audience = audience or ""

    @classmethod
    def get_model_class(cls) -> type[UserSession]:
        return UserSession

    def _get_session_from_db(self) -> UserSession | None:
        try:
            return UserSession.objects.get(
                session_key=self.session_key,
                audience=self.audience,
                expire_date__gt=timezone.now(),
            )
        except (UserSession.DoesNotExist, SuspiciousOperation):
            self._session_key = None
            return None

    async def _aget_session_from_db(self) -> UserSession | None:
        try:
            return await UserSession.objects.aget(
                session_key=self.session_key,
                audience=self.audience,
                expire_date__gt=timezone.now(),
            )
        except (UserSession.DoesNotExist, SuspiciousOperation):
            self._session_key = None
            return None

    def create_model_instance(self, data: dict[str, Any]) -> UserSession:
        obj = cast(UserSession, super().create_model_instance(data))
        obj.audience = self.audience
        pending = data.get(PENDING_KEY) or {}
        obj.user_id = data.get(SESSION_KEY) or pending.get("user_id") or None
        return obj

    def save(self, must_create: bool = False) -> None:
        """Like Django's DB store, but updates only the mutable columns (keeps created_at)."""
        if self.session_key is None:
            return self.create()
        data = self._get_session(no_load=must_create)  # type: ignore[attr-defined]
        obj = self.create_model_instance(data)
        using = router.db_for_write(self.model, instance=obj)
        try:
            with transaction.atomic(using=using):
                if must_create:
                    obj.save(force_insert=True, using=using)
                else:
                    obj.save(force_update=True, using=using, update_fields=UPDATE_FIELDS)
        except IntegrityError as exc:
            if must_create:
                raise CreateError from exc
            raise
        except DatabaseError as exc:
            if not must_create:
                raise UpdateError from exc
            raise

    async def asave(self, must_create: bool = False) -> None:
        await sync_to_async(self.save)(must_create)

    def get_session_cookie_age(self) -> int:
        audience = settings.SESSION_AUDIENCES.get(self.audience)
        if audience:
            # Server-side expiry follows the idle timeout (+1 min for the last-seen granularity).
            return int(audience["IDLE_TIMEOUT"]) + 60
        return int(settings.SESSION_COOKIE_AGE)
