"""Tunable S3 limits: a Django setting wins, then the environment variable, then the default.

PATIENTS_DEPENDENT_MAX_AGE           guardians add dependents under this age (contract §2.2)
PATIENTS_CARE_RELATIONSHIP_DAYS      a visit this recent counts as a care relationship (R2)
PATIENTS_ACCESS_REASON_TTL_SECONDS   how long a given access reason opens a record (R2)
"""

from __future__ import annotations

import os

from django.conf import settings


def int_setting(name: str, default: int) -> int:
    value = getattr(settings, name, None)
    if value is None:
        value = os.environ.get(name, "").strip() or None
    return default if value is None else int(value)


def dependent_max_age() -> int:
    return int_setting("PATIENTS_DEPENDENT_MAX_AGE", 18)


def care_window_days() -> int:
    return int_setting("PATIENTS_CARE_RELATIONSHIP_DAYS", 30)


def reason_ttl_seconds() -> int:
    return int_setting("PATIENTS_ACCESS_REASON_TTL_SECONDS", 15 * 60)
