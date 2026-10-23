"""Key rotation, number backfill, dev seed, crypto and normalisation (contract §2.2, §2.4, §5)."""

from __future__ import annotations

import base64
import os
from datetime import date
from io import StringIO
from typing import Any

import pytest
from django.core.management import CommandError, call_command
from django.test import override_settings

from medilink.audit.models import AuditEntry
from medilink.patients import crypto, identity
from medilink.patients.crypto.keystore import KeyStoreError, StaticKeyStore, parse_keys
from medilink.patients.models import Identifier, Patient
from medilink.patients.normalize import (
    InvalidValue,
    estimated_birth_date,
    mask_phone,
    new_medilink_number,
    normalize_identifier,
    normalize_medilink_number,
    normalize_name,
    normalize_phone,
)
from tests.patients.conftest import KEYS


def _key() -> str:
    return base64.urlsafe_b64encode(os.urandom(32)).decode()


def test_medilink_number_check_character() -> None:
    number = new_medilink_number()
    assert normalize_medilink_number(number.lower().replace("-", " ")) == number
    body = number[3:7] + number[8:]
    wrong = "0" if body[6] != "0" else "1"
    with pytest.raises(InvalidValue):
        normalize_medilink_number(f"ML-{body[:4]}-{body[4:6]}{wrong}{body[7]}")
    with pytest.raises(InvalidValue):
        normalize_medilink_number("hello")


def test_normalisers() -> None:
    assert normalize_phone("0788 123 456") == "+250788123456"
    assert normalize_phone("+250 788-123-456") == "+250788123456"
    with pytest.raises(InvalidValue):
        normalize_phone("0212345678")
    assert mask_phone("+250788123456") == "+250 7•• ••• 456"
    assert normalize_name("Jeanne MUKAMANA") == normalize_name("mukamana  jéanne")
    assert normalize_identifier("national_id", "", "1 1984 8 0012345 6 78") == (
        "RW",
        "1198480012345678",
    )
    with pytest.raises(InvalidValue):
        normalize_identifier("passport", "", "AB12345")
    with pytest.raises(InvalidValue):
        normalize_identifier("unknown", "RW", "x")
    assert estimated_birth_date(date(2026, 10, 23), None, 3) == date(2026, 7, 1)
    with pytest.raises(InvalidValue):
        estimated_birth_date(date(2026, 10, 23), None, None)


def test_ciphertext_bound_to_row() -> None:
    import uuid

    row = uuid.uuid4()
    blob = crypto.encrypt("secret", table="t", column="c", row_id=row)
    assert crypto.decrypt(blob, table="t", column="c", row_id=row) == "secret"
    with pytest.raises(crypto.DecryptionError):
        crypto.decrypt(blob, table="t", column="c", row_id=uuid.uuid4())


def test_keystore_validation() -> None:
    key = os.urandom(32)
    with pytest.raises(KeyStoreError):
        StaticKeyStore(data_keys={1: key}, data_active=1, index_keys={1: key}, index_active=1)
    with pytest.raises(KeyStoreError):
        parse_keys("1:not-base64!")


@pytest.mark.django_db
def test_rotate_keys_data_and_index(reception: Any) -> None:
    from tests.patients.conftest import NATIONAL_ID, walk_in

    data = walk_in(reception, identifier={"kind": "national_id", "value": NATIONAL_ID})
    ident = Identifier.objects.get(patient_id=data["patient_id"])
    assert crypto.key_id_of(bytes(ident.value_enc)) == 1
    rotated = {
        "field_keys": f"{KEYS['field_keys']},2:{_key()}",
        "field_active": "2",
        "index_keys": f"{KEYS['index_keys']},2:{_key()}",
        "index_active": "2",
    }
    with override_settings(PATIENT_KEYS=rotated):
        # old blind index still finds the patient while rotation is pending
        assert identity.find_by_identifier("national_id", "RW", NATIONAL_ID) is not None
        call_command("patients_rotate_keys", "--data", stdout=StringIO())
        call_command("patients_rotate_keys", "--index", stdout=StringIO())
        ident.refresh_from_db()
        assert crypto.key_id_of(bytes(ident.value_enc)) == 2
        assert ident.bidx_key_id == 2
        assert identity.reveal(ident) == NATIONAL_ID
        found = identity.find_by_identifier("national_id", "RW", NATIONAL_ID)
        assert found is not None and str(found.pk) == data["patient_id"]
    assert AuditEntry.objects.filter(action="patients.keys.rotated").count() == 2


@pytest.mark.django_db
@override_settings(PATIENT_KEYS=None, DEBUG=True)
def test_rotation_refuses_derived_keys() -> None:
    with pytest.raises(CommandError):
        call_command("patients_rotate_keys", "--data", stdout=StringIO())


@pytest.mark.django_db
def test_backfill_numbers() -> None:
    patient = Patient.objects.create(full_name="Old Record")
    out = StringIO()
    call_command("patients_backfill_numbers", stdout=out)
    patient.refresh_from_db()
    assert patient.medilink_number is not None
    assert "Assigned 1" in out.getvalue()


@pytest.mark.django_db
def test_seed_patients_dev_needs_debug_and_seed() -> None:
    with pytest.raises(CommandError):
        call_command("seed_patients_dev", stdout=StringIO())
    with override_settings(DEBUG=True), pytest.raises(CommandError):
        call_command("seed_patients_dev", stdout=StringIO())


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_seed_dev_includes_patients() -> None:
    call_command("seed_dev", stdout=StringIO())
    assert Patient.objects.filter(full_name="Niyonsaba Claudine").exists()
    call_command("seed_patients_dev", stdout=StringIO())  # idempotent
    assert Patient.objects.filter(full_name="Niyonsaba Claudine").count() == 1
