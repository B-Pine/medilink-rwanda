"""Account emails, sent by Celery workers. Tasks take IDs only (security 06 §8).

Each email is in the account's language (rw, en, fr) and uses the branded layout of
`medilink.core.mail` (upgrade 17). Kinyarwanda and French texts need native-speaker review
before go-live.
"""

from __future__ import annotations

from urllib.parse import urlencode

from celery import shared_task
from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from medilink.accounts.models import User
from medilink.accounts.principal import is_staff_member
from medilink.core.mail import send_branded
from medilink.tenancy.context import rls_context

RESET_PATH = "/reset-password"

# key -> language -> (subject, body, button). Bodies are str.format templates; a line holding
# only {link} becomes the email's button.
TEXTS: dict[str, dict[str, tuple[str, str, str]]] = {
    "reset": {
        "en": (
            "Reset your MediLink password",
            "We received a request to reset the password of your MediLink account.\n\n"
            "Open this link within {minutes} minutes to choose a new password:\n{link}\n\n"
            "The link works once. If you didn't ask for this, ignore this email: your password "
            "stays the same.",
            "Choose a new password",
        ),
        "fr": (
            "Réinitialisez votre mot de passe MediLink",
            "Nous avons reçu une demande de réinitialisation du mot de passe de votre compte "
            "MediLink.\n\nOuvrez ce lien dans les {minutes} minutes pour choisir un nouveau mot "
            "de passe :\n{link}\n\nLe lien ne fonctionne qu'une fois. Si vous n'avez rien "
            "demandé, ignorez cet e-mail : votre mot de passe ne change pas.",
            "Choisir un mot de passe",
        ),
        "rw": (
            "Hindura ijambo ry'ibanga rya MediLink",
            "Twakiriye ubusabe bwo guhindura ijambo ry'ibanga rya konti yawe ya MediLink.\n\n"
            "Fungura uyu murongo mu minota {minutes} kugira ngo uhitemo ijambo ry'ibanga "
            "rishya:\n{link}\n\nUmurongo ukora rimwe gusa. Niba atari wowe wabisabye, "
            "wirengagize iyi imeyili: ijambo ry'ibanga ryawe ntirihinduka.",
            "Hitamo ijambo ry'ibanga",
        ),
    },
    "changed": {
        "en": (
            "Your MediLink password was changed",
            "The password of your MediLink account was just changed and your other sessions "
            "were signed out.\n\nIf this wasn't you, reset your password now:\n{link}",
            "Reset my password",
        ),
        "fr": (
            "Votre mot de passe MediLink a été modifié",
            "Le mot de passe de votre compte MediLink vient d'être modifié et vos autres "
            "sessions ont été fermées.\n\nSi ce n'était pas vous, réinitialisez-le "
            "maintenant :\n{link}",
            "Réinitialiser",
        ),
        "rw": (
            "Ijambo ry'ibanga rya MediLink ryahinduwe",
            "Ijambo ry'ibanga rya konti yawe ya MediLink rimaze guhindurwa, kandi wasohowe "
            "ahandi hose wari winjiye.\n\nNiba atari wowe, rihindure nonaha:\n{link}",
            "Hindura ijambo ry'ibanga",
        ),
    },
    "verify": {
        "en": (
            "Confirm your email to finish creating your MediLink account",
            "Thank you for signing up to MediLink.\n\nOpen this link within {days} days to "
            "confirm your email and sign in:\n{link}\n\nIf you didn't sign up, ignore this "
            "email: no account will be activated.",
            "Confirm my email",
        ),
        "fr": (
            "Confirmez votre e-mail pour créer votre compte MediLink",
            "Merci de vous être inscrit sur MediLink.\n\nOuvrez ce lien dans les {days} jours "
            "pour confirmer votre e-mail et vous connecter :\n{link}\n\nSi vous ne vous êtes "
            "pas inscrit, ignorez cet e-mail : aucun compte ne sera activé.",
            "Confirmer mon e-mail",
        ),
        "rw": (
            "Emeza imeyili yawe urangize gufungura konti ya MediLink",
            "Murakoze kwiyandikisha kuri MediLink.\n\nFungura uyu murongo mu minsi {days} "
            "kugira ngo wemeze imeyili yawe kandi winjire:\n{link}\n\nNiba atari wowe "
            "wiyandikishije, wirengagize iyi imeyili: nta konti izafungurwa.",
            "Emeza imeyili",
        ),
    },
    "exists": {
        "en": (
            "Someone tried to create a MediLink account with your email",
            "Someone, maybe you, tried to create a MediLink account with this email address. "
            "You already have an account, so nothing was changed.\n\nSign in:\n{link}\n\n"
            "Forgot your password? {forgot}\n\nIf this wasn't you, ignore this email.",
            "Sign in",
        ),
        "fr": (
            "Quelqu'un a essayé de créer un compte MediLink avec votre e-mail",
            "Quelqu'un, peut-être vous, a essayé de créer un compte MediLink avec cette "
            "adresse. Vous avez déjà un compte, rien n'a donc changé.\n\nConnexion :\n{link}"
            "\n\nMot de passe oublié ? {forgot}\n\nSi ce n'était pas vous, ignorez cet e-mail.",
            "Se connecter",
        ),
        "rw": (
            "Hari uwagerageje gufungura konti ya MediLink akoresheje imeyili yawe",
            "Hari umuntu, ushobora kuba ari wowe, wagerageje gufungura konti ya MediLink "
            "akoresheje iyi imeyili. Usanzwe ufite konti, nta cyahindutse.\n\nInjira:\n{link}"
            "\n\nWibagiwe ijambo ry'ibanga? {forgot}\n\nNiba atari wowe, wirengagize iyi "
            "imeyili.",
            "Injira",
        ),
    },
    "locked": {
        "en": (
            "Your MediLink sign-in was locked",
            "Sign-in to your MediLink account was locked for {minutes} minutes after too many "
            "wrong {step}.\n\nIf this was you, wait and try again. If it wasn't, someone may be "
            "guessing your password: reset it now and contact support.\n{link}",
            "Reset my password",
        ),
        "fr": (
            "La connexion à votre compte MediLink a été bloquée",
            "La connexion à votre compte MediLink a été bloquée pendant {minutes} minutes "
            "après trop de {step} erronés.\n\nSi c'était vous, patientez puis réessayez. "
            "Sinon, quelqu'un essaie peut-être de deviner votre mot de passe : "
            "réinitialisez-le maintenant et contactez le support.\n{link}",
            "Réinitialiser",
        ),
        "rw": (
            "Kwinjira kuri konti yawe ya MediLink byahagaritswe",
            "Kwinjira kuri konti yawe ya MediLink byahagaritswe iminota {minutes} nyuma yo "
            "kwibeshya {step} inshuro nyinshi.\n\nNiba ari wowe, tegereza wongere ugerageze. "
            "Niba atari wowe, hari ushobora kuba agerageza gukeka ijambo ry'ibanga ryawe: "
            "rihindure nonaha kandi uvugane n'abatanga ubufasha.\n{link}",
            "Hindura ijambo ry'ibanga",
        ),
    },
}
STEPS = {
    "en": {"mfa": "two-step verification codes", "password": "passwords"},
    "fr": {"mfa": "codes de vérification", "password": "mots de passe"},
    "rw": {"mfa": "kode zo kwemeza", "password": "ijambo ry'ibanga"},
}


def _language(user: User) -> str:
    return user.preferred_language if user.preferred_language in STEPS else "en"


def _send(user: User, key: str, **values: object) -> None:
    lang = _language(user)
    subject, body, button = TEXTS[key][lang]
    send_branded(
        subject=subject,
        text=body.format(**values),
        to=[user.email],
        language=lang,
        action=button,
    )


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
    _send(user, "reset", minutes=minutes, link=build_reset_link(user))


@shared_task(ignore_result=True, time_limit=30, soft_time_limit=20, max_retries=3)
def send_password_changed_email(user_id: str) -> None:
    user = User.objects.filter(pk=user_id).first()
    if user is None:
        return
    _send(user, "changed", link=f"{_app_url(user)}/forgot-password")


@shared_task(ignore_result=True, time_limit=30, soft_time_limit=20, max_retries=3)
def send_verify_email(user_id: str) -> None:
    """Sign-up: the link that activates a new patient account."""
    from medilink.accounts import verification

    user = User.objects.filter(pk=user_id, is_active=True, email_verification_pending=True).first()
    if user is None:
        return
    days = settings.EMAIL_VERIFICATION_TIMEOUT // 86400
    _send(user, "verify", days=days, link=verification.build_link(user))


@shared_task(ignore_result=True, time_limit=30, soft_time_limit=20, max_retries=3)
def send_account_exists_email(user_id: str) -> None:
    """Sign-up with an email that already has an account: tell the owner, never the requester."""
    user = User.objects.filter(pk=user_id, is_active=True).first()
    if user is None:
        return
    if user.email_verification_pending:  # signed up before and never confirmed: resend the link
        send_verify_email(user_id)
        return
    base = _app_url(user)
    _send(user, "exists", link=f"{base}/login", forgot=f"{base}/forgot-password")


@shared_task(ignore_result=True, time_limit=30, soft_time_limit=20, max_retries=3)
def send_account_locked_email(user_id: str, kind: str) -> None:
    """Too many failed sign-in (or MFA) attempts locked the account for a while (security 03 §6)."""
    user = User.objects.filter(pk=user_id, is_active=True).first()
    if user is None:
        return
    seconds = settings.MFA_LOCK_SECONDS if kind == "mfa" else settings.AUTH_LOCKOUT["LOCK_SECONDS"]
    minutes = max(1, int(seconds) // 60)
    step = STEPS[_language(user)]["mfa" if kind == "mfa" else "password"]
    _send(user, "locked", minutes=minutes, step=step, link=f"{_app_url(user)}/forgot-password")
