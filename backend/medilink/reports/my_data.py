"""The patient's own data (FR-SEC-12 access and portability, contract sprint-10c §3 DX1).

Each module's patient loaders are reused, so the export shows exactly what the app shows: no
private notes, no internal dispute notes, no alert overrides. Profiles come from the account's
links (self, guardian; delegates get what their link allows through the same functions).
"""

from __future__ import annotations

from typing import Any

from django.utils import timezone


def collect(user: Any) -> dict[str, Any]:
    from medilink.billing import views_patient as bills
    from medilink.clinical import views_patient as records
    from medilink.disputes import views as disputes
    from medilink.documents import views_patient as documents
    from medilink.patients.models import PatientLink
    from medilink.pharmacy import views_patient as medicines
    from medilink.tenancy.context import rls_context

    uid = user.pk
    with rls_context(user_id=uid):
        links = list(PatientLink.objects.active().filter(account=user).select_related("patient"))
        profiles = [
            {
                "patient_id": link.patient_id,
                "relationship": link.relationship,
                "full_name": link.patient.full_name,
                "preferred_name": link.patient.preferred_name,
                "date_of_birth": link.patient.date_of_birth,
                "sex": link.patient.sex,
            }
            for link in links
        ]

    out: dict[str, Any] = {
        "exported_at": timezone.now(),
        "account": {
            "email": user.email,
            "full_name": user.full_name,
            "preferred_language": getattr(user, "preferred_language", ""),
        },
        "profiles": profiles,
        "records": [
            records._load(cid, fid, uid, full=True)
            for cid, fid, _p in records.readable_records(uid)
        ],
        "prescriptions": [
            medicines._load(pid, fid, uid, full=True)
            for pid, fid, _p, _s in medicines.readable_prescriptions(uid)
        ],
        "bills": [
            bills._load(bid, fid, uid, full=True) for bid, fid, _p, _b in bills.readable_bills(uid)
        ],
        "documents": [],
        "disputes": [],
    }
    for doc_id, fid, _p in documents.readable_documents(uid):
        d = documents._load(doc_id, fid, uid)
        out["documents"].append(
            {"id": d.pk, "kind": d.kind, "number": d.number, "document_date": d.document_date}
        )
    for did, fid, _p in disputes.readable(uid):
        with rls_context(facility_id=fid, user_id=uid):
            row = disputes._load(did)
            out["disputes"].append(disputes.patient_data(row, disputes._facility_name(fid)))
    return out
