"""Facility report (#205, upgrade 13 W6): period figures for `reports.view`, CSV per table,
aggregates only."""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.utils import timezone
from rest_framework.test import APIClient

from medilink.audit.models import AuditEntry
from medilink.visits import report
from tests.s4.conftest import S, act, call_next, check_in, on_duty, register


def test_facility_report_figures_and_csv(
    clinic: Any,
    catalogue: dict[str, Any],
    desk: tuple[APIClient, Any],
    doctor: tuple[APIClient, Any],
    admin: tuple[APIClient, Any],
) -> None:
    service_id = catalogue["service"]["id"]
    for name in ("Ana One", "Ben Two", "Cy Three"):
        check_in(desk[0], register(clinic, desk[1], name), service_id)
    on_duty(doctor[0], catalogue["point"]["id"])
    ticket = call_next(doctor[0], service_id).json()
    act(doctor[0], act(doctor[0], ticket, "start").json(), "complete")

    response = admin[0].get(f"{S}reports/facility/")
    assert response.status_code == 200
    data = response.json()
    today = timezone.localdate()
    assert data["to"] == today.isoformat() and data["group"] == "day"
    assert len(data["visits"]["periods"]) == 30
    totals = data["visits"]["totals"]
    assert totals["patients"] == 3 and totals["completed"] == 1
    assert data["visits"]["by_source"] == [{"source": "walk_in", "count": 3}]
    assert data["visits"]["by_service"][0]["count"] == 3
    consult = next(w for w in data["waits"] if w["stage"] == "consultation")
    assert consult["tickets"] == 3 and consult["called"] == 1
    assert consult["median_wait_min"] == 0
    assert data["money"]["collected_rwf"] == 0 and data["lab"]["resulted"] == 0
    assert data["stock"]["out_now"] == 0
    assert "Ana" not in str(data) and "Ben" not in str(data)

    week = admin[0].get(f"{S}reports/facility/", {"group": "month"}).json()
    assert sum(p["patients"] for p in week["visits"]["periods"]) == 3

    csv = admin[0].get(f"{S}reports/facility/export/", {"table": "visits"})
    assert csv.status_code == 200 and csv["Content-Type"].startswith("text/csv")
    body = csv.content.decode("utf-8")
    assert body.startswith("﻿Period start,Patients")
    assert f"{today.isoformat()},3,1,0,0,0" in body
    assert AuditEntry.objects.filter(action="visits.report.exported").count() == 1

    assert desk[0].get(f"{S}reports/facility/").status_code == 403
    assert doctor[0].get(f"{S}reports/facility/export/", {"table": "money"}).status_code == 403


def test_facility_report_rejects_bad_periods(admin: tuple[APIClient, Any]) -> None:
    today = timezone.localdate()
    bad = [
        {"from": "2026-13-01"},
        {"group": "year"},
        {"from": today.isoformat(), "to": (today - dt.timedelta(days=1)).isoformat()},
        {"to": (today + dt.timedelta(days=1)).isoformat()},
        {"from": (today - dt.timedelta(days=report.MAX_DAYS)).isoformat()},
    ]
    for params in bad:
        assert admin[0].get(f"{S}reports/facility/", params).status_code == 400, params
    assert admin[0].get(f"{S}reports/facility/export/", {"table": "names"}).status_code == 400


def test_buckets_by_week_and_month() -> None:
    start, end = dt.date(2026, 10, 28), dt.date(2026, 11, 10)
    assert report.buckets(start, end, "week") == [
        dt.date(2026, 10, 26),
        dt.date(2026, 11, 2),
        dt.date(2026, 11, 9),
    ]
    assert report.buckets(start, end, "month") == [dt.date(2026, 10, 1), dt.date(2026, 11, 1)]
    assert len(report.buckets(start, end, "day")) == 14


def test_csv_cells_never_start_a_formula() -> None:
    data = {"visits": {"by_source": [{"source": "=cmd()", "count": 1}]}}
    filled: dict[str, Any] = {
        "visits": data["visits"],
        "money": {},
        "lab": {},
        "stock": {},
    }
    body = report.export_csv(filled, "sources")
    assert "'=cmd()" in body and ",1\r\n" in body
