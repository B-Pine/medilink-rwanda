import { http, HttpResponse } from "msw";

import type {
  ApprovalRequest,
  Bill,
  BillLine,
  BillRow,
  CashShift,
  ExemptionReason,
  MethodTotals,
  PaymentMethod,
  Receipt,
} from "../../features/billing";
import type { LanguageCode } from "../../types";
import type { FeatureMockFactory } from "../features";
import { id, now, page } from "./s1-common";

/**
 * S8 mocks (sprint-08 §3.1), Kigali Clinic, today. Reception (reception@medilink.test) and the
 * admin see four bills: Mukamana Jeanne G-012 (RAMA verified, unpaid), Habimana Eric G-014 (no
 * insurance, partly paid), Uwase Aline G-016 (Mutuelle, unpaid) and Niyonsaba Claudine G-009
 * (paid). A void request on Niyonsaba's payment waits in the admin's approvals. No shift is open
 * until the cashier opens one; payments need an open shift (B7).
 */
const FACILITY = "Kigali Clinic";
const today = () => now().slice(0, 10);

interface MockBill {
  bill: Bill;
}

function line(
  name: string,
  code: string,
  kind: BillLine["kind"],
  unit: number,
  quantity: number,
  insurerBp: number,
): BillLine {
  const total = unit * quantity;
  const insurer = Math.round((total * insurerBp) / 10_000);
  return {
    id: id(),
    kind,
    code,
    name,
    unit_price_rwf: unit,
    quantity,
    total_rwf: total,
    insurer_share_rwf: insurer,
    patient_share_rwf: total - insurer,
    is_covered: insurerBp > 0,
    is_medicine: kind === "medicine",
    removed: false,
    removed_reason: "",
  };
}

function recompute(bill: Bill): Bill {
  const lines = bill.lines.filter((l) => !l.removed);
  const total = lines.reduce((s, l) => s + l.total_rwf, 0);
  const insurer = lines.reduce((s, l) => s + l.insurer_share_rwf, 0);
  const patient = total - insurer;
  const exempted = bill.exemptions
    .filter((e) => !e.is_pending)
    .reduce((s, e) => s + e.amount_rwf, 0);
  const paid = bill.payments
    .filter((p) => p.status === "recorded")
    .reduce((s, p) => s + p.amount_rwf, 0);
  const due = Math.max(0, patient - exempted);
  const balance = Math.max(0, due - paid);
  bill.totals = {
    total_rwf: total,
    insurer_share_rwf: insurer,
    patient_share_rwf: patient,
    exempted_rwf: exempted,
    credited_rwf: 0,
    due_rwf: due,
    paid_rwf: paid,
    refunded_rwf: 0,
    balance_rwf: balance,
    owed_to_patient_rwf: Math.max(0, paid - due),
    refundable_rwf: 0,
  };
  bill.status = balance === 0 && due > 0 ? "paid" : paid > 0 ? "partly_paid" : "open";
  if (due === 0 && total > 0) bill.status = "paid";
  return bill;
}

function makeBill(
  name: string,
  ticket: string,
  insurance: { code: string; display: string; bp: number } | null,
  lines: [string, string, BillLine["kind"], number, number][],
): Bill {
  const bp = insurance ? 10_000 - insurance.bp : 0;
  return recompute({
    id: id(),
    visit_id: id(),
    facility_patient_id: id(),
    patient_display_name: name,
    service_date: today(),
    ticket_number: ticket,
    status: "open",
    insurance: insurance
      ? {
          status: "verified",
          insurance_profile_id: id(),
          insurer_code: insurance.code,
          insurer_display: insurance.display,
          member_number: `${insurance.code.toUpperCase()}-${ticket.slice(2)}4471`,
          is_accepted: true,
          patient_share_bp: insurance.bp,
          requires_referral: false,
        }
      : {
          status: "none",
          insurance_profile_id: null,
          insurer_code: "",
          insurer_display: "",
          member_number: "",
          is_accepted: false,
          patient_share_bp: null,
          requires_referral: false,
        },
    totals: {} as Bill["totals"],
    lines: lines.map(([n, c, k, u, q]) => line(n, c, k, u, q, bp)),
    missing_prices: [],
    payments: [],
    exemptions: [],
    credit_notes: [],
    approval_requests: [],
    verifications: [],
    version: 1,
  });
}

function seed() {
  const rama = { code: "rama", display: "RAMA (RSSB)", bp: 1_500 };
  const mutuelle = { code: "mutuelle", display: "Mutuelle de Santé", bp: 1_000 };
  const bills: MockBill[] = [
    {
      bill: makeBill("Mukamana Jeanne", "G-012", rama, [
        ["General consultation", "CONS-GEN", "service", 5_000, 1],
        ["Malaria RDT", "LAB-RDT", "procedure", 2_000, 1],
        ["Paracetamol 500 mg", "PARA500", "medicine", 50, 20],
      ]),
    },
    {
      bill: makeBill("Habimana Eric", "G-014", null, [
        ["General consultation", "CONS-GEN", "service", 5_000, 1],
        ["Amoxicillin 500 mg", "AMOX500", "medicine", 120, 21],
      ]),
    },
    {
      bill: makeBill("Uwase Aline", "G-016", mutuelle, [
        ["General consultation", "CONS-GEN", "service", 5_000, 1],
        ["Ibuprofen 400 mg", "IBU400", "medicine", 80, 10],
      ]),
    },
    {
      bill: makeBill("Niyonsaba Claudine", "G-009", rama, [
        ["General consultation", "CONS-GEN", "service", 5_000, 1],
      ]),
    },
  ];
  const receipts: Receipt[] = [];
  const pay = (b: Bill, method: PaymentMethod, amount: number, at: string) => {
    const receiptId = id();
    const number = `RC-2026-${String(231 + receipts.length).padStart(6, "0")}`;
    b.payments.push({
      id: id(),
      method,
      amount_rwf: amount,
      reference: method === "cash" ? "" : "MP2611021034",
      ebm_receipt_number: "",
      received_by_name: "Uwimana Grace",
      received_at: at,
      status: "recorded",
      receipt: { id: receiptId, number, status: "issued" },
    });
    recompute(b);
    receipts.push({
      id: receiptId,
      number,
      status: "issued",
      issued_at: at,
      facility_name: FACILITY,
      patient_display_name: b.patient_display_name,
      method,
      amount_rwf: amount,
      reference: method === "cash" ? "" : "MP2611021034",
      ebm_receipt_number: "",
      received_by_name: "Uwimana Grace",
      bill_id: b.id,
      bill_total_rwf: b.totals.total_rwf,
      bill_patient_share_rwf: b.totals.patient_share_rwf,
      balance_after_rwf: b.totals.balance_rwf,
    });
  };
  const habimana = bills[1]!.bill;
  pay(habimana, "mtn_momo", 4_000, now());
  const niyonsaba = bills[3]!.bill;
  pay(niyonsaba, "cash", niyonsaba.totals.balance_rwf, now());
  const request: ApprovalRequest = {
    id: id(),
    kind: "void_payment",
    bill_id: niyonsaba.id,
    payment_id: niyonsaba.payments[0]!.id,
    amount_rwf: niyonsaba.payments[0]!.amount_rwf,
    reason_code: "other",
    reason_text: "Recorded on the wrong patient; to record again on the right bill.",
    requested_by_name: "Uwimana Grace",
    requested_at: now(),
    status: "pending",
    decided_by_name: null,
    decided_at: null,
    decision_note: "",
    is_self_approved: false,
    patient_display_name: niyonsaba.patient_display_name,
    version: 1,
  };
  niyonsaba.approval_requests.push(request);
  // Yesterday's closed shifts wait for the admin's review (B22): one balanced, one 500 RWF short.
  const closed = (
    cashier: string,
    hoursAgo: number,
    expected: MethodTotals,
    counted: MethodTotals,
    note: string,
  ): CashShift => {
    const opened = new Date(Date.now() - hoursAgo * 3_600_000);
    const diff =
      counted.cash -
      (expected.cash + 10_000) +
      (counted.mtn_momo - expected.mtn_momo) +
      (counted.airtel_money - expected.airtel_money) +
      (counted.card - expected.card);
    return {
      id: id(),
      membership_id: id(),
      cashier_name: cashier,
      status: "closed",
      opened_at: opened.toISOString(),
      opening_float_rwf: 10_000,
      closed_at: new Date(opened.getTime() + 8 * 3_600_000).toISOString(),
      expected_totals: expected,
      counted_totals: counted,
      difference_rwf: diff,
      note,
      payment_count: 18 + (hoursAgo % 7),
      reviewed_by_name: null,
      reviewed_at: null,
      review_note: "",
      is_self_reviewed: false,
      version: 2,
    };
  };
  const history = [
    closed(
      "Mukamana Aline",
      20,
      { cash: 64_000, mtn_momo: 52_500, airtel_money: 8_000, card: 0 },
      { cash: 74_000, mtn_momo: 52_500, airtel_money: 8_000, card: 0 },
      "",
    ),
    closed(
      "Habimana Eric",
      44,
      { cash: 41_500, mtn_momo: 37_000, airtel_money: 4_500, card: 12_000 },
      { cash: 51_000, mtn_momo: 37_000, airtel_money: 4_500, card: 12_000 },
      "Gave change from my own pocket once; 500 short in the drawer.",
    ),
  ];
  return {
    bills,
    receipts,
    approvals: [request],
    shift: null as CashShift | null,
    history,
  };
}

const zero = (): MethodTotals => ({ cash: 0, mtn_momo: 0, airtel_money: 0, card: 0 });

const MESSAGES = {
  noShift: {
    en: "Open a cash shift before recording payments.",
    rw: "Banza ufungure igihe cy’akazi ku mafaranga mbere yo kwandika ubwishyu.",
    fr: "Ouvrez une session de caisse avant d’enregistrer un paiement.",
  },
  tooMuch: {
    en: "The amount is more than the balance.",
    rw: "Amafaranga arenze asigaye kwishyurwa.",
    fr: "Le montant dépasse le solde.",
  },
  stale: {
    en: "This bill changed. It was reloaded.",
    rw: "Iyi fagitire yahindutse. Yongeye gufungurwa.",
    fr: "Cette facture a changé. Elle a été rechargée.",
  },
  shiftOpen: {
    en: "A shift is already open.",
    rw: "Hari igihe cy’akazi gifunguye.",
    fr: "Une session est déjà ouverte.",
  },
} as const;

export const billingMocks: FeatureMockFactory = (context) => {
  const { api } = context;
  let db = seed();
  const S = `${api}/staff`;
  const staff = (request: Request, codes: string[]) => {
    const lang = context.languageFrom(request);
    const result = context.authenticatedStaff(lang);
    if ("error" in result) return { error: result.error };
    const granted = result.me.permissions as readonly string[];
    if (!result.me.active_facility_id || !codes.some((c) => granted.includes(c)))
      return {
        error: context.errorResponse(403, "permission_denied", context.message("notFound", lang)),
      };
    return { lang, me: result.me };
  };
  const PAY = ["billing.record_payment"];
  const READ = ["billing.record_payment", "billing.approve"];
  const notFound = (lang: LanguageCode) =>
    context.errorResponse(404, "not_found", context.message("notFound", lang));
  const rule = (lang: LanguageCode, key: keyof typeof MESSAGES, status = 422) =>
    context.errorResponse(
      status,
      status === 409 ? "conflict" : "business_rule_violation",
      MESSAGES[key][lang],
    );
  const find = (billId: string) => db.bills.find((b) => b.bill.id === billId)?.bill;
  const row = (b: Bill): BillRow => ({
    id: b.id,
    visit_id: b.visit_id,
    patient_display_name: b.patient_display_name,
    service_date: b.service_date,
    ticket_number: b.ticket_number,
    status: b.status,
    insurance_status: b.insurance.status,
    total_rwf: b.totals.total_rwf,
    patient_share_rwf: b.totals.patient_share_rwf,
    paid_rwf: b.totals.paid_rwf,
    balance_rwf: b.totals.balance_rwf,
    version: b.version,
  });

  const handlers = [
    http.get(`${S}/bills/`, ({ request }) => {
      const ok = staff(request, READ);
      if ("error" in ok) return ok.error;
      const url = new URL(request.url);
      const status = url.searchParams.get("status");
      const hasBalance = url.searchParams.get("has_balance") === "true";
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const rows = db.bills
        .map((b) => b.bill)
        .filter((b) => !status || b.status === status)
        .filter((b) => !hasBalance || b.totals.balance_rwf > 0)
        .filter(
          (b) =>
            !q ||
            b.patient_display_name.toLowerCase().includes(q) ||
            (b.ticket_number ?? "").toLowerCase().includes(q) ||
            b.payments.some((p) => p.receipt?.number.toLowerCase().includes(q)),
        )
        .map(row);
      return HttpResponse.json(page(rows, url));
    }),
    http.get(`${S}/bills/:id/`, ({ request, params }) => {
      const ok = staff(request, READ);
      if ("error" in ok) return ok.error;
      const bill = find(String(params.id));
      return bill ? HttpResponse.json(bill) : notFound(ok.lang);
    }),
    http.get(`${S}/visits/:visitId/bill/`, ({ request, params }) => {
      const ok = staff(request, READ);
      if ("error" in ok) return ok.error;
      const bill = db.bills.find((b) => b.bill.visit_id === params.visitId)?.bill;
      return bill ? HttpResponse.json(bill) : notFound(ok.lang);
    }),
    http.post(`${S}/bills/:id/payments/`, async ({ request, params }) => {
      const ok = staff(request, PAY);
      if ("error" in ok) return ok.error;
      const bill = find(String(params.id));
      if (!bill) return notFound(ok.lang);
      const body = (await request.json()) as {
        version: number;
        method: PaymentMethod;
        amount_rwf: number;
        reference?: string;
        ebm_receipt_number?: string;
      };
      if (!db.shift || db.shift.status !== "open") return rule(ok.lang, "noShift");
      if (body.version !== bill.version) return rule(ok.lang, "stale", 409);
      if (body.amount_rwf > bill.totals.balance_rwf) return rule(ok.lang, "tooMuch");
      const receiptId = id();
      const number = `RC-2026-${String(231 + db.receipts.length).padStart(6, "0")}`;
      const at = now();
      bill.payments.push({
        id: id(),
        method: body.method,
        amount_rwf: body.amount_rwf,
        reference: body.reference ?? "",
        ebm_receipt_number: body.ebm_receipt_number ?? "",
        received_by_name: ok.me.full_name,
        received_at: at,
        status: "recorded",
        receipt: { id: receiptId, number, status: "issued" },
      });
      bill.version += 1;
      recompute(bill);
      db.receipts.push({
        id: receiptId,
        number,
        status: "issued",
        issued_at: at,
        facility_name: FACILITY,
        patient_display_name: bill.patient_display_name,
        method: body.method,
        amount_rwf: body.amount_rwf,
        reference: body.reference ?? "",
        ebm_receipt_number: body.ebm_receipt_number ?? "",
        received_by_name: ok.me.full_name,
        bill_id: bill.id,
        bill_total_rwf: bill.totals.total_rwf,
        bill_patient_share_rwf: bill.totals.patient_share_rwf,
        balance_after_rwf: bill.totals.balance_rwf,
      });
      db.shift.expected_totals[body.method] += body.amount_rwf;
      db.shift.payment_count += 1;
      return HttpResponse.json(bill, { status: 201 });
    }),
    http.post(`${S}/bills/:id/exemptions/`, async ({ request, params }) => {
      const ok = staff(request, PAY);
      if ("error" in ok) return ok.error;
      const bill = find(String(params.id));
      if (!bill) return notFound(ok.lang);
      const body = (await request.json()) as {
        version: number;
        reason_code: ExemptionReason;
        reason_text?: string;
        amount_rwf: number;
      };
      if (body.version !== bill.version) return rule(ok.lang, "stale", 409);
      if (body.amount_rwf > bill.totals.balance_rwf) return rule(ok.lang, "tooMuch");
      bill.exemptions.push({
        id: id(),
        reason_code: body.reason_code,
        reason_text: body.reason_text ?? "",
        amount_rwf: body.amount_rwf,
        applied_by_name: ok.me.full_name,
        applied_at: now(),
        is_pending: false,
      });
      bill.version += 1;
      recompute(bill);
      return HttpResponse.json(bill, { status: 201 });
    }),
    http.post(`${S}/payments/:paymentId/void-requests/`, async ({ request, params }) => {
      const ok = staff(request, PAY);
      if ("error" in ok) return ok.error;
      const bill = db.bills
        .map((b) => b.bill)
        .find((b) => b.payments.some((p) => p.id === params.paymentId));
      const payment = bill?.payments.find((p) => p.id === params.paymentId);
      if (!bill || !payment) return notFound(ok.lang);
      const body = (await request.json()) as { reason_text: string; reason_code?: string };
      const req: ApprovalRequest = {
        id: id(),
        kind: "void_payment",
        bill_id: bill.id,
        payment_id: payment.id,
        amount_rwf: payment.amount_rwf,
        reason_code: body.reason_code ?? "other",
        reason_text: body.reason_text,
        requested_by_name: ok.me.full_name,
        requested_at: now(),
        status: "pending",
        decided_by_name: null,
        decided_at: null,
        decision_note: "",
        is_self_approved: false,
        patient_display_name: bill.patient_display_name,
        version: 1,
      };
      db.approvals.push(req);
      bill.approval_requests.push(req);
      return HttpResponse.json(req, { status: 201 });
    }),
    http.get(`${S}/approval-requests/`, ({ request }) => {
      const ok = staff(request, ["billing.approve"]);
      if ("error" in ok) return ok.error;
      const url = new URL(request.url);
      const status = url.searchParams.get("status");
      return HttpResponse.json(
        page(
          db.approvals.filter((a) => !status || a.status === status),
          url,
        ),
      );
    }),
    ...(["approve", "reject"] as const).map((action) =>
      http.post(`${S}/approval-requests/:id/${action}/`, async ({ request, params }) => {
        const ok = staff(request, ["billing.approve"]);
        if ("error" in ok) return ok.error;
        const req = db.approvals.find((a) => a.id === params.id);
        if (!req) return notFound(ok.lang);
        const body = (await request.json()) as { version: number; note?: string };
        if (body.version !== req.version) return rule(ok.lang, "stale", 409);
        req.status = action === "approve" ? "approved" : "rejected";
        req.decided_by_name = ok.me.full_name;
        req.decided_at = now();
        req.decision_note = body.note ?? "";
        req.version += 1;
        if (action === "approve" && req.kind === "void_payment") {
          const bill = find(req.bill_id);
          const payment = bill?.payments.find((p) => p.id === req.payment_id);
          if (bill && payment) {
            payment.status = "voided";
            if (payment.receipt) payment.receipt.status = "voided";
            bill.version += 1;
            recompute(bill);
          }
        }
        return HttpResponse.json(req);
      }),
    ),
    http.get(`${S}/receipts/:id/`, ({ request, params }) => {
      const ok = staff(request, READ);
      if ("error" in ok) return ok.error;
      const receipt = db.receipts.find((r) => r.id === params.id);
      return receipt ? HttpResponse.json(receipt) : notFound(ok.lang);
    }),
    http.get(`${S}/cash-shifts/`, ({ request }) => {
      const ok = staff(request, READ);
      if ("error" in ok) return ok.error;
      const url = new URL(request.url);
      const status = url.searchParams.get("status");
      const all = [...(db.shift ? [db.shift] : []), ...db.history];
      return HttpResponse.json(
        page(
          all.filter((s) => !status || s.status === status),
          url,
        ),
      );
    }),
    http.post(`${S}/cash-shifts/:id/review/`, async ({ request, params }) => {
      const ok = staff(request, ["billing.approve"]);
      if ("error" in ok) return ok.error;
      const shift = [...(db.shift ? [db.shift] : []), ...db.history].find(
        (s) => s.id === params.id,
      );
      if (!shift) return notFound(ok.lang);
      const body = (await request.json()) as { version: number; note?: string };
      if (body.version !== shift.version) return rule(ok.lang, "stale", 409);
      shift.status = "reviewed";
      shift.reviewed_by_name = ok.me.full_name;
      shift.reviewed_at = now();
      shift.review_note = body.note ?? "";
      shift.version += 1;
      return HttpResponse.json(shift);
    }),
    http.get(`${S}/cash-shifts/current/`, ({ request }) => {
      const ok = staff(request, PAY);
      if ("error" in ok) return ok.error;
      return db.shift && db.shift.status === "open"
        ? HttpResponse.json(db.shift)
        : notFound(ok.lang);
    }),
    http.post(`${S}/cash-shifts/`, async ({ request }) => {
      const ok = staff(request, PAY);
      if ("error" in ok) return ok.error;
      if (db.shift?.status === "open") return rule(ok.lang, "shiftOpen", 409);
      const body = (await request.json()) as { opening_float_rwf: number };
      db.shift = {
        id: id(),
        membership_id: id(),
        cashier_name: ok.me.full_name,
        status: "open",
        opened_at: now(),
        opening_float_rwf: body.opening_float_rwf,
        closed_at: null,
        expected_totals: zero(),
        counted_totals: null,
        difference_rwf: null,
        note: "",
        payment_count: 0,
        reviewed_by_name: null,
        reviewed_at: null,
        review_note: "",
        is_self_reviewed: false,
        version: 1,
      };
      return HttpResponse.json(db.shift, { status: 201 });
    }),
    http.post(`${S}/cash-shifts/:id/close/`, async ({ request, params }) => {
      const ok = staff(request, PAY);
      if ("error" in ok) return ok.error;
      if (!db.shift || db.shift.id !== params.id) return notFound(ok.lang);
      const body = (await request.json()) as { counted_totals: MethodTotals; note?: string };
      const expected = db.shift.expected_totals;
      const counted = body.counted_totals;
      db.shift.status = "closed";
      db.shift.closed_at = now();
      db.shift.counted_totals = counted;
      db.shift.difference_rwf =
        counted.cash -
        (expected.cash + db.shift.opening_float_rwf) +
        (counted.mtn_momo - expected.mtn_momo) +
        (counted.airtel_money - expected.airtel_money) +
        (counted.card - expected.card);
      db.shift.note = body.note ?? "";
      db.shift.version += 1;
      return HttpResponse.json(db.shift);
    }),
  ];
  return {
    handlers,
    reset: () => {
      db = seed();
    },
  };
};
