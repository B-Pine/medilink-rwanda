"""Audit action catalogue. `audit.record()` refuses unknown actions."""

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

ACTIONS = frozenset(
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
