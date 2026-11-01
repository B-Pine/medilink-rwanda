"""Email + password authentication backend.

Uses Django's ModelBackend for the credential check, which already equalises timing for unknown
accounts (it hashes the password anyway) and rejects inactive users and unverified sign-ups.
Facility permissions are not Django permissions; they live in medilink.authz.
"""

from __future__ import annotations

from typing import Any

from django.contrib.auth.backends import ModelBackend


class EmailBackend(ModelBackend):
    def user_can_authenticate(self, user: Any) -> bool:
        """Inactive accounts and self sign-ups whose email isn't verified yet can't sign in."""
        pending = getattr(user, "email_verification_pending", False)
        return super().user_can_authenticate(user) and not pending

    def get_user_permissions(self, user_obj: Any, obj: Any = None) -> set[str]:
        return set()

    def get_group_permissions(self, user_obj: Any, obj: Any = None) -> set[str]:
        return set()

    def get_all_permissions(self, user_obj: Any, obj: Any = None) -> set[str]:
        return set()

    def has_perm(self, user_obj: Any, perm: str, obj: Any = None) -> bool:
        return False

    def has_module_perms(self, user_obj: Any, app_label: str) -> bool:
        return False
