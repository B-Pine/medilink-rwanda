"""S8 notification events (contract sprint-08 §2.2 Receipt), autodiscovered by S9.

No amounts or line names: S9 placeholders carry C0-C2 data only, so the message points to the
receipt in MediLink. Kinyarwanda texts need native-speaker review before go-live.
"""

from __future__ import annotations

from datetime import timedelta

from medilink.notifications.registry import EventDefinition, Placeholder, Text

RECEIPT_ISSUED = "billing.receipt_issued"

RECEIPT = {
    "rw": (
        "Wishyuye",
        "Kwishyura kwawe kuri $facility_name kwanditswe. Fungura MediLink urebe inyemezabwishyu.",
    ),
    "en": (
        "Payment received",
        "Your payment at $facility_name was recorded. Open MediLink to see the receipt.",
    ),
    "fr": (
        "Paiement reçu",
        "Votre paiement à $facility_name a été enregistré. Ouvrez MediLink pour voir le reçu.",
    ),
}
RECEIPT_DEPENDENT = {
    "rw": (
        "Kwishyura byakiriwe",
        "Kwishyura kwa $person_name kuri $facility_name kwanditswe. Fungura MediLink urebe "
        "inyemezabwishyu.",
    ),
    "en": (
        "Payment received",
        "A payment for $person_name at $facility_name was recorded. Open MediLink to see the "
        "receipt.",
    ),
    "fr": (
        "Paiement reçu",
        "Un paiement pour $person_name à $facility_name a été enregistré. Ouvrez MediLink pour "
        "voir le reçu.",
    ),
}
CHANNELS = ("in_app", "email")


def _texts() -> dict[tuple[str, str, str], Text]:
    out: dict[tuple[str, str, str], Text] = {}
    for channel in CHANNELS:
        for language, (subject, body) in RECEIPT.items():
            out[(channel, language, "self")] = Text(subject, body)
        for language, (subject, body) in RECEIPT_DEPENDENT.items():
            out[(channel, language, "dependent")] = Text(subject, body)
    return out


EVENTS: list[EventDefinition] = [
    EventDefinition(
        type=RECEIPT_ISSUED,
        audience="patient",
        priority="routine",
        channels=CHANNELS,
        placeholders={
            "facility_name": Placeholder.FACILITY_NAME,
            "person_name": Placeholder.PERSON_NAME,
        },
        data_keys=frozenset({"receipt_id", "bill_id"}),
        action_path="/bills/{bill_id}",
        dedupe="{type}:{receipt_id}",
        rate_limit=(30, timedelta(hours=1)),
        templates=_texts(),
    ),
]
