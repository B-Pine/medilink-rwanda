"""Audit action catalogue. `audit.record()` refuses unknown actions.

Sprints add their actions with `extend_actions()` (shared-file protocol:
docs/architecture/contracts/README.md) instead of editing the core set.
"""

import re

LOGIN_SUCCESS = "auth.login.success"
LOGIN_FAILURE = "auth.login.failure"
MFA_ENROLLED = "auth.mfa.enrolled"
MFA_SUCCESS = "auth.mfa.success"
MFA_FAILURE = "auth.mfa.failure"
LOGOUT = "auth.logout"
PASSWORD_RESET_REQUESTED = "auth.password_reset.requested"  # noqa: S105 (not a secret)
PASSWORD_RESET_COMPLETED = "auth.password_reset.completed"  # noqa: S105 (not a secret)
FACILITY_SWITCHED = "staff.facility.switched"
PATIENT_REGISTERED = "patient.registered"

# Mutable on purpose: `extend_actions()` adds sprint actions in place, so `record()` sees them.
ACTIONS: set[str] = set(
    {
        LOGIN_SUCCESS,
        LOGIN_FAILURE,
        MFA_ENROLLED,
        MFA_SUCCESS,
        MFA_FAILURE,
        LOGOUT,
        PASSWORD_RESET_REQUESTED,
        PASSWORD_RESET_COMPLETED,
        FACILITY_SWITCHED,
        PATIENT_REGISTERED,
    }
)

_ACTION_PATTERN = re.compile(r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,4}$")


def extend_actions(names: frozenset[str] | set[str]) -> None:
    """Register a sprint's audit actions. Refuses malformed or already-registered names."""
    invalid = sorted(name for name in names if not _ACTION_PATTERN.match(name))
    if invalid:
        raise ValueError(f"Malformed audit action names: {invalid}")
    clash = sorted(set(names) & ACTIONS)
    if clash:
        raise ValueError(f"Audit actions already registered: {clash}")
    ACTIONS.update(names)


# ---- Sprint extensions: each sprint adds its import + extend_actions() ONLY between its markers,
# e.g.  from medilink.patients import audit_actions as _s3   (mark the import noqa E402)
#       extend_actions(_s3.ACTIONS)
# [S1]
from medilink.onboarding import audit_actions as _s1  # noqa: E402

extend_actions(_s1.ACTIONS)
# [/S1]
# [S3]
from medilink.patients import audit_actions as _s3  # noqa: E402

extend_actions(_s3.ACTIONS)
# [/S3]
# [S9]
# [/S9]
# [S2]
from medilink.facilities import audit_actions as _s2  # noqa: E402

extend_actions(_s2.ACTIONS)
# [/S2]
# [S10]
# [/S10]
