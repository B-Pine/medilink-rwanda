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

export interface CashShift {
  id: Uuid;
  membership_id: Uuid;
  cashier_name: string;
  status: ShiftStatus;
  opened_at: string;
  opening_float_rwf: number;
  closed_at: string | null;
  expected_totals: MethodTotals;
  counted_totals: MethodTotals | null;
  difference_rwf: number | null;
  note: string;
  payment_count: number;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string;
  is_self_reviewed: boolean;
  version: number;
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
  };
}

export type BillingApi = ReturnType<typeof createBillingApi>;
