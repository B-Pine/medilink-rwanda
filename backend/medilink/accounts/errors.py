"""S1 API errors kept in S1 code, so core/exceptions.py needs no edit (contract §3.7)."""

from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions, status


class SessionLocked(exceptions.APIException):
    """401 `session_locked`: the staff session is idle-locked; unlock with a PIN or password.

    Not a NotAuthenticated subclass: the error handler maps those to `not_authenticated`."""

    status_code = status.HTTP_401_UNAUTHORIZED
    default_code = "session_locked"
    default_detail = _("Your session is locked. Unlock it to continue.")
