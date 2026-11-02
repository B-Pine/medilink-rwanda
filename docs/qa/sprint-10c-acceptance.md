# Sprint 10 part 2b acceptance record: Reports, audit log and my data

Contract: [sprint-10c-reports.md](../architecture/contracts/sprint-10c-reports.md) §5 · Releases: none yet

Status: **Open**. Implemented against the API tests and the mocks. A verifier who did not write the code fills **Verified by**, **Date** and **Result** (QA README §4).

| # | Check | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|
| S10c-B1 | Period figures, no patient names, 92-day limit, permission | `backend/tests/reports/test_reports.py::test_period_report_and_limits` | | | Pending |
| S10c-B2 | CSV export: step-up, audit, formula-safe | `test_csv_export_is_formula_safe_audited_and_needs_step_up` | | | Pending |
| S10c-B3 | Audit log facility-scoped, prefix filter | `test_audit_log_is_facility_scoped` | | | Pending |
| S10c-B4 | Platform report and audit | `test_platform_report_and_audit` | | | Pending |
| S10c-B5 | Patient data export | `test_patient_data_export` | | | Pending |
| S10c-F1..F3 | staff-web reports, audit, platform report | `apps/staff-web/src/features/reports/reports.test.tsx` (axe clean) | | | Pass (mocks) |
| S10c-F4 | patient-web My data | Settings card; mock `POST /patient/data-export/` | | | Pass (mocks) |
