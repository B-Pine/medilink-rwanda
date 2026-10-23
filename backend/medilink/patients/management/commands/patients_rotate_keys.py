"""manage.py patients_rotate_keys --data | --index (contract §2.4, §5).

`--data` re-encrypts identifier values still under an older field key with the active key.
`--index` recomputes blind indexes still under an older index key. Lookups try every configured
index key, so both can run while the service is up. Batches of 500; the counts are audited.
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from medilink.audit.services import record
from medilink.patients import crypto
from medilink.patients.crypto.keystore import get_keystore
from medilink.patients.identity import COLUMN, TABLE
from medilink.patients.models import Identifier

BATCH = 500


class Command(BaseCommand):
    help = "Re-encrypt identifiers or recompute blind indexes under the active key."

    def add_arguments(self, parser: Any) -> None:
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument("--data", action="store_true", help="Re-encrypt values")
        group.add_argument("--index", action="store_true", help="Recompute blind indexes")

    def handle(self, *args: Any, **options: Any) -> None:
        store = get_keystore()
        if store.derived:
            raise CommandError(
                "Configure real keys before rotating (development keys are derived)."
            )
        what = "data" if options["data"] else "index"
        rotated = self._data(store) if what == "data" else self._index(store)
        record(
            "patients.keys.rotated",
            object_type="identifier",
            metadata={"what": what, "rows": rotated},
        )
        self.stdout.write(f"Rotated {rotated} identifiers.")

    def _data(self, store: Any) -> int:
        active = store.active_data_key_id()
        count = 0
        last = None
        while True:
            rows = Identifier.objects.order_by("pk")
            if last is not None:
                rows = rows.filter(pk__gt=last)
            batch = list(rows[:BATCH])
            if not batch:
                return count
            with transaction.atomic():
                for ident in batch:
                    blob = bytes(ident.value_enc)
                    if crypto.key_id_of(blob) == active:
                        continue
                    value = crypto.decrypt(blob, table=TABLE, column=COLUMN, row_id=ident.pk)
                    Identifier.objects.filter(pk=ident.pk).update(
                        value_enc=crypto.encrypt(value, table=TABLE, column=COLUMN, row_id=ident.pk)
                    )
                    count += 1
            last = batch[-1].pk

    def _index(self, store: Any) -> int:
        active = store.active_index_key_id()
        count = 0
        while True:
            batch = list(Identifier.objects.exclude(bidx_key_id=active).order_by("pk")[:BATCH])
            if not batch:
                return count
            with transaction.atomic():
                for ident in batch:
                    value = crypto.decrypt(
                        bytes(ident.value_enc), table=TABLE, column=COLUMN, row_id=ident.pk
                    )
                    key_id, digest = crypto.blind_index(ident.kind, ident.issuing_country, value)
                    Identifier.objects.filter(pk=ident.pk).update(
                        bidx_key_id=key_id, value_bidx=digest
                    )
                    count += 1
