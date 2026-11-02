# Sprint 8 acceptance record: Billing, payments and insurance

Contract: [sprint-08-billing.md](../architecture/contracts/sprint-08-billing.md) §9 · Tracking: [#137](https://github.com/B-Pine/medilink-rwanda/issues/137) · Releases: none yet

Status: **Open**. The S8 backend is implemented. The frontend (F1–F7) and the staging checks (I1, I2) are not started.

Evidence collected on 2026-11-02 on PostgreSQL 16, suite run as the runtime role. Backend tests: `backend/tests/s8/test_billing.py`, `backend/tests/s8/test_access_and_patient.py`. A verifier who did not write the code fills **Verified by**, **Date** and **Result** ([QA README](README.md) §4).

## Backend checks

| # | Check (short; full text in the contract §9) | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|
| S8-B1 | Every §3 endpoint in the schema | `test_every_s8_endpoint_is_in_the_schema`; `spectacular --validate --fail-on-warn` clean; `backend/openapi/openapi.yaml` regenerated (24 paths added; no existing path or component removed or renamed; S1 `MethodEnum` pinned) | | | Pending |
| S8-B2 | Authorisation matrix | `test_doctors_pharmacists_and_other_facilities_have_no_billing_access` (doctor, pharmacist `403`; other facility `404`), approvals and shift review refused to receptionists in `test_void_refund_credit_note_and_payout` and `test_shift_close_and_review`; `test_delegates_strangers_and_staff` | | | Pending |
| S8-B3 | Bill opened once on check-in and on first read; consultation line; price missing | `test_bill_opens_on_check_in_once_with_the_consultation`, `test_price_missing_without_a_tariff`, `test_receiver_failure_never_breaks_check_in` | | | Pending |
| S8-B4 | Split: covered, excluded, service list, ceiling, self-pay | `test_split_coverage_exclusions_service_list_and_ceiling`, `test_rejection_moves_to_self_pay_and_referral_letter_is_checked` | | | Pending |
| S8-B5 | Lines and medicine sync | `test_lines_add_and_remove_before_payment_only` (service and trigger), `test_medicine_lines_follow_the_prescription` | | | Pending |
| S8-B6 | Verification rules | `test_rejection_moves_to_self_pay_and_referral_letter_is_checked`, `test_verification_after_payment_can_only_lower_the_share` | | | Pending |
| S8-B7 | Payments | `test_payments_methods_references_shift_and_idempotency`, `test_receipt_prefix_setting_and_cash_without_reference` | | | Pending |
| S8-B8 | Gapless receipts, prefix, notification | `test_payments_methods_references_shift_and_idempotency` (numbers 000001, 000002), `test_receipt_prefix_setting_and_cash_without_reference`, `test_receipt_reaches_the_patient_account`; the counter's rollback behaviour is covered by S7 `test_number_counter_has_no_gaps_and_validates` | | | Pending |
| S8-B9 | Exemptions | `test_exemptions_setting_reasons_and_waiver_approval`, `test_waiver_larger_than_a_changed_balance_is_refused` | | | Pending |
| S8-B10 | Voids, refunds, separation of duties | `test_void_refund_credit_note_and_payout` (step-up), `test_overpayment_refund_does_not_lower_the_amount_due`, `test_separation_of_duties_and_one_person_clinic`, `test_reject_needs_a_note` | | | Pending |
| S8-B11 | Shifts | `test_shift_close_and_review`, `test_own_shift_review_only_in_a_one_person_clinic` | | | Pending |
| S8-B12 | Balances and patient bills | `test_balances_list_and_filters`, `test_patient_reads_own_bills_with_receipts`, `test_delegates_strangers_and_staff` | | | Pending |
| S8-B13 | Payment-first pharmacy; cancelled visit | `test_payment_first_pharmacy_and_cancelled_visit` | | | Pending |
| S8-B14 | RLS, append-only and locks, audit, migrations, coverage | `test_every_billing_table_has_forced_rls`, `tests/test_rls_coverage.py`, the trigger assertions above, `test_audit_entries_carry_no_medicine_names`; `migrate billing 0003` and back; coverage in the Evidence log | | | Pending |

## Frontend checks

| # | Check | Evidence | Result |
|---|---|---|---|
| S8-F1..F7 | Staff and patient screens | Not started | Pending |

## Integration checks

| # | Check | Evidence | Result |
|---|---|---|---|
| S8-I1 | Staging walk-through | Waits for the frontend and staging ([#17](https://github.com/B-Pine/medilink-rwanda/issues/17)) | Pending |
| S8-I2 | Only `billing`, `[S8]` blocks and slots changed | Backend: `billing` app, `[S8]` blocks in settings (enum names), URLs and audit actions, the OpenAPI schema and docs | Pending |

## Evidence log

| Date | What | Result |
|---|---|---|
| 2026-11-02 | `ruff check`, `ruff format --check`, `mypy .`, `makemigrations --check`, `spectacular --validate --fail-on-warn` | Clean |
| 2026-11-02 | `pytest tests/s8` with coverage | 27 passed |
