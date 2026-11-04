"""What the platform knows about each facility, in one row (2026-11-03): the list and detail pages
and the export for the Ministry of Health read it.

Facility tables are row-level secured, so each facility's profile and staff are read in its own
context. The export carries no personal data beyond the facility admins' work contacts.
"""

from __future__ import annotations

import csv
import io
from collections import Counter
from typing import Any

from medilink.facilities.models import Profile
from medilink.masterdata.models import Location
from medilink.onboarding.models import Application
from medilink.tenancy.context import rls_context
from medilink.tenancy.models import Facility, FacilityMembership, RoleCode


def _location(code: str) -> dict[str, str]:
    """Province, district, sector, cell and village names from the village code."""
    out = dict.fromkeys(("province", "district", "sector", "cell", "village"), "")
    node = (
        Location.objects.select_related("parent__parent__parent__parent").filter(code=code).first()
        if code
        else None
    )
    while node is not None:
        out[node.level] = node.name
        node = node.parent
    return out


def facility_profile(facility: Facility) -> dict[str, Any]:
    """Contacts, place and people of one facility (read in its RLS context)."""
    with rls_context(facility_id=facility.pk):
        profile = Profile.objects.filter(facility=facility).first()
        memberships = list(
            FacilityMembership.objects.filter(facility=facility, is_active=True)
            .select_related("user")
            .prefetch_related("roles")
        )
    from medilink.accounts.models import ClinicianProfile

    clinicians = {
        c.user_id: c
        for c in ClinicianProfile.objects.filter(user_id__in=[m.user_id for m in memberships])
    }
    admins = [
        {
            "user_id": m.user_id,
            "name": m.user.full_name,
            "email": m.user.email,
            "phone": m.user.phone,
        }
        for m in memberships
        if any(r.code == RoleCode.FACILITY_ADMIN for r in m.roles.all())
    ]
    doctors = [m for m in memberships if any(r.code == RoleCode.DOCTOR for r in m.roles.all())]
    professions = Counter(
        clinicians[m.user_id].profession or "unknown"
        for m in memberships
        if m.user_id in clinicians
    )
    village = profile.village_code if profile else ""
    if not village:  # before approval copied it: the application's
        application = (
            Application.objects.filter(facility=facility).select_related("village").first()
        )
        village = application.village.code if application and application.village else ""
    return {
        "phone": profile.phone if profile else "",
        "email": profile.email if profile else "",
        "address": profile.address if profile else "",
        "level_of_care": profile.level_of_care if profile else "",
        "latitude": float(profile.latitude) if profile and profile.latitude is not None else None,
        "longitude": float(profile.longitude)
        if profile and profile.longitude is not None
        else None,
        "photo_count": len(profile.photo_file_ids) if profile else 0,
        "location": _location(village),
        "admins": admins,
        "staff_count": len(memberships),
        "doctor_count": len(doctors),
        "doctors_attested": sum(1 for m in doctors if m.licence_attested_at),
        "staff_by_profession": dict(sorted(professions.items())),
    }


EXPORT_COLUMNS = (
    ("moh_facility_code", "MoH facility code (FOSA ID)"),
    ("name", "Facility name"),
    ("facility_type", "Type"),
    ("ownership", "Ownership"),
    ("level_of_care", "Level of care"),
    ("status", "MediLink status"),
    ("province", "Province"),
    ("district", "District"),
    ("sector", "Sector"),
    ("cell", "Cell"),
    ("village", "Village"),
    ("address", "Address"),
    ("latitude", "Latitude"),
    ("longitude", "Longitude"),
    ("phone", "Phone"),
    ("email", "Email"),
    ("tin", "TIN"),
    ("organization", "Organisation"),
    ("licence_state", "MoH licence"),
    ("next_licence_expiry", "Next licence expiry"),
    ("admins", "Facility admins"),
    ("staff_count", "Active staff"),
    ("doctor_count", "Doctors"),
    ("doctors_attested", "Doctors with a checked licence"),
    ("created_at", "Joined MediLink"),
)


def export_csv(rows: list[dict[str, Any]]) -> str:
    """The facility list as CSV (UTF-8 with BOM, so spreadsheets read Kinyarwanda names)."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow([label for _key, label in EXPORT_COLUMNS])
    for row in rows:
        place = row["location"]
        flat = {
            **row,
            **place,
            "organization": row.get("organization_name", ""),
            "admins": "; ".join(
                " ".join(filter(None, (a["name"], a["phone"], a["email"]))) for a in row["admins"]
            ),
            "created_at": row["created_at"].date().isoformat() if row["created_at"] else "",
            "next_licence_expiry": row["next_licence_expiry"] or "",
        }
        writer.writerow(
            [
                "" if flat.get(key) is None else safe_cell(str(flat.get(key, "")))
                for key, _l in EXPORT_COLUMNS
            ]
        )
    return "﻿" + buffer.getvalue()


def safe_cell(value: str) -> str:
    """No spreadsheet formulas from data (CSV injection)."""
    return "'" + value if value[:1] in ("=", "+", "-", "@") and not _number(value) else value


def _number(value: str) -> bool:
    try:
        float(value)
    except ValueError:
        return False
    return True
