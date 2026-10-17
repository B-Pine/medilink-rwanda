"""Account emails, sent by Celery workers. Tasks take IDs only (security 06 §8)."""

from __future__ import annotations

from urllib.parse import urlencode

from celery import shared_task
from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from medilink.accounts.models import User
from medilink.accounts.principal import is_staff_member
from medilink.tenancy.context import rls_context

RESET_PATH = "/reset-password"


def _app_url(user: User) -> str:
    with rls_context(user_id=user.pk):
        staff = is_staff_member(user)
    return str(settings.STAFF_APP_URL if staff else settings.PATIENT_APP_URL).rstrip("/")


def build_reset_link(user: User) -> str:
    uid = urlsafe_base64_encode(force_bytes(str(user.pk)))
    token = default_token_generator.make_token(user)
    return f"{_app_url(user)}{RESET_PATH}?{urlencode({'uid': uid, 'token': token})}"


@shared_task(ignore_result=True, time_limit=30, soft_time_limit=20, max_retries=3)
def send_password_reset_email(user_id: str) -> None:
    user = User.objects.filter(pk=user_id, is_active=True).first()
    if user is None:
        return
    minutes = settings.PASSWORD_RESET_TIMEOUT // 60
    send_mail(
        subject="Reset your MediLink password",
        message=(
            "We received a request to reset the password of your MediLink account.\n\n"
            f"Open this link within {minutes} minutes to choose a new password:\n"
            f"{build_reset_link(user)}\n\n"
            "The link works once. If you didn't ask for this, you can ignore this email: "
            "your password stays the same.\n"
        ),
        from_email=None,
        recipient_list=[user.email],
    )


@shared_task(ignore_result=True, time_limit=30, soft_time_limit=20, max_retries=3)
def send_password_changed_email(user_id: str) -> None:
    user = User.objects.filter(pk=user_id).first()
    if user is None:
        return
    send_mail(
        subject="Your MediLink password was changed",
        message=(
            "The password of your MediLink account was just changed and all your sessions were "
            "signed out.\n\nIf this wasn't you, reset your password now and contact support.\n"
        ),
        from_email=None,
        recipient_list=[user.email],
    )
