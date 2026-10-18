"""Sprint extension of the audit action catalogue (shared-file protocol)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from medilink.audit import actions
from medilink.audit.services import record

pytestmark = pytest.mark.django_db


@pytest.fixture
def restore_actions() -> Iterator[None]:
    before = set(actions.ACTIONS)
    yield
    actions.ACTIONS.clear()
    actions.ACTIONS.update(before)


def test_extended_action_is_accepted_by_record(restore_actions: None) -> None:
    actions.extend_actions({"example.thing.created"})
    entry = record("example.thing.created", metadata={"count": 1})
    assert entry.action == "example.thing.created"


def test_unknown_action_is_still_refused() -> None:
    with pytest.raises(ValueError, match="Unknown audit action"):
        record("example.never.registered")


@pytest.mark.parametrize(
    ("names", "message"),
    [
        ({"auth.logout"}, "already registered"),
        ({"Not Valid"}, "Malformed"),
        ({"single"}, "Malformed"),
    ],
)
def test_extend_actions_rejects_bad_names_without_side_effects(
    restore_actions: None, names: set[str], message: str
) -> None:
    before = set(actions.ACTIONS)
    with pytest.raises(ValueError, match=message):
        actions.extend_actions(names)
    assert before == actions.ACTIONS
