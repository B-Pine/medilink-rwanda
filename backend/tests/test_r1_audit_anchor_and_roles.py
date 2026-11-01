"""R1: daily audit anchor export; runtime role can't change the audit log or the role catalogue."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.db import DatabaseError, connection, transaction
from django.test import override_settings

from config.celery import app
from medilink.audit import actions
from medilink.audit.anchor import export_anchor
from medilink.audit.services import GENESIS_HASH, record
from medilink.audit.tasks import export_audit_anchor

pytestmark = pytest.mark.django_db


def test_anchor_is_the_chain_head_and_logged(caplog: Any) -> None:
    with caplog.at_level(logging.INFO, logger="medilink.audit.anchor"):
        empty = export_anchor()
    assert empty["sequence"] == 0 and empty["hash"] == GENESIS_HASH
    record(actions.LOGOUT)
    last = record(actions.LOGOUT)
    anchor = export_anchor()
    assert anchor["sequence"] == last.sequence and anchor["hash"] == last.hash
    assert any(r.message == "Audit anchor exported" for r in caplog.records)


def test_anchor_email_and_file_sinks(mailoutbox: Any, tmp_path: Path) -> None:
    entry = record(actions.LOGOUT)
    with override_settings(AUDIT_ANCHOR_SINK="email", AUDIT_ANCHOR_EMAIL="so@example.test"):
        export_audit_anchor()  # the Celery task
    assert mailoutbox[0].to == ["so@example.test"] and entry.hash in mailoutbox[0].body
    path = tmp_path / "anchors.jsonl"
    with override_settings(AUDIT_ANCHOR_SINK="file", AUDIT_ANCHOR_FILE=str(path)):
        export_anchor()
        export_anchor()
    lines = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    assert len(lines) == 2 and lines[0]["hash"] == entry.hash


@pytest.mark.parametrize(
    "overrides",
    [
        {"AUDIT_ANCHOR_SINK": "s3"},
        {"AUDIT_ANCHOR_SINK": "email", "AUDIT_ANCHOR_EMAIL": ""},
        {"AUDIT_ANCHOR_SINK": "file", "AUDIT_ANCHOR_FILE": ""},
    ],
)
def test_anchor_sink_misconfiguration_fails_loudly(overrides: dict[str, str]) -> None:
    with override_settings(**overrides), pytest.raises(ImproperlyConfigured):
        export_anchor()


def test_anchor_runs_daily_on_beat() -> None:
    entry = app.conf.beat_schedule["audit.export_audit_anchor"]
    assert entry["task"] == "medilink.audit.tasks.export_audit_anchor"


@pytest.mark.parametrize(
    "sql",
    [
        "INSERT INTO tenancy_permission (id, code, description) "
        "VALUES (gen_random_uuid(), 'x.y', 'x')",
        "UPDATE tenancy_role SET name = 'x'",
        "DELETE FROM tenancy_role_permissions",
        "UPDATE audit_auditentry SET action = 'x'",
    ],
)
def test_runtime_role_cannot_change_roles_permissions_or_audit(sql: str) -> None:
    with (
        pytest.raises(DatabaseError, match="permission denied"),
        transaction.atomic(),
        connection.cursor() as cursor,
    ):
        cursor.execute(sql)
