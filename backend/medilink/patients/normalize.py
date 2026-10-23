"""Formats and normalisation (contract §2.2): MediLink numbers, identifiers, phones, names, ages."""

from __future__ import annotations

import re
import secrets
import unicodedata
from datetime import date

CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"  # no I, L, O, U
NUMBER_RE = re.compile(r"^ML[0-9A-HJKMNP-TV-Z]{8}$")


class InvalidValue(ValueError):
    """A value that doesn't match its format (mapped to 400 on the field)."""


# ---- MediLink number ----------------------------------------------------------------------------


def _luhn32(chars: str) -> str:
    """Luhn mod N check character over the Crockford alphabet (N = 32)."""
    factor, total, n = 2, 0, len(CROCKFORD)
    for char in reversed(chars):
        addend = factor * CROCKFORD.index(char)
        factor = 1 if factor == 2 else 2
        total += addend // n + addend % n
    return CROCKFORD[(n - total % n) % n]


def new_medilink_number() -> str:
    body = "".join(secrets.choice(CROCKFORD) for _ in range(7))
    raw = body + _luhn32(body)
    return f"ML-{raw[:4]}-{raw[4:]}"


def normalize_medilink_number(value: str) -> str:
    """Uppercase, hyphens/spaces removed, I/L -> 1, O -> 0; returns the `ML-XXXX-XXXX` form."""
    cleaned = re.sub(r"[\s\-]", "", value or "").upper()
    if cleaned.startswith("ML"):
        cleaned = "ML" + cleaned[2:].replace("I", "1").replace("L", "1").replace("O", "0")
    if not NUMBER_RE.fullmatch(cleaned):
        raise InvalidValue("Not a MediLink number")
    body = cleaned[2:]
    if _luhn32(body[:7]) != body[7]:
        raise InvalidValue("Not a MediLink number")
    return f"ML-{body[:4]}-{body[4:]}"


def looks_like_medilink_number(value: str) -> bool:
    try:
        normalize_medilink_number(value)
    except InvalidValue:
        return False
    return True


# ---- identifiers --------------------------------------------------------------------------------

IDENTIFIER_KINDS = ("national_id", "passport", "refugee_id", "birth_certificate")
_DOCUMENT_RE = re.compile(r"^[A-Z0-9]{5,20}$")


def normalize_identifier(kind: str, country: str, value: str) -> tuple[str, str]:
    """(issuing_country, normalized value). National IDs are 16 digits from RW."""
    if kind not in IDENTIFIER_KINDS:
        raise InvalidValue("Unknown identifier kind")
    if kind == "national_id":
        digits = re.sub(r"[\s\-.]", "", value or "")
        if not re.fullmatch(r"\d{16}", digits):
            raise InvalidValue("A national ID has 16 digits")
        return "RW", digits
    country = (country or "").strip().upper()
    if not re.fullmatch(r"[A-Z]{2}", country):
        raise InvalidValue("Choose the issuing country")
    normalized = re.sub(r"[\s\-]", "", unicodedata.normalize("NFKC", value or "")).upper()
    if not _DOCUMENT_RE.fullmatch(normalized):
        raise InvalidValue("Use 5 to 20 letters and digits")
    return country, normalized


def last4(normalized: str) -> str:
    return normalized[-4:]


def mask(last_four: str) -> str:
    return f"••••{last_four}"


# ---- phone --------------------------------------------------------------------------------------


def normalize_phone(value: str | None) -> str | None:
    """Rwandan mobile numbers to E.164: 07…, 7…, 2507…, +2507…"""
    if not value:
        return None
    digits = re.sub(r"[\s\-().]", "", value)
    if digits.startswith("+"):
        digits = digits[1:]
    if digits.startswith("250"):
        digits = digits[3:]
    if digits.startswith("0"):
        digits = digits[1:]
    if not re.fullmatch(r"7\d{8}", digits):
        raise InvalidValue("Enter a Rwandan mobile number like 0788 123 456")
    return f"+250{digits}"


def mask_phone(e164: str | None) -> str | None:
    if not e164:
        return None
    local = e164.removeprefix("+250")
    return f"+250 {local[0]}•• ••• {local[-3:]}"


# ---- names --------------------------------------------------------------------------------------


def normalize_name(value: str) -> str:
    """Lowercase, accents stripped, tokens sorted: 'Jeanne Mukamana' == 'Mukamana Jeanne'."""
    decomposed = unicodedata.normalize("NFKD", value or "")
    plain = "".join(c for c in decomposed if not unicodedata.combining(c)).lower()
    tokens = re.findall(r"[a-z0-9']+", plain)
    return " ".join(sorted(tokens))


# ---- age ----------------------------------------------------------------------------------------


def estimated_birth_date(today: date, years: int | None, months: int | None) -> date:
    if years is not None:
        if not 0 <= years <= 120:
            raise InvalidValue("Age must be between 0 and 120")
        return date(today.year - years, 1, 1)
    if months is not None:
        if not 0 <= months <= 23:
            raise InvalidValue("Use months only under 2 years")
        total = today.year * 12 + (today.month - 1) - months
        return date(total // 12, total % 12 + 1, 1)
    raise InvalidValue("Give a date of birth or an age")


def age_years(born: date | None, today: date) -> int | None:
    if born is None:
        return None
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


# ---- short codes --------------------------------------------------------------------------------


def new_code(groups: int = 2, size: int = 4) -> str:
    """`XXXX-XXXX` from the Crockford alphabet (delegation codes)."""
    return "-".join("".join(secrets.choice(CROCKFORD) for _ in range(size)) for _ in range(groups))


def normalize_code(value: str) -> str:
    cleaned = (
        re.sub(r"[\s\-]", "", value or "")
        .upper()
        .replace("I", "1")
        .replace("L", "1")
        .replace("O", "0")
    )
    return cleaned
