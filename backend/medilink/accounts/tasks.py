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


@shared_task(ignore_result=True, time_limit=30, soft_time_limit=20, max_retries=3)
def send_verify_email(user_id: str) -> None:
    """Sign-up: the link that activates a new patient account."""
    from medilink.accounts import verification

    user = User.objects.filter(pk=user_id, is_active=True, email_verification_pending=True).first()
    if user is None:
        return
    days = settings.EMAIL_VERIFICATION_TIMEOUT // 86400
    send_mail(
        subject="Confirm your email to finish creating your MediLink account",
        message=(
            "Thank you for signing up to MediLink.\n\n"
            f"Open this link within {days} days to confirm your email and sign in:\n"
            f"{verification.build_link(user)}\n\n"
            "If you didn't sign up, you can ignore this email: no account will be activated.\n"
        ),
        from_email=None,
        recipient_list=[user.email],
    )


@shared_task(ignore_result=True, time_limit=30, soft_time_limit=20, max_retries=3)
def send_account_exists_email(user_id: str) -> None:
    """Sign-up with an email that already has an account: tell the owner, never the requester."""
    user = User.objects.filter(pk=user_id, is_active=True).first()
    if user is None:
        return
    if user.email_verification_pending:  # signed up before and never confirmed: resend the link
        send_verify_email(user_id)
        return
    send_mail(
        subject="Someone tried to create a MediLink account with your email",
        message=(
            "Someone, maybe you, tried to create a MediLink account with this email address. "
            "You already have an account, so nothing was changed.\n\n"
            f"Sign in: {_app_url(user)}/login\n"
            f"Forgot your password? {_app_url(user)}/forgot-password\n\n"
            "If this wasn't you, you can ignore this email.\n"
        ),
        from_email=None,
        recipient_list=[user.email],
    )


@shared_task(ignore_result=True, time_limit=30, soft_time_limit=20, max_retries=3)
def send_account_locked_email(user_id: str, kind: str) -> None:
    """Too many failed sign-in (or MFA) attempts locked the account for a while (security 03 §6)."""
    user = User.objects.filter(pk=user_id, is_active=True).first()
    if user is None:
        return
    step = "two-step verification codes" if kind == "mfa" else "passwords"
    seconds = settings.MFA_LOCK_SECONDS if kind == "mfa" else settings.AUTH_LOCKOUT["LOCK_SECONDS"]
    minutes = max(1, int(seconds) // 60)
    send_mail(
        subject="Your MediLink sign-in was locked",
        message=(
            f"Sign-in to your MediLink account was locked for {minutes} minutes after too many "
            f"wrong {step}.\n\n"
            "If this was you, wait and try again. If it wasn't, someone may know or be guessing "
            f"your password: reset it now at {_app_url(user)}/forgot-password and contact "
            "support.\n"
        ),
        from_email=None,
        recipient_list=[user.email],
    )
