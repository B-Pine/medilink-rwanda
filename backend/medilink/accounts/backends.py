"""Email + password authentication backend.

Uses Django's ModelBackend for the credential check, which already equalises timing for unknown
accounts (it hashes the password anyway) and rejects inactive users. Facility permissions are not
Django permissions; they live in medilink.authz.
"""

from __future__ import annotations

from typing import Any

from django.contrib.auth.backends import ModelBackend


class EmailBackend(ModelBackend):
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
