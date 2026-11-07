/**
 * S8 billing for staff (contract sprint-08 §3.1): today's bills, the bill of a visit with its
 * lines and insurer/patient split, payments and receipts, exemptions, void and refund requests,
 * the approvals inbox and cash shifts. Amounts are whole RWF.
 */
import type { ApiClient } from "../client";
import type { Uuid } from "../types";
import type { Paginated } from "./clinical";

export type BillStatus = "open" | "partly_paid" | "paid" | "voided" | "credited";
export type PaymentMethod = "cash" | "mtn_momo" | "airtel_money" | "card";
export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  "cash",
  "mtn_momo",
  "airtel_money",
  "card",
];
export type ExemptionReason = "indigent" | "staff" | "public_programme" | "waiver" | "other";
export const EXEMPTION_REASONS: readonly ExemptionReason[] = [
  "indigent",
  "public_programme",
  "staff",
  "waiver",
  "other",
];
export type ApprovalKind = "void_payment" | "refund" | "waiver";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";
export type BillInsuranceStatus = "none" | "unverified" | "verified" | "rejected";
export type ShiftStatus = "open" | "closed" | "reviewed";

export interface MethodTotals {
  cash: number;
  mtn_momo: number;
  airtel_money: number;
  card: number;
}

export interface BillLine {
  id: Uuid;
  kind: "service" | "procedure" | "medicine" | "other";
  code: string;
  name: string;
  unit_price_rwf: number;
  quantity: number;
  total_rwf: number;
  insurer_share_rwf: number;
  patient_share_rwf: number;
  is_covered: boolean;
  is_medicine: boolean;
  removed: boolean;
  removed_reason: string;
}

export interface BillPayment {
  id: Uuid;
  method: PaymentMethod;
  amount_rwf: number;
  reference: string;
  ebm_receipt_number: string;
  received_by_name: string;
  received_at: string;
  status: "recorded" | "voided";
  receipt: { id: Uuid; number: string; status: "issued" | "voided" } | null;
}

export interface BillExemption {
  id: Uuid;
  reason_code: ExemptionReason;
  reason_text: string;
  amount_rwf: number;
  applied_by_name: string;
  applied_at: string | null;
  is_pending: boolean;
}

export interface ApprovalRequest {
  id: Uuid;
  kind: ApprovalKind;
  bill_id: Uuid;
  payment_id: Uuid | null;
  amount_rwf: number | null;
  reason_code: string;
  reason_text: string;
  requested_by_name: string;
  requested_at: string;
  status: ApprovalStatus;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string;
  is_self_approved: boolean;
  patient_display_name: string;
  version: number;
}

export interface BillTotals {
  total_rwf: number;
  insurer_share_rwf: number;
  patient_share_rwf: number;
  exempted_rwf: number;
  credited_rwf: number;
  due_rwf: number;
  paid_rwf: number;
  refunded_rwf: number;
  balance_rwf: number;
  owed_to_patient_rwf: number;
  refundable_rwf: number;
}

export interface Bill {
  id: Uuid;
  visit_id: Uuid;
  facility_patient_id: Uuid;
  patient_display_name: string;
  service_date: string;
  ticket_number: string | null;
  status: BillStatus;
  insurance: {
    status: BillInsuranceStatus;
    insurance_profile_id: Uuid | null;
    insurer_code: string;
    insurer_display: string;
    member_number: string;
    is_accepted: boolean;
    patient_share_bp: number | null;
    requires_referral: boolean;
  };
  totals: BillTotals;
  lines: BillLine[];
  missing_prices: { kind: "service" | "medicine"; code: string; name: string }[];
  payments: BillPayment[];
  exemptions: BillExemption[];
  credit_notes: { id: Uuid; number: string; amount_rwf: number; paid_out_rwf: number }[];
  approval_requests: ApprovalRequest[];
  verifications: unknown[];
  version: number;
}

export interface BillRow {
  id: Uuid;
  visit_id: Uuid;
  patient_display_name: string;
  service_date: string;
  ticket_number: string | null;
  status: BillStatus;
  insurance_status: BillInsuranceStatus;
  total_rwf: number;
  patient_share_rwf: number;
  paid_rwf: number;
  balance_rwf: number;
  version: number;
}

export interface Receipt {
  id: Uuid;
  number: string;
  status: "issued" | "voided";
  issued_at: string;
  facility_name: string;
  patient_display_name: string;
  method: PaymentMethod;
  amount_rwf: number;
  reference: string;
  ebm_receipt_number: string;
  received_by_name: string;
  bill_id: Uuid;
  bill_total_rwf: number;
  bill_patient_share_rwf: number;
  balance_after_rwf: number;
}

/** #203 end-of-shift summary row for one payment method. */
export interface ShiftMethodRow {
  method: PaymentMethod;
  payment_count: number;
  received_rwf: number;
  /** Refunds paid back in this shift. */
  paid_out_rwf: number;
  /** What the drawer should hold; cash includes the opening float. */
  expected_rwf: number;
  /** `null` while the shift is open. */
  counted_rwf: number | null;
  /** Counted minus expected; `null` while open. */
  difference_rwf: number | null;
}

export interface CashShift {
  id: Uuid;
  membership_id: Uuid;
  cashier_name: string;
  status: ShiftStatus;
  opened_at: string;
  opening_float_rwf: number;
  closed_at: string | null;
  /** What the drawer should hold per method; cash includes the opening float. */
  expected_totals: MethodTotals;
  counted_totals: MethodTotals | null;
  difference_rwf: number | null;
  note: string;
  payment_count: number;
  by_method: ShiftMethodRow[];
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string;
  is_self_reviewed: boolean;
  version: number;
}

/** What a shift took in across all methods (payments only: no float, no refunds paid out). */
export function shiftCollected(shift: Pick<CashShift, "by_method">): number {
  return shift.by_method.reduce((total, row) => total + row.received_rwf, 0);
}

// ---- #203 monthly claim list per insurer ----

export type ClaimStatus = "pending" | "paid" | "rejected";

export interface ClaimInsurer {
  code: string;
  name: string;
}

export interface ClaimLine {
  code: string;
  name: string;
  kind: BillLine["kind"];
  quantity: number;
  total_rwf: number;
  insurer_share_rwf: number;
  patient_share_rwf: number;
  is_covered: boolean;
}

export interface ClaimRow {
  bill_id: Uuid;
  visit_id: Uuid;
  service_date: string;
  patient_display_name: string;
  member_number: string;
  /** Signed notes only; the primary diagnosis first. */
  icd10_codes: string[];
  lines: ClaimLine[];
  total_rwf: number;
  insurer_share_rwf: number;
  patient_share_rwf: number;
  status: ClaimStatus;
  reason: string;
  reference: string;
  decided_by_name: string | null;
  decided_at: string | null;
  /** 0 until the claim is first marked. */
  version: number;
}

export interface ClaimSummary {
  count: number;
  total_rwf: number;
  insurer_share_rwf: number;
  patient_share_rwf: number;
  pending_count: number;
  paid_count: number;
  paid_rwf: number;
  rejected_count: number;
  rejected_rwf: number;
}

export interface ClaimList {
  insurer_code: string;
  month: string;
  summary: ClaimSummary;
  results: ClaimRow[];
}

/** PB1: one of my (or a dependant's) bills, any facility, newest first. */
export interface PatientBillRow {
  id: Uuid;
  patient_id: Uuid;
  facility_name: string;
  service_date: string;
  status: BillStatus;
  total_rwf: number;
  patient_share_rwf: number;
  paid_rwf: number;
  balance_rwf: number;
}

export interface PatientBillLine {
  name: string;
  quantity: number;
  total_rwf: number;
  insurer_share_rwf: number;
  patient_share_rwf: number;
}

export interface PatientPayment {
  method: PaymentMethod;
  amount_rwf: number;
  received_at: string;
  status: "recorded" | "voided";
  receipt_number: string | null;
}

/** PB2: the bill with its lines, payments (receipt numbers) and credit notes. */
export interface PatientBill extends PatientBillRow {
  insurer_share_rwf: number;
  exempted_rwf: number;
  credited_rwf: number;
  refunded_rwf: number;
  lines: PatientBillLine[];
  payments: PatientPayment[];
  credit_notes: { number: string; amount_rwf: number; issued_at: string }[];
}

export interface PaymentInput {
  version: number;
  method: PaymentMethod;
  amount_rwf: number;
  reference?: string;
  ebm_receipt_number?: string;
}

const STF = "/api/v1/staff";

export const billingPaths = {
  visitBill: (visitId: Uuid) => `${STF}/visits/${visitId}/bill/`,
  bills: `${STF}/bills/`,
  bill: (id: Uuid) => `${STF}/bills/${id}/`,
  payments: (id: Uuid) => `${STF}/bills/${id}/payments/`,
  exemptions: (id: Uuid) => `${STF}/bills/${id}/exemptions/`,
  voidRequest: (paymentId: Uuid) => `${STF}/payments/${paymentId}/void-requests/`,
  approvals: `${STF}/approval-requests/`,
  approve: (id: Uuid) => `${STF}/approval-requests/${id}/approve/`,
  reject: (id: Uuid) => `${STF}/approval-requests/${id}/reject/`,
  receipt: (id: Uuid) => `${STF}/receipts/${id}/`,
  shifts: `${STF}/cash-shifts/`,
  currentShift: `${STF}/cash-shifts/current/`,
  closeShift: (id: Uuid) => `${STF}/cash-shifts/${id}/close/`,
  reviewShift: (id: Uuid) => `${STF}/cash-shifts/${id}/review/`,
  claims: `${STF}/insurance-claims/`,
  claimInsurers: `${STF}/insurance-claims/insurers/`,
  /** CSV (default) or PDF of the month's claims; fetch it with the session cookie. */
  claimsExport: (params: { insurer: string; month: string; kind?: "csv" | "pdf" }) =>
    `${STF}/insurance-claims/export/${query({ ...params })}`,
  markClaim: (billId: Uuid) => `${STF}/bills/${billId}/claim/`,
  patientBills: "/api/v1/patient/bills/",
  patientBill: (id: Uuid) => `/api/v1/patient/bills/${id}/`,
};

function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function createBillingApi(client: ApiClient) {
  return {
    /** B1: opens the bill when the visit has none yet. */
    forVisit: (visitId: Uuid) => client.get<Bill>(billingPaths.visitBill(visitId)),
    /** B2: today by default; `q` by name, ticket or receipt number. */
    bills: (
      params: { status?: BillStatus; has_balance?: boolean; q?: string; page?: number } = {},
    ) => client.get<Paginated<BillRow>>(billingPaths.bills + query(params)),
    bill: (id: Uuid) => client.get<Bill>(billingPaths.bill(id)),
    /** B7: needs an open shift; `amount ≤ balance`. */
    pay: (id: Uuid, body: PaymentInput, idempotencyKey: string) =>
      client.post<Bill>(billingPaths.payments(id), body, {
        headers: { "Idempotency-Key": idempotencyKey },
      }),
    exempt: (
      id: Uuid,
      body: {
        version: number;
        reason_code: ExemptionReason;
        reason_text?: string;
        amount_rwf: number;
      },
    ) => client.post<Bill>(billingPaths.exemptions(id), body),
    requestVoid: (paymentId: Uuid, body: { reason_text: string; reason_code?: string }) =>
      client.post<ApprovalRequest>(billingPaths.voidRequest(paymentId), body),
    approvals: (params: { status?: ApprovalStatus; page?: number } = {}) =>
      client.get<Paginated<ApprovalRequest>>(billingPaths.approvals + query(params)),
    approve: (id: Uuid, body: { version: number; note?: string }) =>
      client.post<ApprovalRequest>(billingPaths.approve(id), body),
    reject: (id: Uuid, body: { version: number; note: string }) =>
      client.post<ApprovalRequest>(billingPaths.reject(id), body),
    receipt: (id: Uuid) => client.get<Receipt>(billingPaths.receipt(id)),
    /** B19: `404` when no shift is open. */
    currentShift: () => client.get<CashShift>(billingPaths.currentShift),
    openShift: (openingFloat: number) =>
      client.post<CashShift>(billingPaths.shifts, { opening_float_rwf: openingFloat }),
    closeShift: (
      id: Uuid,
      body: { version: number; counted_totals: MethodTotals; note?: string },
    ) => client.post<CashShift>(billingPaths.closeShift(id), body),
    /** B18: my shifts, or every shift for an approver (`mine` keeps only my own). */
    shifts: (
      params: { status?: ShiftStatus; mine?: boolean; page?: number; page_size?: number } = {},
    ) => client.get<Paginated<CashShift>>(billingPaths.shifts + query(params)),
    /** B22: accept a closed shift; not the owner unless a one-person clinic. */
    reviewShift: (id: Uuid, body: { version: number; note?: string }) =>
      client.post<CashShift>(billingPaths.reviewShift(id), body),
    /** #203: insurers accepted here or verified on a bill. */
    claimInsurers: () => client.get<ClaimInsurer[]>(billingPaths.claimInsurers),
    /** #203: the month's claims for one insurer (`month` is `YYYY-MM`). */
    claims: (params: { insurer: string; month: string }) =>
      client.get<ClaimList>(billingPaths.claims + query(params)),
    /** #203: paid, or rejected with the insurer's reason; `version` 0 for a first mark. */
    markClaim: (
      billId: Uuid,
      body: { version: number; status: "paid" | "rejected"; reason?: string; reference?: string },
    ) => client.post<ClaimRow>(billingPaths.markClaim(billId), body),
    /** S8 §3.2: the signed-in patient's own and dependants' bills (S8-F6). */
    patient: {
      /** PB1 */
      list: (params: { patient_id?: Uuid; has_balance?: boolean; page?: number } = {}) =>
        client.get<Paginated<PatientBillRow>>(billingPaths.patientBills + query(params)),
      /** PB2: `404` for another account's bill. */
      get: (id: Uuid) => client.get<PatientBill>(billingPaths.patientBill(id)),
    },
  };
}

export type BillingApi = ReturnType<typeof createBillingApi>;
