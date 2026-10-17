"""Users (email login, no username), MFA recovery codes and audience-scoped sessions."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.sessions.base_session import AbstractBaseSession
from django.db import models
from django.db.models.functions import Lower

from medilink.core.ids import uuid7


class Language(models.TextChoices):
    RW = "rw", "Kinyarwanda"
    EN = "en", "English"
    FR = "fr", "Français"


def normalize_email(email: str | None) -> str:
    """Emails are case-insensitive identifiers: stored and compared trimmed and lowercased."""
    return (email or "").strip().lower()


if TYPE_CHECKING:
    _UserManagerBase = BaseUserManager["User"]
else:
    _UserManagerBase = BaseUserManager


class UserManager(_UserManagerBase):
    use_in_migrations = True

    def get_by_natural_key(self, username: str | None) -> User:
        return self.get(email=normalize_email(username))

    def create_user(self, email: str, password: str | None = None, **extra: Any) -> User:
        if not email:
            raise ValueError("An email address is required.")
        user = self.model(email=normalize_email(email), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str | None = None, **extra: Any) -> User:
        """`createsuperuser` creates a platform admin (super admin is a flag, not a role)."""
        extra["is_platform_admin"] = True
        extra.setdefault("is_active", True)
        return self.create_user(email, password, **extra)


class User(AbstractBaseUser):
    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    email = models.EmailField(max_length=254, unique=True)
    full_name = models.CharField(max_length=150)
    preferred_language = models.CharField(
        max_length=2, choices=Language.choices, default=Language.RW
    )
    is_platform_admin = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        constraints = [
            models.UniqueConstraint(Lower("email"), name="accounts_user_email_ci_unique")
        ]

    def __str__(self) -> str:
        return f"user {self.pk}"  # never the email: str() ends up in logs

    def save(self, *args: Any, **kwargs: Any) -> None:
        self.email = normalize_email(self.email)
        super().save(*args, **kwargs)

    def clean(self) -> None:
        super().clean()
        self.email = normalize_email(self.email)

    def get_full_name(self) -> str:
        return self.full_name

    def get_short_name(self) -> str:
        return self.full_name.split(" ")[0] if self.full_name else ""

    # Django admin integration: only platform admins may use the (OTP-protected) admin site.
    @property
    def is_staff(self) -> bool:
        return self.is_platform_admin

    @property
    def is_superuser(self) -> bool:
        return self.is_platform_admin

    def has_perm(self, perm: str, obj: Any = None) -> bool:
        return self.is_active and self.is_platform_admin

    def has_perms(self, perm_list: Any, obj: Any = None) -> bool:
        return all(self.has_perm(perm, obj) for perm in perm_list)

    def has_module_perms(self, app_label: str) -> bool:
        return self.is_active and self.is_platform_admin


class RecoveryCode(models.Model):
    """Single-use MFA recovery code, stored hashed (Argon2) and shown to the user only once."""

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="recovery_codes")
    code_hash = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    used_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"recovery code {self.pk}"


class UserSession(AbstractBaseSession):
    """Server-side session row, tagged with its audience and user so sessions can be listed and
    revoked per user (password reset, deactivation)."""

    audience = models.CharField(max_length=16, db_index=True)
    user = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.CASCADE, related_name="sessions"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(AbstractBaseSession.Meta):
        db_table = "accounts_user_session"

    @classmethod
    def get_session_store_class(cls) -> type:
        from medilink.accounts.session_store import SessionStore

        return SessionStore
