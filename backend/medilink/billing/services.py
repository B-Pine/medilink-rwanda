"""Tariff items and insurer rules (contract sprint-02 §2.2, FR-BIL-05, FR-BIL-02). A change takes
effect from a date: the current version is closed the day before and a new one starts."""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions

from medilink.audit.services import record
from medilink.billing.models import InsurerRule, TariffItem
from medilink.core.exceptions import Conflict
from medilink.facilities.changelog import log_changes, snapshot

STALE = _("Someone else changed this. Reload and try again.")
PAST_DATE = _("Choose today or a later date.")
OVERLAP = _("Another price or rule is already valid on these dates.")
UNKNOWN_INSURER = _("Choose an insurer from the list.")
CODE_TAKEN = _("Another current item uses this code.")

TARIFF_FIELDS = ("code", "name_i18n", "kind", "service_id", "amount_rwf", "valid_from", "valid_to")
RULE_FIELDS = (
    "insurer_code",
    "applies_to_all_services",
    "service_ids",
    "patient_share_bp",
    "requires_referral",
    "excluded_tariff_codes",
    "ceiling_per_visit_rwf",
    "valid_from",
    "valid_to",
)


def current_q(on: dt.date) -> Q:
    return Q(valid_from__lte=on) & (Q(valid_to__isnull=True) | Q(valid_to__gte=on))


def _save(obj: Any) -> None:
    try:
        with transaction.atomic():
            obj.save()
    except IntegrityError:
        raise Conflict(OVERLAP) from None


def _check_date(valid_from: dt.date) -> None:
    if valid_from < timezone.localdate():
        raise exceptions.ValidationError({"valid_from": [str(PAST_DATE)]})


def create_tariff(facility: Any, data: dict[str, Any], *, actor: Any, request: Any) -> TariffItem:
    from medilink.facilities.services import ensure_configurable

    ensure_configurable(facility)
    valid_from = data.get("valid_from") or timezone.localdate()
    _check_date(valid_from)
    if TariffItem.objects.filter(
        facility=facility, code=data["code"], valid_to__isnull=True
    ).exists():
        from medilink.facilities.errors import FieldConflict

        raise FieldConflict("code", CODE_TAKEN)
    item = TariffItem(facility=facility, created_by=actor, **{**data, "valid_from": valid_from})
    _save(item)
    log_changes(
        facility_id=facility.pk,
        entity="tariff_item",
        entity_id=item.code,
        before=None,
        after=snapshot(item, TARIFF_FIELDS),
        actor=actor,
    )
    record(
        "billing.tariff.changed",
        request=request,
        facility_id=facility.pk,
        object_type="tariff_item",
        object_id=item.pk,
        metadata={"tariff_code": item.code},
    )
    return item


def change_tariff(
    facility: Any, item: TariffItem, data: dict[str, Any], *, actor: Any, request: Any
) -> tuple[TariffItem, TariffItem]:
    """Returns (previous, current)."""
    if data.pop("version") != item.version or item.valid_to is not None:
        raise Conflict(STALE)
    valid_from = data.pop("valid_from", None) or timezone.localdate()
    _check_date(valid_from)
    with transaction.atomic():
        before = snapshot(item, TARIFF_FIELDS)
        if valid_from <= item.valid_from:  # a correction before it took effect: replace in place
            for name, value in data.items():
                setattr(item, name, value)
            item.valid_from = valid_from
            item.version += 1
            _save(item)
            new = item
        else:
            item.valid_to = valid_from - dt.timedelta(days=1)
            item.version += 1
            _save(item)
            new = TariffItem(
                facility=facility,
                code=item.code,
                name_i18n=data.get("name_i18n", item.name_i18n),
                kind=item.kind,
                service_id=item.service_id,
                amount_rwf=data.get("amount_rwf", item.amount_rwf),
                valid_from=valid_from,
                created_by=actor,
            )
            _save(new)
        log_changes(
            facility_id=facility.pk,
            entity="tariff_item",
            entity_id=item.code,
            before=before,
            after=snapshot(new, TARIFF_FIELDS),
            actor=actor,
        )
    record(
        "billing.tariff.changed",
        request=request,
        facility_id=facility.pk,
        object_type="tariff_item",
        object_id=new.pk,
        metadata={"tariff_code": new.code, "valid_from": str(valid_from)},
    )
    return item, new


def _check_rule(data: dict[str, Any], facility: Any) -> None:
    from medilink.patients.cards import resolve_insurer

    if "insurer_code" in data and resolve_insurer(data["insurer_code"]) is None:
        raise exceptions.ValidationError({"insurer_code": [str(UNKNOWN_INSURER)]})
    codes = data.get("excluded_tariff_codes") or []
    if codes:
        known = set(
            TariffItem.objects.filter(facility=facility, code__in=codes).values_list(
                "code", flat=True
            )
        )
        unknown = sorted(set(codes) - known)
        if unknown:
            raise exceptions.ValidationError(
                {
                    "excluded_tariff_codes": [
                        str(_("Unknown tariff codes: {codes}")).format(codes=", ".join(unknown))
                    ]
                }
            )


def create_rule(facility: Any, data: dict[str, Any], *, actor: Any, request: Any) -> InsurerRule:
    from medilink.facilities.services import ensure_configurable

    ensure_configurable(facility)
    _check_rule(data, facility)
    valid_from = data.get("valid_from") or timezone.localdate()
    _check_date(valid_from)
    rule = InsurerRule(facility=facility, created_by=actor, **{**data, "valid_from": valid_from})
    _save(rule)
    log_changes(
        facility_id=facility.pk,
        entity="insurer_rule",
        entity_id=rule.insurer_code,
        before=None,
        after=snapshot(rule, RULE_FIELDS),
        actor=actor,
    )
    record(
        "billing.insurer_rule.changed",
        request=request,
        facility_id=facility.pk,
        object_type="insurer_rule",
        object_id=rule.pk,
        metadata={"insurer_code": rule.insurer_code},
    )
    return rule


def change_rule(
    facility: Any, rule: InsurerRule, data: dict[str, Any], *, actor: Any, request: Any
) -> tuple[InsurerRule, InsurerRule]:
    if data.pop("version") != rule.version or rule.valid_to is not None:
        raise Conflict(STALE)
    _check_rule(data, facility)
    valid_from = data.pop("valid_from", None) or timezone.localdate()
    _check_date(valid_from)
    with transaction.atomic():
        before = snapshot(rule, RULE_FIELDS)
        if valid_from <= rule.valid_from:
            for name, value in data.items():
                setattr(rule, name, value)
            rule.valid_from = valid_from
            rule.version += 1
            _save(rule)
            new = rule
        else:
            rule.valid_to = valid_from - dt.timedelta(days=1)
            rule.version += 1
            _save(rule)
            values = {
                name: getattr(rule, name)
                for name in RULE_FIELDS
                if name not in ("valid_from", "valid_to")
            }
            values.update(data)
            new = InsurerRule(facility=facility, created_by=actor, valid_from=valid_from, **values)
            _save(new)
        log_changes(
            facility_id=facility.pk,
            entity="insurer_rule",
            entity_id=rule.insurer_code,
            before=before,
            after=snapshot(new, RULE_FIELDS),
            actor=actor,
        )
    record(
        "billing.insurer_rule.changed",
        request=request,
        facility_id=facility.pk,
        object_type="insurer_rule",
        object_id=new.pk,
        metadata={"insurer_code": new.insurer_code, "valid_from": str(valid_from)},
    )
    return rule, new


# ---- interfaces for S8 ---------------------------------------------------------------------------


def price(
    facility_id: Any, *, code: str | None = None, service_id: Any = None, on: dt.date | None = None
) -> TariffItem | None:
    on = on or timezone.localdate()
    items = TariffItem.objects.filter(current_q(on), facility_id=facility_id)
    if code is not None:
        items = items.filter(code=code)
    if service_id is not None:
        items = items.filter(service_id=service_id)
    return items.first()


def insurer_rule(
    facility_id: Any, insurer_code: str, *, service_id: Any = None, on: dt.date | None = None
) -> InsurerRule | None:
    on = on or timezone.localdate()
    rule = InsurerRule.objects.filter(
        current_q(on), facility_id=facility_id, insurer_code=insurer_code
    ).first()
    if rule is None:
        return None
    if (
        service_id is not None
        and not rule.applies_to_all_services
        and str(service_id) not in {str(x) for x in rule.service_ids}
    ):
        return None
    return rule
