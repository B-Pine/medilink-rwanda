# Sprint 8 contract: Billing, payments and insurance

Status: v0.1 · 2026-11-02 · Wave 5 · Template and shared-file protocol: [contracts README](README.md) · Conventions: [API conventions](../02-api-conventions.md) · Model: [S7 contract](sprint-07-pharmacy-documents.md)

**Sprint goal:** every visit has one bill, opened at check-in. The consultation is billed from the facility tariff and the medicines from the prescription, and each line is split between the insurer and the patient using the facility's insurer rule. The receptionist (also the cashier in phase 1) verifies the patient's insurance for the visit, records cash, mobile money and card payments in an open shift, and each payment gets a receipt with a gapless number. Exemptions, voids and refunds follow rules that keep every correction visible, with approval by someone else. A shift closes with expected and counted totals and a review. Patients see their bills, receipts and unpaid balances.

Requirements: FR-BIL-04..13 (FR-BIL-01..03 and 05 are built in S2, S3 and S5).
Analysis: [08 · Billing, payments and insurance](../../analysis/08-billing-payments-and-insurance.md) §1.4, §3–6; [02 · Roles](../../analysis/02-users-roles-and-permissions.md) §3.
Database: [database design](../04-database-design.md) §5.11.
Security: [04 authorisation](../../security/04-authorization-and-tenant-isolation.md) §3; [06 application security](../../security/06-application-and-api-security.md) §4–5 (money invariants, idempotency); testing strategy: money invariants (no negative amounts, server-side totals, no self-approval).

## 1. Scope

The sprint ships as a backend pull request and a frontend pull request, both following this contract.

| In | Out (sprint) |
|---|---|
| One bill per visit, opened when the visit is checked in (and on first read for visits checked in before S8) | Bills without a visit (e.g. a shop sale) |
| Lines from the tariff: the consultation automatically from the visit's service; procedures and other charges added by the receptionist; medicines automatically from the issued prescription, priced by the tariff item whose `code` is the drug code (D-3) | Medicines without a tariff price (shown "price missing" and not billed until the facility adds one) |
| Insurer and patient share per line from the S2 insurer rule (patient share, exclusions, service list, ceiling per visit), using the S5 `cover()` rule | Live eligibility checks (P4, FR-BIL-17) |
| Insurance verification per visit: verified (referral letter seen when the rule needs one) or rejected with a reason; a rejection moves the bill to self-pay | Insurance claim lists and claim status (P2, FR-BIL-14) |
| Payments: cash, MTN MoMo, Airtel Money, card, each with a reference where it has one and an optional EBM receipt number; partial payments; needs an open shift; idempotent | Mobile money payment requests (P3, FR-BIL-16), card terminal integration |
| Receipts with gapless numbers per facility and year (`RC-2026-000123`), sent to the patient's app and email | The receipt PDF (S7b renders it through `documents.render` once S7b lands; until then the receipt is a screen and a print view) |
| Exemptions from a reason list; a waiver above the facility threshold needs approval | Reports of waivers (S10 part 2 reports read these tables) |
| Void of a payment (its receipt keeps its number and is marked void) and refund (request → approval → credit note → payout), with separation of duties; self-approval only in a one-person clinic, flagged | Subscription invoices to facilities (P2, FR-BIL-15) |
| Cash shifts: open with a float, close with counted totals per method, difference and note, review by the facility admin | EBM integration (P4) |
| Unpaid balances per patient at the facility; patient bills and receipts in patient-web | |
| Payment-first pharmacy (S7 D-6): when the bill no longer has a balance, prescriptions waiting for payment move to the pharmacy queue | |

## 2. Domain model

### 2.1 Tables

App `billing` (S2 created it with `billing_tariff_item` and `billing_insurer_rule`). Common columns (`id` UUIDv7, `facility_id`, `created_at`, `updated_at`) are not repeated. Every new table has forced facility RLS. Amounts are integers in RWF, CHECK ≥ 0 unless stated.

| Table | Key columns | Notes |
|---|---|---|
| `billing_bill` | `visit_id` **unique**, `patient_id`, `facility_patient_id`, `insurance_profile_id NULL`, `insurer_code NULL`, `insurer_rule_id NULL`, `patient_share_bp NULL`, `requires_referral boolean`, `status`, `total_rwf`, `insurer_share_rwf`, `patient_share_rwf`, `exempted_rwf`, `credited_rwf`, `paid_rwf`, `refunded_rwf`, `balance_rwf`, `version` | Snapshots of the insurer rule at verification. All totals server-computed from lines, exemptions, credit notes, payments and payouts (§2.2). Index (`facility_id`, `status`) where `balance_rwf > 0`; (`patient_id`) |
| `billing_bill_line` | `bill_id`, `kind` (`service`, `procedure`, `medicine`, `other`), `tariff_item_id NULL`, `code`, `name` (snapshots), `unit_price_rwf`, `quantity` CHECK > 0, `total_rwf`, `insurer_share_rwf`, `patient_share_rwf`, `is_covered boolean`, `prescription_item_id NULL` (**unique** where not removed), `added_by_membership_id NULL`, `removed_at NULL`, `removed_by_membership_id NULL`, `removed_reason` | A line is removed, never deleted; a removed line keeps its amounts. CHECK `total = unit × quantity` and `insurer + patient = total` |
| `billing_bill_event` | `bill_id`, `from_status`, `to_status`, `actor_id NULL`, `reason`, `occurred_at` | Append-only |
| `billing_insurance_verification` | `visit_id`, `bill_id`, `insurance_profile_id`, `result` (`verified`, `rejected`), `reason_code NULL`, `reason_text`, `referral_letter_seen NULL`, `verified_by_membership_id`, `verified_at` | Append-only. The latest row decides the bill's insurer |
| `billing_cash_shift` | `membership_id`, `status` (`open`, `closed`, `reviewed`), `opened_at`, `opening_float_rwf`, `closed_at NULL`, `expected_totals jsonb`, `counted_totals jsonb`, `difference_rwf bigint` (may be negative), `note`, `reviewed_by_membership_id NULL`, `reviewed_at NULL`, `review_note`, `version` | **Unique** (`facility_id`, `membership_id`) where `open` |
| `billing_payment` | `bill_id`, `shift_id`, `method` (`cash`, `mtn_momo`, `airtel_money`, `card`), `amount_rwf` CHECK > 0, `reference varchar(60)`, `ebm_receipt_number varchar(40)`, `received_by_membership_id`, `received_at`, `status` (`recorded`, `voided`), `voided_at NULL`, `void_request_id NULL`, `idempotency_key uuid NULL` | **Unique** (`facility_id`, `idempotency_key`). Only `status`, `voided_at`, `void_request_id` change (trigger) |
| `billing_receipt` | `payment_id` **unique**, `number varchar(24)`, `status` (`issued`, `voided`), `issued_at`, `voided_at NULL`, `document_id NULL` (S7b) | **Unique** (`facility_id`, `number`). Number from `documents.numbers.next_number(facility, prefix)` in the payment transaction (D-2). Only `status`, `voided_at`, `document_id` change |
| `billing_exemption` | `bill_id`, `reason_code`, `reason_text`, `amount_rwf` CHECK > 0, `applied_by_membership_id`, `approval_request_id NULL`, `applied_at NULL` | Append-only once applied; a pending waiver has `applied_at` NULL until approved |
| `billing_approval_request` | `kind` (`void_payment`, `refund`, `waiver`), `bill_id`, `payment_id NULL`, `exemption_id NULL`, `amount_rwf NULL`, `reason_code`, `reason_text`, `requested_by_membership_id`, `status` (`pending`, `approved`, `rejected`, `cancelled`), `decided_by_membership_id NULL`, `decided_at NULL`, `decision_note`, `is_self_approved boolean`, `version` | CHECK decider ≠ requester unless `is_self_approved`. One pending request per payment. Index (`facility_id`, `status`) |
| `billing_credit_note` | `bill_id`, `approval_request_id` **unique**, `number varchar(24)` (`CN-2026-000012`), `amount_rwf` CHECK > 0, `reduces_due_rwf` (≤ amount), `reason`, `issued_at`, `document_id NULL` | Append-only. **Unique** (`facility_id`, `number`) |
| `billing_refund_payout` | `credit_note_id`, `method`, `reference`, `amount_rwf` CHECK > 0, `paid_by_membership_id`, `paid_at`, `shift_id NULL` (required for cash), `idempotency_key uuid NULL` | Append-only. Sum per credit note ≤ its amount |

Bill `status` (analysis 08 §3): `open` (nothing paid), `partly_paid`, `paid` (no balance), `voided` (the visit was cancelled before any payment; lines removed), `credited` (a credit note brought the amount due to zero). Every change writes a `billing_bill_event`.

### 2.2 Rules

| Topic | Rule |
|---|---|
| Opening | `billing.services.open_bill(visit)` is idempotent (unique `visit_id`). Called by an `on_ticket_event` receiver on `check_in` (S4 interface) in the visit's facility context, and by every bill read (visits checked in before S8, or a lost event). It adds the consultation line from the tariff item of the visit's first service on the service date (none → no line, "price missing") and snapshots the visit's insurance profile with its rule (unverified until §Verification) |
| Split | Per line, from the snapshot rule: not covered (no rule, service outside the rule, or code excluded) → the patient pays the line; covered → patient share = round(total × `patient_share_bp` / 10 000), insurer the rest. The **ceiling per visit** caps the insurer total; the excess moves to the patient on the most recent covered lines. The same rule as S5 `cover()`. No insurer, or a rejected or unverified profile at payment → self-pay (D-4) |
| Totals | `due = patient_share − exempted − credited` (≥ 0), where `credited` sums the credit notes' `reduces_due_rwf`; `net_paid = paid − refunded`; `balance = max(due − net_paid, 0)`; `owed_to_patient = max(net_paid − due, 0)` (shown, refunded through a refund request). Recomputed in the same transaction as every change, under a row lock on the bill and with `version` |
| Lines | The receptionist adds procedure and other lines from the current tariff (`tariff_code`, `quantity`). Removal needs a reason and is allowed only while nothing is paid on the bill (`paid_rwf = 0`, analysis 08 §5 "before payment"); after payment a correction is a refund. Medicine lines are synced from the prescription: one line per issued item with a tariff price (quantity prescribed); a cancelled item, or one dispensed as not available with nothing given, loses its line while the bill has no payment; after a payment it stays and is refunded on request |
| Verification | `POST …/insurance-verifications/` with the profile (one of the patient's active profiles): `verified` (with `referral_letter_seen: true` when the rule requires a referral) or `rejected` with a reason code. Updates the visit's insurance, the S3 profile status (`last_verified_*`) and the bill snapshot, then re-splits the lines. Refused (`422`) once a payment exists unless the change lowers the patient's share (a later insurer verification after the patient paid cash makes `owed_to_patient`, refunded on request) |
| Payment | Needs the receiver's open shift (`422 shift_required`). `amount ≤ balance` (`422`; no overpayment, D-5). Mobile money and card need `reference`; cash may not have one. Optional `ebm_receipt_number`. `Idempotency-Key` (UUID) stores the key on the payment: a repeat returns the same payment and receipt. Issues the receipt in the same transaction |
| Receipt | `{prefix}-{year}-{000001}` from `documents.numbers.next_number` (gapless; `billing.receipt_prefix` setting, 2–4 capital letters, default `RC`). Sent with the S9 event `billing.receipt_issued` (in-app and email; amount and number, no lines). Staff can resend it |
| Exemption | Only when `billing.allow_exemptions` is on. Reason codes `indigent`, `staff`, `public_programme`, `waiver`, `other` (`other` needs text). Amount ≤ current balance. A `waiver` above `billing.waiver_approval_threshold_rwf` (default 0: every waiver) creates an approval request and applies on approval; other reasons apply at once |
| Void | Request (`void_payment`, reason) by `billing.record_payment`; on approval the payment and its receipt are voided (numbers kept), totals recomputed, and the void is counted in the payment's shift |
| Refund | Request with an amount ≤ `net_paid` minus credit notes not yet paid out and pending refunds, and a reason. On approval a credit note is issued (`CN-` number, same counter). The part of it that returns money already owed to the patient (`owed_to_patient`) leaves the amount due unchanged; the rest lowers it (`reduces_due_rwf`, e.g. paid but not seen). The payout (method, reference, idempotent; cash needs an open shift) is recorded by `billing.record_payment`; payouts ≤ the credit note |
| Approval | `billing.approve` with recent authentication (step-up). Decider ≠ requester. Self-approval is allowed only when no other active member of the facility holds `billing.approve`; it is stored with `is_self_approved = true` and shown in the inbox and reports. Reject needs a note. The requester can cancel a pending request |
| Shift | One open shift per member. Close: counted totals per method (cash, mtn_momo, airtel_money, card); expected = opening float (cash) + recorded payments − voided payments (by method) − cash payouts; `difference = Σ counted − Σ expected`; a note is required when the difference is not 0. Reviewed (accepted, with an optional note) by `billing.approve`, not by the shift owner unless self-approval is allowed as above |
| Visit end | A visit can complete with a balance (S4 is unchanged); the balance stays as the patient's unpaid balance at this facility, never shown to other facilities |
| Visit cancelled | A bill with no payment is `voided` (lines removed with reason `visit_cancelled`); with a payment it stays and a refund is the correction |
| Pharmacy | When `balance = 0` after a payment, exemption or credit, every prescription of the visit in `awaiting_payment` is moved on with `pharmacy.services.mark_covered` (S7 D-6) in the same transaction |
| Payment-first queue | The queue setting `billing.pay_before_consultation` (S2) decides where the cashier works; S8 shows the bill status on the payment stage (frontend) and does not block ticket moves (D-6) |
| Access | Staff bill reads are `billing.record_payment` or `billing.approve` at the active facility; doctors and pharmacists have no billing access. Medicine lines show the drug name only (analysis 02 §3); no diagnosis is ever on a bill |
| Patient read | Own and dependants' bills (S3 links), through a SECURITY DEFINER function, as S6 and S7; delegates see them too unless the visit has a restricted consultation (S6 `is_restricted`). Lines, payments (method, amount, receipt number), credit notes and balance |

### 2.3 Audit events

`billing.bill.opened`, `.line_added`, `.line_removed`, `.voided`, `.viewed` (patient link); `billing.insurance.verified`, `.rejected`; `billing.payment.recorded`, `.voided`; `billing.receipt.issued`, `.sent`; `billing.exemption.applied`; `billing.approval.requested`, `.approved`, `.rejected`, `.cancelled`; `billing.credit_note.issued`; `billing.refund.paid_out`; `billing.shift.opened`, `.closed`, `.reviewed`. IDs, codes and amounts only; never medicine names.

## 3. Endpoints

All under `/api/v1`. **Ver** = `version` in the body; **Up** = recent authentication or `403 step_up_required`; **Idem** = `Idempotency-Key` header.

### 3.1 Staff (`/staff/…`)

| # | Method and path | Permission | Request → response | Notes |
|---|---|---|---|---|
| B1 | `GET /staff/visits/{id}/bill/` | `billing.record_payment` or `billing.approve` | → `Bill` (lines, splits, payments with receipts, exemptions, credit notes, payouts, pending requests, balance) | Opens the bill if missing; audited |
| B2 | `GET /staff/bills/` | as B1 | `?status=&has_balance=&date=&q=&page=` → paginated `BillRow` | Today by default; `q` by patient name, ticket or receipt number |
| B3 | `GET /staff/bills/{id}/` | as B1 | → `Bill` | |
| B4 | `POST /staff/bills/{id}/lines/` | `billing.record_payment` | `{version, tariff_code, quantity}` → `201 Bill` | Procedure or other kinds only; current price |
| B5 | `POST /staff/bill-lines/{id}/remove/` | `billing.record_payment` | `{version, reason}` → `200 Bill` | `422` once paid |
| B6 | `POST /staff/visits/{id}/insurance-verifications/` | `patients.insurance_verify` | `{insurance_profile_id, result, reason_code?, reason_text?, referral_letter_seen?}` → `201 Bill` | §2.2 Verification |
| B7 | `POST /staff/bills/{id}/payments/` | `billing.record_payment` | `{version, method, amount_rwf, reference?, ebm_receipt_number?}` → `201 Bill` | Idem; open shift; `amount ≤ balance` |
| B8 | `POST /staff/bills/{id}/exemptions/` | `billing.record_payment` | `{version, reason_code, reason_text?, amount_rwf}` → `201 Bill` | Waiver above threshold → pending request |
| B9 | `POST /staff/payments/{id}/void-requests/` | `billing.record_payment` | `{reason_code, reason_text}` → `201 ApprovalRequest` | One pending per payment (`409`) |
| B10 | `POST /staff/bills/{id}/refund-requests/` | `billing.record_payment` | `{amount_rwf, reason_code, reason_text}` → `201 ApprovalRequest` | |
| B11 | `GET /staff/approval-requests/` | `billing.approve` | `?status=pending&kind=&page=` → paginated `ApprovalRequest` | |
| B12 | `POST /staff/approval-requests/{id}/approve/` | `billing.approve` | `{version, note?}` → `200 ApprovalRequest` | Up; separation of duties |
| B13 | `POST /staff/approval-requests/{id}/reject/` | `billing.approve` | `{version, note}` → `200 ApprovalRequest` | Up |
| B14 | `POST /staff/approval-requests/{id}/cancel/` | `billing.record_payment` (requester) | `{version}` → `200 ApprovalRequest` | |
| B15 | `POST /staff/credit-notes/{id}/payouts/` | `billing.record_payment` | `{method, amount_rwf, reference?}` → `201 Bill` | Idem; cash needs an open shift |
| B16 | `GET /staff/receipts/{id}/` | as B1 | → `Receipt` (facility, patient display name, payment, bill summary) | Print view |
| B17 | `POST /staff/receipts/{id}/send/` | `billing.record_payment` | → `202` | S9 `billing.receipt_issued` again |
| B18 | `GET /staff/cash-shifts/` | `billing.record_payment` (own) or `billing.approve` (all) | `?status=&page=` → paginated `CashShift` | |
| B19 | `GET /staff/cash-shifts/current/` | `billing.record_payment` | → `CashShift` with running expected totals, or `404` | |
| B20 | `POST /staff/cash-shifts/` | `billing.record_payment` | `{opening_float_rwf}` → `201 CashShift` | `409` when one is open |
| B21 | `POST /staff/cash-shifts/{id}/close/` | owner | `{version, counted_totals: {cash, mtn_momo, airtel_money, card}, note?}` → `200 CashShift` | |
| B22 | `POST /staff/cash-shifts/{id}/review/` | `billing.approve` | `{version, note?}` → `200 CashShift` | Not the owner (unless one-person clinic, flagged) |
| B23 | `GET /staff/billing/patients/{fp_id}/balances/` | `billing.record_payment` | → `{total_balance_rwf, bills: [BillRow]}` | This facility only |

### 3.2 Patient (`/patient/…`)

| # | Method and path | Request → response | Notes |
|---|---|---|---|
| PB1 | `GET /patient/bills/` | `?patient_id=&has_balance=&page=` → paginated `PatientBillRow` | Own and dependants' |
| PB2 | `GET /patient/bills/{id}/` | → `PatientBill` (lines, payments with receipt numbers, credit notes, balance) | `404` for another account's |

## 4. Permissions

S0 codes: `billing.record_payment` (receptionist, facility admin), `billing.approve` (facility admin); S3 `patients.insurance_verify`. No new codes.

## 5. Background jobs

None. Receipts are sent through S9 on commit.

## 6. Frontend

### 6.1 staff-web

| Route / mount | Screen | Rules |
|---|---|---|
| `/billing` (nav for `billing.record_payment`) | Today's bills: tabs Unpaid, Partly paid, Paid; search by name, ticket or receipt; shift banner (open a shift / current totals) | |
| `/billing/bills/:id` and a **Bill** panel on the payment stage of the queue (S4 ticket page, through a slot) | Bill: lines with insurer/patient split, insurance verification (verify or reject with reason, referral letter check), add line from the tariff, remove (reason, before payment), record payment (method, amount, reference, EBM number), exemption, void and refund requests, receipts | `409` reload; server errors inline |
| `/billing/receipts/:id` | Receipt print view (80 mm) and Send | Browser print |
| `/billing/shifts` | My shift: open (float), running totals, close (counted per method, difference, note); history | |
| `/billing/approvals` (nav for `billing.approve`) | Approvals inbox (voids, refunds, waivers) with approve and reject (step-up); shifts to review | Self-approval flagged |
| `/billing/credit-notes/:id` | Payout recording | |

### 6.2 patient-web

| Route | Screen |
|---|---|
| `/bills` and a Home card when there is a balance | My bills: per person, balance first; bill detail with lines, insurer and patient share, payments and receipt numbers |

### 6.3 Shared packages

api-client `billing` module and MSW mocks for §3.1–3.2 (sessions, CSRF, permissions, §2.2 rules, `409`, `422`, step-up, idempotency); namespaces `billing` (staff-web) and `bills` (patient-web) in rw/en/fr; amounts through a shared `formatRwf()`.

## 7. Integration points

**Shared files (`[S8]` blocks):** `config/settings/base.py` (`ENUM_NAME_OVERRIDES`), `config/urls.py`, `audit/actions.py`, `.github/workflows/ci-backend.yml` (nothing: `billing` is already in the coverage loop), frontend registries and `navigation.ts`.
**S4:** a receiver on `visits.services.on_ticket_event` (`check_in`, `cancel`); the queue page's payment stage gets an `[S8]` slot. Nothing else in S4 changes.
**S7:** calls `pharmacy.services.mark_covered`; reads prescription items and dispense lines (read-only).
**S3:** updates the insurance profile's `last_verified_*` and status through `patients` services.
**Settings (registered by `billing` in its own module):** `billing.waiver_approval_threshold_rwf` (int ≥ 0, default 0). S2 already has `billing.allow_exemptions`, `billing.receipt_prefix`, `billing.pay_before_consultation`; S7 `billing.pay_before_dispensing`.
**Interfaces offered:** `billing.services.open_bill(visit)`, `billing.services.balance(bill)`; S10 part 2 reports read the billing tables.

## 8. Dependencies

S2 (tariff, insurer rules, settings), S3 (insurance profiles), S4 (visits, ticket events), S5 (`cover()`), S7a (prescriptions, `mark_covered`, `documents.numbers`), S9 (notifications). S7b (receipt PDF) is optional: `document_id` stays NULL until it lands.

## 9. Acceptance checks

### Backend

| # | Check | Source |
|---|---|---|
| S8-B1 | Every §3 endpoint in the schema; `spectacular --validate --fail-on-warn` | architecture 02 |
| S8-B2 | Authorisation matrix: receptionist, facility admin, doctor, pharmacist, other facility (`404`), patient own and dependants', delegates and restricted visits | security 04 |
| S8-B3 | Bill opened once per visit on check-in and on first read; consultation line from the tariff; "price missing" without a tariff | FR-BIL-06 |
| S8-B4 | Split: covered, excluded code, service outside the rule, ceiling per visit, self-pay; amounts never negative; totals server-side | FR-BIL-02, 06 |
| S8-B5 | Lines: add from tariff, remove with reason before payment only, medicine lines synced from the prescription (cancelled and not available removed before payment) | FR-BIL-06 |
| S8-B6 | Verification: verified, referral letter required, rejected → self-pay; S3 profile updated; refused after payment unless it lowers the patient share | FR-BIL-04 |
| S8-B7 | Payments: methods, references, EBM number, partial, no overpayment, open shift required, idempotent repeat, stale `version` | FR-BIL-07, 13 |
| S8-B8 | Receipts gapless per facility and year (rollback gives the number back), prefix setting, S9 notification | FR-BIL-08 |
| S8-B9 | Exemptions: setting, reason list, waiver threshold and approval | FR-BIL-11 |
| S8-B10 | Void and refund: approval, credit note numbering, payout limits, separation of duties, one-person clinic self-approval flagged, step-up | FR-BIL-09 |
| S8-B11 | Shifts: one open per member, expected per method (voids, payouts), difference and note, review not by owner | FR-BIL-10 |
| S8-B12 | Unpaid balances per patient at the facility only; patient bills read | FR-BIL-12 |
| S8-B13 | Payment-first pharmacy: `mark_covered` when the balance reaches 0; visit cancel voids an unpaid bill | S7 D-6 |
| S8-B14 | Forced RLS on every new table; append-only tables and payment/receipt lock triggers; audit IDs and amounts only; migrations reverse; coverage ≥ 90 % | database design |

### Frontend

| # | Check | Source |
|---|---|---|
| S8-F1 | Bills list and bill page: split, verification, add/remove line, payment, exemption, void/refund requests, `409` reload, server errors inline | FR-BIL-04..09, 11 |
| S8-F2 | Bill panel on the queue payment stage | analysis 08 §3 |
| S8-F3 | Shift open, running totals, close with counted totals and note; history | FR-BIL-10 |
| S8-F4 | Approvals inbox with step-up; self-approval flagged; shift review | FR-BIL-09, 10 |
| S8-F5 | Receipt print view (80 mm) and send | FR-BIL-08 |
| S8-F6 | Patient My bills with balance first | FR-BIL-12 |
| S8-F7 | MSW mocks for every endpoint; `billing` and `bills` namespaces in rw/en/fr with parity; axe clean; amounts through `formatRwf()` and dates through `dateFormat()` | contracts README |

### Integration

| # | Check |
|---|---|
| S8-I1 | On staging: check-in opens the bill; insurance verified; the patient pays the share in cash; the doctor prescribes; the medicines are added and paid; the prescription reaches the pharmacy (pay-first); a refund is approved by the admin; the shift closes and is reviewed |
| S8-I2 | Only `billing`, `[S8]` blocks and slots changed; OpenAPI regenerated; suites green |

## 10. Decisions and deviations from the docs

| # | Decision | Contract or design text it changes | Why |
|---|---|---|---|
| D-1 | The bill opens on the S4 `check_in` event **and** on first read (idempotent) | S4 interface "S8 creates the bill on `check_in`" | The event is sent after commit; a lost event or a visit from before S8 must still have a bill |
| D-2 | Receipt and credit note numbers come from `documents_number_counter` (S7a) with prefixes `RC` (setting) and `CN`; no `billing_receipt_counter` | Database design §5.11 (`billing_receipt_counter`, `billing_receipt.year/sequence`) | One gapless counter for every numbered document |
| D-3 | Medicine prices are tariff items of kind `medicine` whose `code` equals the drug code; no `drug_id` column on the tariff | Database design §5.11 ("`drug_id` comes with S7/S8") | The S2 tariff API and screens already manage codes; no schema change to S2's table |
| D-4 | The insurer share is not a payment: it is recorded on the bill (`insurer_share_rwf`) and claimed later (P2 claims). Payment methods are cash, MTN MoMo, Airtel Money and card; no `insurance` method | Analysis 08 §4 ("Insurance: insurer share recorded as to be claimed"); database design `method` includes `insurance` | The insurer share is known from the split; a manual "insurance payment" would double count it |
| D-5 | No overpayment: a payment is at most the balance. Money owed to the patient (after a later verification or a credit) is paid back through a refund | Analysis 08 §4 (silent on overpayment) | Keeps cash-up exact; every return of money is approved |
| D-6 | Payment-first does not block ticket moves in S4; the cashier sees the bill status on the payment stage | Analysis 08 §3 "Payment timing follows the facility's queue configuration" | S4 owns ticket transitions; blocking there needs an S4 change and an emergency override, deferred to S11 hardening after the pilot shows the need |
| D-7 | `void_receipt` is not a separate request: voiding a payment voids its receipt (number kept) | Database design §5.11 `kind` list | A receipt belongs to exactly one payment |
| D-8 | Line removal is allowed only while nothing is paid on the bill | Database design §5.11 "Locked once paid" (per line) | Simple and auditable: after the first payment every correction is a refund |
| D-9 | Balances live at `/staff/billing/patients/{fp_id}/balances/` | Catalogue `/staff/patients/{id}/balances/` | S3 owns `/staff/patients/{fp_id}/<kind>/` (health items), which would catch the path |
