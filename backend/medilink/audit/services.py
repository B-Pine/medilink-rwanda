"""audit.record(...) and chain verification.

hash_n = SHA-256( prev_hash || canonical_json(entry_n without hash) ), prev_hash_1 = 64 x "0".
Writers serialise on a transaction-scoped advisory lock, so the chain never forks; the lock is
released at COMMIT/ROLLBACK of the surrounding (request) transaction.
"""

from __future__ import annotations

import hashlib
import ipaddress
import json
import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from django.db import connections, transaction
from django.utils import timezone

from medilink.audit.actions import ACTIONS
from medilink.audit.models import AuditEntry
from medilink.core.logging import request_id_var
from medilink.core.net import client_ip, user_agent

GENESIS_HASH = "0" * 64
AUDIT_CHAIN_LOCK_ID = 7_310_402_215  # arbitrary constant for pg_advisory_xact_lock

# Metadata must not carry personal data (names, emails, phones, IDs, secrets): IDs and codes only.
_FORBIDDEN_METADATA_KEYS = frozenset(
    {
        "email",
        "name",
        "full_name",
        "first_name",
        "last_name",
        "phone",
        "phone_number",
        "national_id",
        "date_of_birth",
        "dob",
        "address",
        "password",
        "new_password",
        "token",
        "secret",
        "code",
        "recovery_code",
        "otp",
    }
)
_METADATA_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
_EMAIL_LIKE_RE = re.compile(r"[^@\s]+@[^@\s]+")
_MAX_METADATA_STRING = 200


class AuditMetadataError(ValueError):
    pass


def _check_metadata(value: Any, path: str = "metadata") -> Any:
    if isinstance(value, dict):
        checked = {}
        for key, item in value.items():
            if not isinstance(key, str) or not _METADATA_KEY_RE.fullmatch(key):
                raise AuditMetadataError(f"{path}: invalid key {key!r}")
            if key in _FORBIDDEN_METADATA_KEYS:
                raise AuditMetadataError(f"{path}.{key}: personal data or secrets are not allowed")
            checked[key] = _check_metadata(item, f"{path}.{key}")
        return checked
    if isinstance(value, list | tuple):
        return [_check_metadata(item, path) for item in value]
    if isinstance(value, str):
        if len(value) > _MAX_METADATA_STRING or _EMAIL_LIKE_RE.search(value):
            raise AuditMetadataError(f"{path}: value looks like free text or personal data")
        return value
    if isinstance(value, UUID):
        return str(value)
    if value is None or isinstance(value, bool | int):
        return value
    raise AuditMetadataError(f"{path}: unsupported type {type(value).__name__}")


def _canonical_ip(value: Any) -> str | None:
    if not value:
        return None
    try:
        return ipaddress.ip_address(str(value)).compressed
    except ValueError:
        return None


def _iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="microseconds")


def canonical_payload(entry: AuditEntry) -> str:
    payload = {
        "sequence": entry.sequence,
        "id": str(entry.id),
        "occurred_at": _iso(entry.occurred_at),
        "actor_id": str(entry.actor_id) if entry.actor_id else None,
        "actor_role": entry.actor_role,
        "facility_id": str(entry.facility_id) if entry.facility_id else None,
        "action": entry.action,
        "object_type": entry.object_type,
        "object_id": entry.object_id,
        "reason": entry.reason,
        "ip": _canonical_ip(entry.ip),
        "user_agent": entry.user_agent,
        "request_id": entry.request_id,
        "metadata": entry.metadata,
        "prev_hash": entry.prev_hash,
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def compute_hash(entry: AuditEntry) -> str:
    return hashlib.sha256((entry.prev_hash + canonical_payload(entry)).encode("utf-8")).hexdigest()


def record(
    action: str,
    *,
    request: Any = None,
    actor: Any = None,
    actor_role: str | None = None,
    facility_id: UUID | str | None = None,
    object_type: str = "",
    object_id: UUID | str | None = "",
    reason: str = "",
    metadata: dict[str, Any] | None = None,
) -> AuditEntry:
    """Append one audit entry. Actor, role, facility, IP, user agent and request ID are taken
    from the request's principal when not given explicitly."""
    if action not in ACTIONS:
        raise ValueError(f"Unknown audit action {action!r}")
    checked_metadata = _check_metadata(metadata or {})
    django_request = getattr(request, "_request", request)
    principal = getattr(django_request, "principal", None)
    if actor is None and principal is not None and principal.is_authenticated:
        actor = principal.user
    if actor_role is None:
        if actor is None:
            actor_role = "system" if request is None else "anonymous"
        elif principal is not None and principal.user == actor and principal.is_authenticated:
            actor_role = principal.actor_role
        else:
            actor_role = "platform_admin" if getattr(actor, "is_platform_admin", False) else ""
    if facility_id is None and principal is not None and principal.user == actor:
        facility_id = principal.active_facility_id

    using = AuditEntry.objects.db
    with transaction.atomic(using=using):
        with connections[using].cursor() as cursor:
            if connections[using].vendor == "postgresql":
                cursor.execute("SELECT pg_advisory_xact_lock(%s)", [AUDIT_CHAIN_LOCK_ID])
        last = AuditEntry.objects.order_by("-sequence").values("sequence", "hash").first()
        entry = AuditEntry(
            sequence=(last["sequence"] + 1) if last else 1,
            occurred_at=timezone.now(),
            actor=actor,
            actor_role=actor_role[:100],
            facility_id=facility_id,
            action=action,
            object_type=object_type,
            object_id=str(object_id or ""),
            reason=reason[:500],
            ip=_canonical_ip(client_ip(django_request)) if django_request is not None else None,
            user_agent=user_agent(django_request) if django_request is not None else "",
            request_id=request_id_var.get() if request is not None else "",
            metadata=checked_metadata,
            prev_hash=last["hash"] if last else GENESIS_HASH,
        )
        entry.hash = compute_hash(entry)
        entry.save()
    return entry


@dataclass
class ChainReport:
    ok: bool
    count: int
    head: str
    errors: list[str] = field(default_factory=list)


def verify_chain(entries: Iterable[AuditEntry] | None = None, max_errors: int = 20) -> ChainReport:
    """Recompute every hash and check the links and the gapless sequence."""
    if entries is None:
        entries = AuditEntry.objects.order_by("sequence").iterator(chunk_size=2000)
    expected_prev = GENESIS_HASH
    expected_sequence = 1
    count = 0
    errors: list[str] = []
    for entry in entries:
        count += 1
        if entry.sequence != expected_sequence:
            errors.append(f"#{entry.sequence}: sequence gap (expected #{expected_sequence})")
        if entry.prev_hash != expected_prev:
            errors.append(f"#{entry.sequence}: prev_hash does not match the previous entry")
        if compute_hash(entry) != entry.hash:
            errors.append(f"#{entry.sequence}: content hash mismatch (entry modified)")
        expected_prev = entry.hash
        expected_sequence = entry.sequence + 1
        if len(errors) >= max_errors:
            break
    return ChainReport(ok=not errors, count=count, head=expected_prev, errors=errors)
