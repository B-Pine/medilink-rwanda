"""Content policy (contract sprint-09 §3.1): notifications never carry clinical content.

Generic words such as "results" or "prescription" stay allowed ("your results are ready", S6/S7);
the list names conditions and specific findings.

A word-boundary, case- and accent-insensitive denylist per language, plus "no URLs" for
announcements (phishing). Checked at seed sync (system check E004), template revision,
announcement save and publish, and again on every render. The list is reviewed by a clinician
and a native speaker before go-live; Wave 6 adds drug names from the S1 catalogue.
"""

from __future__ import annotations

import re
import unicodedata

DENYLIST: dict[str, tuple[str, ...]] = {
    "en": (
        "diagnosis",
        "diagnosed",
        "hiv",
        "aids",
        "tuberculosis",
        "tb",
        "pregnancy",
        "pregnant",
        "mental health",
        "cancer",
        "malaria",
        "hepatitis",
        "diabetes",
        "positive result",
        "negative result",
        "abortion",
        "std",
        "sti",
    ),
    "fr": (
        "diagnostic",
        "vih",
        "sida",
        "tuberculose",
        "grossesse",
        "enceinte",
        "sante mentale",
        "cancer",
        "paludisme",
        "hepatite",
        "diabete",
        "avortement",
        "ist",
    ),
    "rw": (
        "sida",
        "virusi itera sida",
        "igituntu",
        "kanseri",
        "malariya",
        "diyabete",
        "inda",
        "uburwayi bwo mu mutwe",
        "gukuramo inda",
    ),
}

_URL = re.compile(
    r"(https?://|www\.|\b[a-z0-9-]+\.(rw|com|org|net|info|io|me|ly)\b)", re.IGNORECASE
)


def _fold(text: str) -> str:
    """Lowercase and strip accents, so "Diagnóstico" and "DIAGNOSTIC" match the same entry."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()


_PATTERNS = {
    term: re.compile(rf"(?<![\w]){re.escape(term)}(?![\w])")
    for terms in DENYLIST.values()
    for term in terms
}


def clinical_terms(text: str) -> list[str]:
    """Denylisted terms found in `text`, checked against every language (texts mix languages)."""
    folded = _fold(text)
    return sorted({term for term, pattern in _PATTERNS.items() if pattern.search(folded)})


def has_url(text: str) -> bool:
    return bool(_URL.search(text))


class ContentPolicyError(ValueError):
    def __init__(self, reason: str, terms: list[str] | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.terms = terms or []


def check(text: str, *, allow_urls: bool = True) -> None:
    terms = clinical_terms(text)
    if terms:
        raise ContentPolicyError("clinical_terms", terms)
    if not allow_urls and has_url(text):
        raise ContentPolicyError("url")
