"""Daily audit anchor (security 05 §6, security 02 "daily anchoring").

The head of the hash chain (last sequence and hash) is exported to a system the application can't
rewrite, so a truncated or rebuilt chain is detectable: compare the anchors with
`manage.py verify_audit_chain`. Sinks (AUDIT_ANCHOR_SINK):
  log    a JSON line on the `medilink.audit.anchor` logger (shipped to the log store); default
  email  sent to AUDIT_ANCHOR_EMAIL (e.g. the security officer's mailbox)
  file   appended to AUDIT_ANCHOR_FILE (a WORM / object-lock mount)
"""

from __future__ import annotations

import json
import logging
from typing import Any

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.mail import send_mail
from django.utils import timezone

from medilink.audit.models import AuditEntry
from medilink.audit.services import GENESIS_HASH

logger = logging.getLogger("medilink.audit.anchor")
SINKS = ("log", "email", "file")


def chain_head() -> dict[str, Any]:
    last = AuditEntry.objects.order_by("-sequence").values("sequence", "hash").first()
    return {
        "sequence": last["sequence"] if last else 0,
        "hash": last["hash"] if last else GENESIS_HASH,
        "exported_at": timezone.now().isoformat(timespec="seconds"),
    }


def export_anchor() -> dict[str, Any]:
    sink = str(getattr(settings, "AUDIT_ANCHOR_SINK", "log"))
    if sink not in SINKS:
        raise ImproperlyConfigured(f"AUDIT_ANCHOR_SINK must be one of {SINKS}, not {sink!r}.")
    anchor = chain_head()
    line = json.dumps(anchor, sort_keys=True)
    if sink == "email":
        recipient = getattr(settings, "AUDIT_ANCHOR_EMAIL", "")
        if not recipient:
            raise ImproperlyConfigured(
                "AUDIT_ANCHOR_EMAIL is required with AUDIT_ANCHOR_SINK=email."
            )
        send_mail(
            subject=f"MediLink audit anchor #{anchor['sequence']}",
            message=f"Audit chain head (keep this email unchanged):\n\n{line}\n",
            from_email=None,
            recipient_list=[recipient],
        )
    elif sink == "file":
        path = getattr(settings, "AUDIT_ANCHOR_FILE", "")
        if not path:
            raise ImproperlyConfigured("AUDIT_ANCHOR_FILE is required with AUDIT_ANCHOR_SINK=file.")
        with open(path, "a", encoding="utf-8") as out:
            out.write(line + "\n")
    logger.info("Audit anchor exported", extra={"extra_data": {**anchor, "sink": sink}})
    return anchor
