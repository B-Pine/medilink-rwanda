"""Sprint 1 audit actions (contract §2.7), registered through the [S1] block of
medilink/audit/actions.py. Metadata carries IDs and codes only."""

ACTIONS: frozenset[str] = frozenset(
    {
        # Facility applications
        "facility_application.started",
        "facility_application.created_by_platform",
        "facility_application.resumed",
        "facility_application.link_sent",
        "facility_application.submitted",
        "facility_application.review_started",
        "facility_application.document_reviewed",
        "facility_application.document_viewed",
        "facility_application.changes_requested",
        "facility_application.approved",
        "facility_application.rejected",
        "facility_application.note_added",
        "facility_application.purged",
        # Facilities
        "facility.status_changed",
        "facility.licence.recorded",
        "facility.licence.updated",
        "facility.licence.renewed",
        "facility.feature_flag.changed",
        "feature_flag.default_changed",
        # Master data
        "masterdata.created",
        "masterdata.updated",
        "masterdata.retired",
        "masterdata.restored",
        "masterdata.import.previewed",
        "masterdata.import.applied",
        # Uploads
        "upload.created",
        "upload.rejected",
        "upload.download_link_issued",
        # Sessions
        "auth.session.locked",
        "auth.session.unlocked",
        "auth.unlock.failure",
        "auth.unlock.exhausted",
        "auth.pin.set",
        "auth.pin.removed",
        "auth.step_up.success",
        "auth.step_up.failure",
    }
)
