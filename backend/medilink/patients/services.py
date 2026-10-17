"""Patient sign-up: one transaction creates User + self Patient + PatientLink + ConsentRecords."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.db import transaction
from django.utils import timezone

from medilink.accounts.models import User
from medilink.patients.models import (
    ConsentChannel,
    ConsentKind,
    ConsentRecord,
    Patient,
    PatientLink,
    Relationship,
)


@dataclass(frozen=True)
class Registration:
    user: User
    patient: Patient


@transaction.atomic
def register_patient(
    *,
    full_name: str,
    email: str,
    password: str,
    preferred_language: str,
    accepted_terms_version: str,
    accepted_privacy_version: str,
    research_consent: bool,
    channel: str = ConsentChannel.WEB,
) -> Registration:
    user = User.objects.create_user(
        email=email, password=password, full_name=full_name, preferred_language=preferred_language
    )
    patient = Patient.objects.create(full_name=full_name)
    PatientLink.objects.create(account=user, patient=patient, relationship=Relationship.SELF)
    now = timezone.now()
    ConsentRecord.objects.bulk_create(
        [
            ConsentRecord(
                user=user,
                kind=ConsentKind.TERMS,
                version=accepted_terms_version,
                granted=True,
                granted_at=now,
                channel=channel,
            ),
            ConsentRecord(
                user=user,
                kind=ConsentKind.PRIVACY,
                version=accepted_privacy_version,
                granted=True,
                granted_at=now,
                channel=channel,
            ),
            ConsentRecord(
                user=user,
                kind=ConsentKind.RESEARCH,
                version=accepted_privacy_version,
                granted=research_consent,
                granted_at=now,
                channel=channel,
            ),
        ]
    )
    return Registration(user=user, patient=patient)


def active_links(user: Any) -> list[PatientLink]:
    return list(
        PatientLink.objects.for_account(user)
        .active()
        .select_related("patient")
        .order_by("created_at")
    )


def has_patient_profile(user: Any) -> bool:
    return PatientLink.objects.for_account(user).active().exists()
