"""Sign in with Google for patients (upgrade 17, security 03 §5).

The web page and the app get an ID token from Google and send it to the API; the API checks it
here, never trusting anything the client says about the person:
- RS256 signature against Google's published keys (JWKS, cached for an hour),
- issuer is Google, audience is one of our OAuth client IDs, not expired (60 s clock leeway),
- the email is one Google has verified.
No Google access token is requested or stored; only the stable Google account ID (`sub`) is kept
to recognise the person next time.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any
from urllib.parse import urlsplit

import jwt
from django.conf import settings

logger = logging.getLogger(__name__)

ISSUERS = ("accounts.google.com", "https://accounts.google.com")


class GoogleTokenError(Exception):
    """The ID token is missing, malformed, forged, expired or not meant for MediLink."""


@dataclass(frozen=True)
class GoogleClaims:
    sub: str
    email: str
    email_verified: bool
    name: str
    picture: str = ""  # the Google profile photo, https on googleusercontent.com, else ""


def web_client_id() -> str:
    """The OAuth client the web button and the Android app ask Google for (also the app's
    `serverClientId`, so its tokens carry this audience)."""
    return str(getattr(settings, "GOOGLE_OAUTH_WEB_CLIENT_ID", "") or "")


def audiences() -> list[str]:
    extra = list(getattr(settings, "GOOGLE_OAUTH_CLIENT_IDS", []) or [])
    return [aud for aud in [web_client_id(), *extra] if aud]


def enabled() -> bool:
    return bool(web_client_id())


@lru_cache(maxsize=1)
def _jwks_client() -> jwt.PyJWKClient:
    return jwt.PyJWKClient(settings.GOOGLE_JWKS_URL, cache_keys=True, lifespan=3600, timeout=5)


def verify_id_token(token: str) -> GoogleClaims:
    if not enabled():
        raise GoogleTokenError("google sign-in is not configured")
    if not token or len(token) > 4096:
        raise GoogleTokenError("missing or oversized token")
    try:
        key = _jwks_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            key.key,
            algorithms=["RS256"],
            audience=audiences(),
            leeway=60,
            options={"require": ["iss", "aud", "exp", "iat", "sub"]},
        )
    except jwt.PyJWKClientError as exc:
        # Google's key endpoint unreachable or the key ID unknown: not the client's fault to fix,
        # but the sign-in cannot be trusted, so it fails the same way.
        logger.warning("Google key lookup failed: %s", type(exc).__name__)
        raise GoogleTokenError("signing key unavailable") from exc
    except jwt.InvalidTokenError as exc:
        raise GoogleTokenError(type(exc).__name__) from exc
    if claims.get("iss") not in ISSUERS:
        raise GoogleTokenError("wrong issuer")
    email = str(claims.get("email") or "").strip()
    if not email:
        raise GoogleTokenError("no email in token")
    verified = claims.get("email_verified") in (True, "true")
    name = " ".join(str(claims.get("name") or "").split())[:150]
    return GoogleClaims(
        sub=str(claims["sub"]),
        email=email,
        email_verified=verified,
        name=name,
        picture=picture_url(claims.get("picture")),
    )


def picture_url(value: Any) -> str:
    """Google's profile photo URL, only from Google's own image host (Cloudinary fetches it), in
    a larger size than the 96 px default; "" for anything else."""
    url = str(value or "").strip()
    if len(url) > 1000:
        return ""
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    if parts.scheme != "https" or not (
        host == "googleusercontent.com" or host.endswith(".googleusercontent.com")
    ):
        return ""
    return re.sub(r"=s\d+(-c)?$", "=s400-c", url)
