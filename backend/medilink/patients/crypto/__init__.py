"""Field encryption and blind indexes for patient identifiers (contract §2.4, security 05 §4).

    encrypt(value, table=..., column=..., row_id=...) -> bytes      AES-256-GCM, v1 format
    decrypt(blob, table=..., column=..., row_id=...) -> str
    blind_index(kind, country, normalized) -> (key_id, digest)       active index key
    blind_indexes(kind, country, normalized) -> [(key_id, digest)]   every configured key (lookups)

Never log, audit or cache plaintext identifiers.
"""

from medilink.patients.crypto.fields import (
    DecryptionError,
    blind_index,
    blind_indexes,
    decrypt,
    encrypt,
    key_id_of,
)
from medilink.patients.crypto.keystore import KeyStore, KeyStoreError, get_keystore

__all__ = [
    "DecryptionError",
    "KeyStore",
    "KeyStoreError",
    "blind_index",
    "blind_indexes",
    "decrypt",
    "encrypt",
    "get_keystore",
    "key_id_of",
]
