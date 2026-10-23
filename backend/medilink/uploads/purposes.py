"""Upload purpose registry (contract §3.6). Frozen for /api/v1: additions only.

A sprint that needs uploads registers a purpose in its own AppConfig.ready() and never edits
medilink.uploads:

    from medilink.uploads.purposes import UploadPurpose, register
    register(UploadPurpose(code="insurance_card", audiences=frozenset({"patient", "staff"}), ...))
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from medilink.uploads import sniff

if TYPE_CHECKING:
    from medilink.uploads.models import UploadedFile

AUDIENCES = frozenset({"staff", "patient", "public", "platform"})
OWNER_KINDS = frozenset({"application", "platform", "patient", "facility"})
DATA_CLASSES = frozenset({"C0", "C1", "C2", "C3"})


def _deny(*args: Any) -> bool:
    return False


@dataclass(frozen=True)
class UploadPurpose:
    code: str
    audiences: frozenset[str]
    owner_kind: str
    data_class: str
    content_types: frozenset[str] = field(default=sniff.DOCUMENT_TYPES)
    max_bytes: int = 10 * 2**20
    # can_upload(principal, fields) -> bool: may this principal upload for this purpose?
    can_upload: Callable[[Any, dict[str, Any]], bool] = _deny
    # can_read(principal, file) -> bool: may this principal read an attached file?
    can_read: Callable[[Any, UploadedFile], bool] = _deny
    unattached_ttl_hours: int = 24

    def __post_init__(self) -> None:
        if not self.code or not self.code.replace("_", "").isalnum() or not self.code.islower():
            raise ValueError(f"Invalid purpose code {self.code!r}")
        if not self.audiences or not self.audiences <= AUDIENCES:
            raise ValueError(f"Invalid audiences for purpose {self.code!r}")
        if self.owner_kind not in OWNER_KINDS:
            raise ValueError(f"Invalid owner_kind for purpose {self.code!r}")
        if self.data_class not in DATA_CLASSES:
            raise ValueError(f"Invalid data_class for purpose {self.code!r}")
        allowed = sniff.DOCUMENT_TYPES | {sniff.CSV}
        if not self.content_types or not self.content_types <= allowed:
            raise ValueError(f"Unsupported content types for purpose {self.code!r}")
        if sniff.CSV in self.content_types and self.content_types != {sniff.CSV}:
            raise ValueError("CSV purposes accept CSV only")


_REGISTRY: dict[str, UploadPurpose] = {}


def register(purpose: UploadPurpose) -> UploadPurpose:
    if purpose.code in _REGISTRY:
        raise ValueError(f"Upload purpose {purpose.code!r} is already registered")
    _REGISTRY[purpose.code] = purpose
    return purpose


def unregister(code: str) -> None:
    """For tests that register a temporary purpose."""
    _REGISTRY.pop(code, None)


def get_purpose(code: str) -> UploadPurpose | None:
    return _REGISTRY.get(code)


def all_purposes() -> dict[str, UploadPurpose]:
    return dict(_REGISTRY)
