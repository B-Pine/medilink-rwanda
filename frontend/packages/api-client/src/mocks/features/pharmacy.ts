import { http, HttpResponse } from "msw";

import type { Consultation } from "../../features/clinical";
import {
  defaultQuantity,
  OPEN_ITEM_STATUSES,
  type AlertOverride,
  type AvailabilityRow,
  type DispenseHistoryRow,
  type DispenseLineInput,
  type DosingLabel,
  type DrugRoute,
  type DrugRow,
  type FrequencyCode,
  type PatientPrescription,
  type PharmacyDay,
  type PharmacyQueueRow,
  type Prescription,
  type PrescriptionAlert,
  type PrescriptionItem,
  type PrescriptionItemInput,
  type PrescriptionStatus,
} from "../../features/pharmacy";
import type { LanguageCode } from "../../types";
import { extendMockRoleGrants } from "../data";
import type { FeatureMockFactory } from "../features";
import { MOCK_CLINICAL_FP, MOCK_PRESSURE_CONSULTATION, setConsultationSignHook } from "./clinical";
import { SELF_PATIENT_ID } from "./patients-store";
import { id, now, page, s1, stepUpFailure } from "./s1-common";

/**
 * S7a mocks (sprint-07 §6.3), Kigali Clinic. The pharmacist (pharmacist@medilink.test) sees four
 * prescriptions in the queue:
 * - `MOCK_RX_READY` Mukamana Jeanne, ticket G-012: paracetamol and amlodipine, ready
 * - Habimana Eric: amoxicillin, 10 of 21 given (partly dispensed)
 * - Niyonsaba Claudine: morphine (controlled) and artemether-lumefantrine (not in stock here)
 * - Uwase Aline: ibuprofen with an open query to the doctor
 * Substitutes with the same ingredient and strength: AMOX500 ↔ AMOX500-G, PARA500 ↔ PARA500-P.
 * The doctor prescribes inside the S6 consultation; signing issues the prescription (contract D-1).
 * The patient (patient@medilink.test) has the ready prescription and a past, dispensed one.
 */
extendMockRoleGrants({
  pharmacist: ["pharmacy.availability"],
  facility_admin: ["pharmacy.availability"],
});

export const MOCK_RX_READY = "8d000000-0000-4000-8000-000000000101";
export const MOCK_RX_PARTLY = "8d000000-0000-4000-8000-000000000102";
export const MOCK_RX_CONTROLLED = "8d000000-0000-4000-8000-000000000103";
export const MOCK_RX_QUERIED = "8d000000-0000-4000-8000-000000000104";
const MOCK_RX_PRESSURE = "8d000000-0000-4000-8000-000000000106";
const MOCK_QUERY_PRESSURE = "8d000000-0000-4000-8000-000000000206";
export const MOCK_RX_PAST = "8d000000-0000-4000-8000-000000000105";

interface MockDrug extends Omit<DrugRow, "available_here"> {
  klass: string;
  max: number | null;
  route: DrugRoute;
}

const DRUGS: MockDrug[] = [
  ["AMOX500", "Amoxicillin 500 mg capsule", "amoxicillin", "500 mg", "capsule", "penicillin", 30],
  ["AMOX500-G", "Amoxil 500 mg capsule", "amoxicillin", "500 mg", "capsule", "penicillin", 30],
  ["PARA500", "Paracetamol 500 mg tablet", "paracetamol", "500 mg", "tablet", "analgesic", 60],
  ["PARA500-P", "Panadol 500 mg tablet", "paracetamol", "500 mg", "tablet", "analgesic", 60],
  ["AMLO5", "Amlodipine 5 mg tablet", "amlodipine", "5 mg", "tablet", "antihypertensive", 90],
  ["IBU400", "Ibuprofen 400 mg tablet", "ibuprofen", "400 mg", "tablet", "nsaid", 42],
  [
    "ARTE20",
    "Artemether-lumefantrine 20/120 mg tablet",
    "artemether",
    "20/120 mg",
    "tablet",
    "antimalarial",
    24,
  ],
  ["ORS", "Oral rehydration salts sachet", "ors", "20.5 g", "sachet", "rehydration", 20],
  ["MORPH10", "Morphine 10 mg tablet", "morphine", "10 mg", "tablet", "opioid", 20],
].map(([code, display, generic_name, strength, form, klass, max]) => ({
  code: code as string,
  display: display as string,
  generic_name: generic_name as string,
  strength: strength as string,
  form: form as string,
  klass: klass as string,
  max: max as number,
  is_controlled: klass === "opioid",
  route: "oral",
}));
const drug = (code: string) => DRUGS.find((d) => d.code === code);

const MESSAGES = {
  stale: {
    en: "This prescription changed meanwhile. It was reloaded.",
    fr: "Cette ordonnance a été modifiée entre-temps. Elle a été rechargée.",
    rw: "Iyi resept yahinduwe hagati aho. Yongeye gufungurwa.",
  },
  locked: {
    en: "This prescription is issued. Cancel the item and add a new one instead.",
    fr: "Cette ordonnance est émise. Annulez la ligne et ajoutez-en une nouvelle.",
    rw: "Iyi resept yatanzwe. Hagarika umuti wongereho undi mushya.",
  },
  dispensed: {
    en: "Part of this was already given, so it cannot be cancelled.",
    fr: "Une partie a déjà été délivrée, impossible d'annuler.",
    rw: "Igice cyamaze gutangwa, ntibishobora guhagarikwa.",
  },
  override: {
    en: "Give a reason for each allergy alert before signing.",
    fr: "Indiquez un motif pour chaque alerte d'allergie avant de signer.",
    rw: "Tanga impamvu kuri buri muburo w'aleriji mbere yo gusinya.",
  },
  substitute: {
    en: "A substitute must have the same ingredient and strength.",
    fr: "Le substitut doit avoir le même principe actif et le même dosage.",
    rw: "Umuti usimbura ugomba kugira umuti n'urugero bimwe.",
  },
  noSubstitution: {
    en: "The prescriber did not allow substitution for this item.",
    fr: "Le prescripteur n'a pas autorisé la substitution pour cette ligne.",
    rw: "Uwanditse resept ntiyemeye gusimbuza uyu muti.",
  },
  controlled: {
    en: "Confirm the controlled medicine check before signing.",
    fr: "Confirmez le contrôle du médicament réglementé avant de signer.",
    rw: "Emeza igenzura ry'umuti ugenzurwa mbere yo gusinya.",
  },
  quantity: {
    en: "That is more than what is left to give.",
    fr: "C'est plus que ce qui reste à délivrer.",
    rw: "Ibyo birenze ibisigaye gutangwa.",
  },
  code: {
    en: "The code does not match this prescription.",
    fr: "Le code ne correspond pas à cette ordonnance.",
    rw: "Kode ntihuye n'iyi resept.",
  },
  openQuery: {
    en: "There is already an open query on this prescription.",
    fr: "Une question est déjà ouverte sur cette ordonnance.",
    rw: "Hari ikibazo kigifunguye kuri iyi resept.",
  },
  notAnswered: {
    en: "The doctor has not answered this question yet.",
    fr: "Le médecin n'a pas encore répondu à cette question.",
    rw: "Muganga ntarasubiza iki kibazo.",
  },
  notDispensable: {
    en: "This prescription can't be dispensed now.",
    fr: "Cette ordonnance ne peut pas être délivrée maintenant.",
    rw: "Iyi resept ntishobora gutangwa ubu.",
  },
  notOpen: {
    en: "This item can no longer be given.",
    fr: "Cette ligne ne peut plus être délivrée.",
    rw: "Uyu muti ntugishobora gutangwa.",
  },
} as const;

interface MockRx extends Prescription {
  facility_name: string;
  patient_id: string | null;
  patient_age: number | null;
  ticket_number: string | null;
}

const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

function item(
  code: string,
  dose: string,
  frequency: FrequencyCode,
  days: number | null,
  extra: Partial<PrescriptionItem> = {},
): PrescriptionItem {
  const d = drug(code)!;
  return {
    id: id(),
    drug_code: code,
    drug_display: d.display,
    generic_name: d.generic_name,
    strength: d.strength,
    is_off_catalogue: false,
    is_controlled: d.is_controlled,
    available_here: true,
    dose,
    frequency_code: frequency,
    route: d.route,
    duration_days: days,
    quantity: defaultQuantity(dose, frequency, days) ?? 1,
    dispensed_quantity: 0,
    instructions: "",
    substitution_allowed: true,
    status: "issued",
    alert_overrides: [],
    replaces_item_id: null,
    cancelled_reason: "",
    ...extra,
  };
}

function rx(
  rid: string,
  n: number,
  patient: string,
  extra: Partial<MockRx> & Pick<MockRx, "items">,
): MockRx {
  return {
    id: rid,
    consultation_id: id(),
    visit_id: id(),
    facility_patient_id: id(),
    patient_display_name: patient,
    prescriber_name: "Uwimana Keza",
    status: "ready_to_dispense",
    number: `RX-2026-${String(n).padStart(6, "0")}`,
    issued_at: daysFromNow(-0.1),
    expires_at: daysFromNow(29.9),
    cancelled_reason: "",
    version: 1,
    alerts: [],
    dispense_records: [],
    queries: [],
    facility_name: "Kigali Clinic",
    patient_id: null,
    patient_age: 40,
    ticket_number: null,
    ...extra,
  };
}

function seed(): { prescriptions: MockRx[]; unavailable: Map<string, string> } {
  const partly = item("AMOX500", "1 capsule", "tds", 7, {
    status: "partly_dispensed",
    dispensed_quantity: 10,
  });
  const pastItem = item("PARA500", "1 tablet", "tds", 3, {
    status: "dispensed",
    dispensed_quantity: 9,
    instructions: "After food",
  });
  return {
    unavailable: new Map([["ARTE20", daysFromNow(-1)]]),
    prescriptions: [
      rx(MOCK_RX_READY, 101, "Mukamana Jeanne", {
        facility_patient_id: MOCK_CLINICAL_FP,
        patient_id: SELF_PATIENT_ID,
        patient_age: 34,
        ticket_number: "G-012",
        items: [
          item("PARA500", "2 tablets", "tds", 5, { instructions: "After food" }),
          item("AMLO5", "1 tablet", "od", 30, { instructions: "In the morning" }),
        ],
      }),
      rx(MOCK_RX_PARTLY, 102, "Habimana Eric", {
        status: "partly_dispensed",
        issued_at: daysFromNow(-1),
        expires_at: daysFromNow(29),
        patient_age: 29,
        items: [partly],
        dispense_records: [
          {
            id: id(),
            pharmacist_name: "Nshimiyimana Patrick",
            identity_check_method: "ticket_name_dob",
            controlled_confirmed: false,
            signed_at: daysFromNow(-0.9),
            lines: [
              {
                id: id(),
                item_id: partly.id,
                outcome: "partial",
                quantity: 10,
                substitute_display: "",
                substitution_reason: "",
              },
            ],
          },
        ],
      }),
      rx(MOCK_RX_CONTROLLED, 103, "Niyonsaba Claudine", {
        patient_age: 61,
        ticket_number: "G-015",
        items: [
          item("MORPH10", "1 tablet", "qds", 3, { substitution_allowed: false }),
          item("ARTE20", "4 tablets", "bd", 3, { available_here: false }),
        ],
      }),
      // PQ3 for the doctor: Mukamana's signed pressure consultation (clinical mock)
      rx(MOCK_RX_PRESSURE, 106, "Mukamana Jeanne", {
        consultation_id: MOCK_PRESSURE_CONSULTATION,
        status: "partly_dispensed",
        issued_at: daysFromNow(-20),
        expires_at: daysFromNow(10),
        items: [
          item("AMLO5", "1 tablet", "od", 30, {
            status: "partly_dispensed",
            dispensed_quantity: 10,
          }),
        ],
        queries: [
          {
            id: MOCK_QUERY_PRESSURE,
            status: "open",
            message: "Only 5 mg left in stock. Continue 5 mg or change to 10 mg?",
            raised_by_name: "Nshimiyimana Patrick",
            raised_at: daysFromNow(-0.2),
            answered_by_addendum_id: null,
            answered_at: null,
            closed_at: null,
          },
        ],
      }),
      rx(MOCK_RX_QUERIED, 104, "Uwase Aline", {
        patient_age: 52,
        items: [item("IBU400", "1 tablet", "tds", 7)],
        queries: [
          {
            id: id(),
            status: "open",
            message: "She takes warfarin. Is ibuprofen intended?",
            raised_by_name: "Nshimiyimana Patrick",
            raised_at: daysFromNow(-0.05),
            answered_by_addendum_id: null,
            answered_at: null,
            closed_at: null,
          },
        ],
      }),
      rx(MOCK_RX_PAST, 99, "Mukamana Jeanne", {
        status: "dispensed",
        issued_at: daysFromNow(-20),
        expires_at: daysFromNow(10),
        patient_id: SELF_PATIENT_ID,
        patient_age: 34,
        items: [pastItem],
      }),
    ],
  };
}

const ITEM_ORDER: Record<PrescriptionItem["status"], number> = {
  draft: 0,
  issued: 0,
  partly_dispensed: 0,
  not_available: 0,
  dispensed: 1,
  cancelled: 2,
  expired: 2,
};

/** The prescription status from its items (contract §2.2). */
function summarise(r: MockRx): PrescriptionStatus {
  if (r.status === "draft" || r.status === "cancelled" || r.status === "awaiting_payment")
    return r.status;
  const live = r.items.filter((i) => i.status !== "cancelled");
  if (!live.length) return "cancelled";
  const open = live.filter((i) => OPEN_ITEM_STATUSES.includes(i.status));
  if (!open.length) return live.every((i) => i.status === "expired") ? "expired" : "dispensed";
  if (open.every((i) => i.status === "not_available")) return "not_available";
  if (live.some((i) => i.dispensed_quantity > 0)) return "partly_dispensed";
  return "ready_to_dispense";
}

export const pharmacyMocks: FeatureMockFactory = (context) => {
  const { api } = context;
  let db = seed();
  const S = `${api}/staff`;
  const msg = (key: keyof typeof MESSAGES, lang: LanguageCode) => MESSAGES[key][lang];
  const staff = (request: Request, codes: string[]) => {
    const lang = context.languageFrom(request);
    const result = context.authenticatedStaff(lang);
    if ("error" in result) return { error: result.error };
    const granted = result.me.permissions as readonly string[];
    if (!result.me.active_facility_id || !codes.some((c) => granted.includes(c)))
      return {
        error: context.errorResponse(403, "permission_denied", s1("permissionDenied", lang)),
      };
    return { lang, me: result.me, granted };
  };
  const notFound = (lang: LanguageCode) =>
    context.errorResponse(404, "not_found", context.message("notFound", lang));
  const rule = (lang: LanguageCode, key: keyof typeof MESSAGES, code = "business_rule_violation") =>
    context.errorResponse(422, code, msg(key, lang));
  const stale = (lang: LanguageCode) => context.errorResponse(409, "conflict", msg("stale", lang));
  const available = (code: string) => !db.unavailable.has(code);

  const alertsOf = (r: MockRx): PrescriptionAlert[] => {
    const alerts: PrescriptionAlert[] = [];
    const open = r.items.filter((i) => i.status !== "cancelled" && !i.is_off_catalogue);
    for (const i of open) {
      const d = drug(i.drug_code);
      if (!d) continue;
      const base = {
        item_id: i.id,
        drug_code: i.drug_code,
        allergy_id: null,
        substance: null,
        verification_status: null,
        max_usual_quantity: null,
      };
      const overridden = (kind: AlertOverride["kind"]) =>
        i.alert_overrides.some((o) => o.kind === kind && o.reason.trim().length >= 5);
      if (r.facility_patient_id === MOCK_CLINICAL_FP && d.klass === "penicillin")
        alerts.push({
          ...base,
          kind: "allergy",
          severity: "high",
          allergy_id: "a1000000-0000-4000-8000-000000000001",
          substance: "Penicillin",
          verification_status: "verified",
          overridden: overridden("allergy"),
        });
      if (open.some((o) => o.id !== i.id && drug(o.drug_code)?.generic_name === d.generic_name))
        alerts.push({
          ...base,
          kind: "duplicate",
          severity: "medium",
          overridden: overridden("duplicate"),
        });
      if (d.max !== null && i.quantity > d.max)
        alerts.push({
          ...base,
          kind: "dose",
          severity: "medium",
          max_usual_quantity: d.max,
          overridden: overridden("dose"),
        });
    }
    return alerts;
  };
  const view = (r: MockRx): Prescription => {
    const { facility_name: _f, patient_id: _p, patient_age: _a, ticket_number: _t, ...out } = r;
    return {
      ...out,
      items: [...r.items]
        .map((i) => ({ ...i, available_here: i.is_off_catalogue || available(i.drug_code) }))
        .sort((a, b) => ITEM_ORDER[a.status] - ITEM_ORDER[b.status]),
      alerts: alertsOf(r),
    };
  };
  const touch = (r: MockRx) => {
    r.status = summarise(r);
    r.version += 1;
    return HttpResponse.json(view(r));
  };
  const findItem = (itemId: unknown) => {
    for (const r of db.prescriptions) {
      const found = r.items.find((i) => i.id === itemId);
      if (found) return { r, i: found };
    }
    return null;
  };
  const writeItem = (
    body: Partial<PrescriptionItemInput>,
    lang: LanguageCode,
  ): { fields: Partial<PrescriptionItem> } | { error: Response } => {
    const errors: Record<string, string[]> = {};
    const code = typeof body.drug_code === "string" ? body.drug_code : "";
    const free = typeof body.free_text_drug === "string" ? body.free_text_drug.trim() : "";
    const d = code ? drug(code) : undefined;
    if (!code && !free) errors.drug_code = ["Choose a medicine or type its name."];
    if (code && !d) errors.drug_code = ["Unknown medicine."];
    if (!body.dose?.trim()) errors.dose = ["Give the dose."];
    if (!body.frequency_code) errors.frequency_code = ["Choose how often."];
    if (!body.route) errors.route = ["Choose the route."];
    const days = typeof body.duration_days === "number" ? body.duration_days : null;
    const quantity =
      typeof body.quantity === "number" && body.quantity > 0
        ? body.quantity
        : defaultQuantity(body.dose ?? "", body.frequency_code ?? "once", days);
    if (!quantity && !errors.dose) errors.quantity = ["Give the quantity to dispense."];
    if (Object.keys(errors).length) return { error: context.validationError(lang, errors) };
    return {
      fields: {
        drug_code: d?.code ?? "",
        drug_display: d?.display ?? free,
        generic_name: d?.generic_name ?? "",
        strength: d?.strength ?? "",
        is_off_catalogue: !d,
        is_controlled: d?.is_controlled ?? false,
        dose: body.dose!.trim(),
        frequency_code: body.frequency_code!,
        route: body.route!,
        duration_days: days,
        quantity: quantity!,
        instructions: body.instructions?.trim() ?? "",
        substitution_allowed: body.substitution_allowed ?? true,
        alert_overrides: (body.alert_overrides ?? []).filter((o) => o.reason?.trim()),
      },
    };
  };

  // Contract D-1: signing the consultation issues its prescription, or refuses (allergy override)
  setConsultationSignHook((c: Consultation, lang: LanguageCode) => {
    const r = db.prescriptions.find((p) => p.consultation_id === c.id);
    if (!r) return null;
    if (!r.items.length) {
      db.prescriptions = db.prescriptions.filter((p) => p !== r);
      return null;
    }
    if (alertsOf(r).some((a) => a.kind === "allergy" && !a.overridden))
      return rule(lang, "override", "alert_override_required");
    const count = db.prescriptions.filter((p) => p.number).length;
    r.number = `RX-2026-${String(200 + count).padStart(6, "0")}`;
    r.issued_at = now();
    r.expires_at = daysFromNow(30);
    r.items = r.items.map((i) => ({ ...i, status: "issued" }));
    r.status = "ready_to_dispense";
    r.version += 1;
    return null;
  });

  return {
    reset() {
      db = seed();
    },
    handlers: [
      // ---- P1–P7: prescribing in the consultation
      http.get(`${S}/consultations/:id/prescription/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["clinical.view"]);
        if ("error" in ok) return ok.error;
        const r = db.prescriptions.find((p) => p.consultation_id === params.id);
        return r ? HttpResponse.json(view(r)) : notFound(ok.lang);
      }),

      http.post(`${S}/consultations/:id/prescription/items/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["prescription.issue"]);
        if ("error" in ok) return ok.error;
        const body = ((await context.readJson(request)) ?? {}) as Partial<PrescriptionItemInput> & {
          replaces_item_id?: string | null;
        };
        let r = db.prescriptions.find((p) => p.consultation_id === params.id);
        if (r && r.status !== "draft") {
          const step = stepUpFailure(context, ok.lang);
          if (step) return step;
        }
        const written = writeItem(body, ok.lang);
        if ("error" in written) return written.error;
        if (!r) {
          r = rx(id(), 0, "Mukamana Jeanne", {
            consultation_id: String(params.id),
            facility_patient_id: MOCK_CLINICAL_FP,
            prescriber_name: ok.me.full_name,
            status: "draft",
            number: null,
            issued_at: null,
            expires_at: null,
            items: [],
          });
          db.prescriptions.push(r);
        }
        r.items.push({
          ...item("PARA500", "1", "once", null),
          ...written.fields,
          status: r.status === "draft" ? "draft" : "issued",
          replaces_item_id: body.replaces_item_id ?? null,
        });
        if (r.status !== "draft") r.status = summarise(r);
        r.version += 1;
        return HttpResponse.json(view(r), { status: 201 });
      }),

      http.patch(`${S}/prescription-items/:itemId/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["prescription.issue"]);
        if ("error" in ok) return ok.error;
        const found = findItem(params.itemId);
        if (!found) return notFound(ok.lang);
        const body = ((await context.readJson(request)) ?? {}) as Partial<PrescriptionItemInput> & {
          version?: number;
        };
        if (body.version !== found.r.version) return stale(ok.lang);
        if (found.r.status !== "draft") return rule(ok.lang, "locked", "locked");
        const written = writeItem(body, ok.lang);
        if ("error" in written) return written.error;
        Object.assign(found.i, written.fields);
        found.r.version += 1;
        return HttpResponse.json(view(found.r));
      }),

      http.delete(`${S}/prescription-items/:itemId/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["prescription.issue"]);
        if ("error" in ok) return ok.error;
        const found = findItem(params.itemId);
        if (!found) return notFound(ok.lang);
        const version = Number(new URL(request.url).searchParams.get("version"));
        if (version !== found.r.version) return stale(ok.lang);
        if (found.r.status !== "draft") return rule(ok.lang, "locked", "locked");
        found.r.items = found.r.items.filter((i) => i !== found.i);
        found.r.version += 1;
        return HttpResponse.json(view(found.r));
      }),

      http.post(`${S}/prescription-items/:itemId/cancel/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["prescription.issue"]);
        if ("error" in ok) return ok.error;
        const found = findItem(params.itemId);
        if (!found) return notFound(ok.lang);
        const body = ((await context.readJson(request)) ?? {}) as {
          version?: number;
          reason?: string;
        };
        if (body.version !== found.r.version) return stale(ok.lang);
        if ((body.reason ?? "").trim().length < 5)
          return context.validationError(ok.lang, {
            reason: ["Give a reason (5 characters or more)."],
          });
        if (found.i.dispensed_quantity > 0) return rule(ok.lang, "dispensed");
        found.i.status = "cancelled";
        found.i.cancelled_reason = body.reason!.trim();
        return touch(found.r);
      }),

      http.get(`${S}/prescriptions/:id/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["prescription.view", "clinical.view"]);
        if ("error" in ok) return ok.error;
        const r = db.prescriptions.find((p) => p.id === params.id && p.status !== "draft");
        return r ? HttpResponse.json(view(r)) : notFound(ok.lang);
      }),

      http.post(`${S}/prescriptions/:id/cancel/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["prescription.issue"]);
        if ("error" in ok) return ok.error;
        const r = db.prescriptions.find((p) => p.id === params.id);
        if (!r) return notFound(ok.lang);
        const body = ((await context.readJson(request)) ?? {}) as {
          version?: number;
          reason?: string;
        };
        if (body.version !== r.version) return stale(ok.lang);
        if ((body.reason ?? "").trim().length < 5)
          return context.validationError(ok.lang, {
            reason: ["Give a reason (5 characters or more)."],
          });
        if (r.items.some((i) => i.dispensed_quantity > 0)) return rule(ok.lang, "dispensed");
        r.status = "cancelled";
        r.cancelled_reason = (body.reason ?? "").trim();
        r.version += 1;
        return HttpResponse.json(view(r));
      }),

      // ---- upgrade 05 §4: Pharmacist Today and the dispensing history
      http.get(`${S}/pharmacy/my-day/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["pharmacy.dispense"]);
        if ("error" in ok) return ok.error;
        const today = now().slice(0, 10);
        const records = db.prescriptions.flatMap((r) =>
          r.dispense_records.filter((d) => d.signed_at.slice(0, 10) === today),
        );
        const lines = records.flatMap((d) => d.lines);
        const queries = db.prescriptions.flatMap((r) => r.queries);
        const body: PharmacyDay = {
          date: today,
          ready: db.prescriptions.filter((r) => r.status === "ready_to_dispense").length,
          partly: db.prescriptions.filter((r) => r.status === "partly_dispensed").length,
          questions_open: queries.filter((q) => q.status === "open").length,
          questions_answered: queries.filter((q) => q.status === "answered").length,
          dispensed_today: records.length,
          dispensed_by_me: records.filter((d) => d.pharmacist_name === ok.me.full_name).length,
          not_available_today: lines.filter((l) => l.outcome === "not_available").length,
          substituted_today: lines.filter((l) => l.outcome === "substituted").length,
          out_of_stock: db.unavailable.size,
          updated_at: now(),
        };
        return HttpResponse.json(body);
      }),
      http.get(`${S}/pharmacy/history/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["pharmacy.dispense"]);
        if ("error" in ok) return ok.error;
        const url = new URL(request.url);
        const days = Number(url.searchParams.get("days") ?? 7) || 7;
        const mine = url.searchParams.get("mine") === "true";
        const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
        const since = Date.now() - days * 86_400_000;
        const rows: DispenseHistoryRow[] = db.prescriptions
          .flatMap((r) =>
            r.dispense_records.map((d) => ({
              id: d.id,
              prescription_id: r.id,
              prescription_number: r.number ?? "",
              patient_display_name: r.patient_display_name,
              pharmacist_name: d.pharmacist_name,
              signed_at: d.signed_at,
              identity_check_method: d.identity_check_method,
              controlled_confirmed: d.controlled_confirmed,
              lines: d.lines.map((l) => ({
                drug:
                  l.substitute_display ||
                  r.items.find((i) => i.id === l.item_id)?.drug_display ||
                  "",
                outcome: l.outcome,
                quantity: l.quantity,
              })),
              status: r.status,
            })),
          )
          .filter((row) => Date.parse(row.signed_at) >= since)
          .filter((row) => !mine || row.pharmacist_name === ok.me.full_name)
          .filter(
            (row) =>
              !q ||
              row.prescription_number.toLowerCase().includes(q) ||
              row.patient_display_name.toLowerCase().includes(q),
          )
          .sort((a, b) => b.signed_at.localeCompare(a.signed_at));
        return HttpResponse.json(rows);
      }),

      // ---- PQ1, PD1, PD2: the pharmacy
      http.get(`${S}/pharmacy/queue/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["pharmacy.dispense"]);
        if ("error" in ok) return ok.error;
        const url = new URL(request.url);
        const tab = url.searchParams.get("status") ?? "ready";
        const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
        const rows: PharmacyQueueRow[] = db.prescriptions
          .filter((r) => {
            // backend queue_rows: "queried" = an open query; the others filter by status only
            if (tab === "queried") return r.queries.some((x) => x.status === "open");
            return tab === "partly"
              ? r.status === "partly_dispensed"
              : r.status === "ready_to_dispense";
          })
          .filter(
            (r) =>
              !q ||
              [r.patient_display_name, r.number ?? ""].some((v) => v.toLowerCase().includes(q)) ||
              r.ticket_number?.toLowerCase() === q,
          )
          .sort((a, b) => (a.issued_at ?? "").localeCompare(b.issued_at ?? ""))
          .map((r) => ({
            id: r.id,
            number: r.number ?? "",
            status: r.status,
            patient_display_name: r.patient_display_name,
            patient_age: r.patient_age,
            ticket_number: r.ticket_number,
            issued_at: r.issued_at ?? now(),
            expires_at: r.expires_at ?? now(),
            item_count: r.items.filter((i) => i.status !== "cancelled").length,
            has_controlled: r.items.some((i) => i.is_controlled),
            has_open_query: r.queries.some((x) => x.status === "open"),
            has_unavailable: r.items.some((i) => !i.is_off_catalogue && !available(i.drug_code)),
            version: r.version,
          }));
        return HttpResponse.json(page(rows, url));
      }),

      http.post(`${S}/prescriptions/:id/dispense/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["pharmacy.dispense"]);
        if ("error" in ok) return ok.error;
        const r = db.prescriptions.find((p) => p.id === params.id);
        if (!r) return notFound(ok.lang);
        const body = ((await context.readJson(request)) ?? {}) as {
          version?: number;
          identity_check_method?: string;
          verification_code?: string;
          controlled_confirmed?: boolean;
          lines?: DispenseLineInput[];
        };
        if (body.version !== r.version) return stale(ok.lang);
        // backend dispense(): only ready or partly, and never after expires_at
        if (
          !["ready_to_dispense", "partly_dispensed"].includes(r.status) ||
          (r.expires_at !== null && new Date(r.expires_at).getTime() <= Date.now())
        )
          return rule(ok.lang, "notDispensable");
        if (!body.identity_check_method)
          return context.validationError(ok.lang, {
            identity_check_method: ["Confirm who the patient is."],
          });
        if (
          body.identity_check_method === "verification_code" &&
          body.verification_code?.trim().toUpperCase() !== r.number
        )
          return context.validationError(ok.lang, { verification_code: [msg("code", ok.lang)] });
        const lines = body.lines ?? [];
        if (!lines.length)
          return context.validationError(ok.lang, { lines: ["Choose what you give."] });
        const planned: {
          i: PrescriptionItem;
          line: DispenseLineInput;
          qty: number;
          sub: string;
        }[] = [];
        for (const line of lines) {
          const i = r.items.find((x) => x.id === line.item_id);
          if (!i || !OPEN_ITEM_STATUSES.includes(i.status)) return rule(ok.lang, "notOpen");
          const remaining = i.quantity - i.dispensed_quantity;
          let qty = 0;
          let sub = "";
          if (line.outcome === "full") qty = remaining;
          else if (line.outcome === "partial") {
            qty = line.quantity ?? 0;
            // backend: a "partial" of everything left is recorded as full
            if (qty < 1 || qty > remaining) return rule(ok.lang, "quantity");
          } else if (line.outcome === "substituted") {
            if (!i.substitution_allowed) return rule(ok.lang, "noSubstitution");
            const original = drug(i.drug_code);
            const substitute = drug(line.substitute_drug_code ?? "");
            if (
              !original ||
              !substitute ||
              substitute.code === original.code ||
              substitute.generic_name !== original.generic_name ||
              substitute.strength !== original.strength
            )
              return rule(ok.lang, "substitute");
            if ((line.substitution_reason ?? "").trim().length < 5)
              return context.validationError(ok.lang, {
                substitution_reason: ["Give a reason (5 characters or more)."],
              });
            qty = line.quantity ?? remaining;
            if (qty < 1 || qty > remaining) return rule(ok.lang, "quantity");
            sub = substitute.display;
          }
          planned.push({ i, line, qty, sub });
        }
        if (planned.some((p) => p.i.is_controlled && p.qty > 0) && !body.controlled_confirmed)
          return rule(ok.lang, "controlled");
        r.dispense_records.push({
          id: id(),
          pharmacist_name: ok.me.full_name,
          identity_check_method: body.identity_check_method as "ticket_name_dob",
          controlled_confirmed: Boolean(body.controlled_confirmed),
          signed_at: now(),
          lines: planned.map(({ i, line, qty, sub }) => ({
            id: id(),
            item_id: i.id,
            outcome: line.outcome,
            quantity: qty,
            substitute_display: sub,
            substitution_reason: line.outcome === "substituted" ? line.substitution_reason! : "",
          })),
        });
        for (const { i, line, qty } of planned) {
          if (line.outcome === "not_available") {
            i.status = "not_available";
            continue;
          }
          i.dispensed_quantity += qty;
          i.status = i.dispensed_quantity >= i.quantity ? "dispensed" : "partly_dispensed";
        }
        r.status = summarise(r);
        r.version += 1;
        return HttpResponse.json(view(r), { status: 201 });
      }),

      http.get(`${S}/prescriptions/:id/labels/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["pharmacy.dispense"]);
        if ("error" in ok) return ok.error;
        const r = db.prescriptions.find((p) => p.id === params.id);
        if (!r) return notFound(ok.lang);
        const language = (new URL(request.url).searchParams.get("language") ??
          "rw") as LanguageCode;
        const words = FREQUENCY_WORDS[language];
        const labels: DosingLabel[] = r.dispense_records.flatMap((record) =>
          record.lines
            .filter((l) => l.outcome !== "not_available" && l.quantity > 0)
            .map((l) => {
              const i = r.items.find((x) => x.id === l.item_id)!;
              return {
                line_id: l.id,
                language,
                drug: l.substitute_display || i.drug_display,
                quantity: l.quantity,
                dose: i.dose,
                frequency: words[i.frequency_code],
                route: ROUTE_WORDS[language][i.route] ?? i.route,
                duration: i.duration_days ? DAYS[language](i.duration_days) : "",
                instructions: i.instructions,
                patient_name: r.patient_display_name,
                dispensed_on: record.signed_at.slice(0, 10),
                facility_name: r.facility_name,
                prescription_number: r.number ?? "",
              };
            }),
        );
        return HttpResponse.json({ labels });
      }),

      // ---- PQ2–PQ4: queries
      http.post(`${S}/prescriptions/:id/queries/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["pharmacy.dispense"]);
        if ("error" in ok) return ok.error;
        const r = db.prescriptions.find((p) => p.id === params.id);
        if (!r) return notFound(ok.lang);
        const body = ((await context.readJson(request)) ?? {}) as { message?: string };
        const message = (body.message ?? "").trim();
        if (!message || message.length > 1000)
          return context.validationError(ok.lang, {
            message: ["Write the question (1,000 characters at most)."],
          });
        if (r.queries.some((x) => x.status === "open"))
          return context.errorResponse(409, "conflict", msg("openQuery", ok.lang));
        const created = {
          id: id(),
          status: "open" as const,
          message,
          raised_by_name: ok.me.full_name,
          raised_at: now(),
          answered_by_addendum_id: null,
          answered_at: null,
          closed_at: null,
        };
        r.queries.push(created);
        r.version += 1;
        return HttpResponse.json(created, { status: 201 });
      }),

      http.post(`${S}/prescription-queries/:queryId/answer/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["prescription.issue"]);
        if ("error" in ok) return ok.error;
        const body = ((await context.readJson(request)) ?? {}) as { addendum_id?: string };
        if (!body.addendum_id)
          return context.validationError(ok.lang, { addendum_id: ["Choose the addendum."] });
        for (const r of db.prescriptions) {
          const found = r.queries.find((x) => x.id === params.queryId);
          if (!found) continue;
          if (found.status !== "open") return rule(ok.lang, "notOpen");
          found.status = "answered";
          found.answered_by_addendum_id = body.addendum_id;
          found.answered_at = now();
          r.version += 1;
          return HttpResponse.json(found);
        }
        return notFound(ok.lang);
      }),

      http.post(`${S}/prescription-queries/:queryId/close/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["pharmacy.dispense"]);
        if ("error" in ok) return ok.error;
        for (const r of db.prescriptions) {
          const found = r.queries.find((x) => x.id === params.queryId);
          if (!found) continue;
          if (found.status !== "answered") return rule(ok.lang, "notAnswered");
          found.status = "closed";
          found.closed_at = now();
          r.version += 1;
          return HttpResponse.json(found);
        }
        return notFound(ok.lang);
      }),

      // ---- PA1, PA2, PS1: availability and drug search
      http.get(`${S}/pharmacy/availability/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["pharmacy.dispense", "pharmacy.availability"]);
        if ("error" in ok) return ok.error;
        const url = new URL(request.url);
        const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
        const only = url.searchParams.get("available");
        const rows: AvailabilityRow[] = DRUGS.filter(
          (d) => !q || d.display.toLowerCase().includes(q) || d.generic_name.includes(q),
        )
          .map((d) => ({
            drug_code: d.code,
            display: d.display,
            is_available: available(d.code),
            updated_at: db.unavailable.get(d.code) ?? null,
          }))
          .filter((row) => only === null || String(row.is_available) === only);
        return HttpResponse.json(page(rows, url));
      }),

      http.put(`${S}/pharmacy/availability/:code/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["pharmacy.availability"]);
        if ("error" in ok) return ok.error;
        const d = drug(String(params.code));
        if (!d) return notFound(ok.lang);
        const body = ((await context.readJson(request)) ?? {}) as { is_available?: boolean };
        if (body.is_available) db.unavailable.delete(d.code);
        else db.unavailable.set(d.code, now());
        return HttpResponse.json({
          drug_code: d.code,
          display: d.display,
          is_available: available(d.code),
          updated_at: now(),
        });
      }),

      http.get(`${S}/drugs/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["prescription.issue", "pharmacy.dispense"]);
        if ("error" in ok) return ok.error;
        const q = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase();
        if (q.length < 2)
          return context.validationError(ok.lang, { q: ["Type 2 characters or more."] });
        const rows: DrugRow[] = DRUGS.filter(
          (d) => d.generic_name.includes(q) || d.display.toLowerCase().includes(q),
        )
          .slice(0, 25)
          .map(({ klass: _k, max: _m, route: _r, ...d }) => ({
            ...d,
            available_here: available(d.code),
          }));
        return HttpResponse.json(rows);
      }),

      // ---- M1, M2: My medicines
      http.get(`${api}/patient/prescriptions/`, async ({ request }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const auth = context.authenticatedPatient(lang);
        if ("error" in auth) return auth.error;
        const profiles = new Set(auth.me.profiles.map((p) => p.patient_id));
        const url = new URL(request.url);
        const wanted = url.searchParams.get("patient_id");
        const status = url.searchParams.get("status");
        const rows = db.prescriptions
          .filter((r) => r.patient_id && r.number && profiles.has(r.patient_id))
          .filter((r) => !wanted || r.patient_id === wanted)
          .filter((r) => {
            const active = [
              "ready_to_dispense",
              "partly_dispensed",
              "awaiting_payment",
              "not_available",
              "issued",
            ].includes(r.status);
            return !status || (status === "active" ? active : !active);
          })
          .sort((a, b) => (b.issued_at ?? "").localeCompare(a.issued_at ?? ""))
          .map((r) => patientRow(r));
        return HttpResponse.json(page(rows, url));
      }),

      http.get(`${api}/patient/prescriptions/:id/`, async ({ request, params }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const auth = context.authenticatedPatient(lang);
        if ("error" in auth) return auth.error;
        const profiles = new Set(auth.me.profiles.map((p) => p.patient_id));
        const r = db.prescriptions.find(
          (p) => p.id === params.id && p.patient_id && profiles.has(p.patient_id),
        );
        if (!r) return notFound(lang);
        const subs = new Map(
          r.dispense_records
            .flatMap((d) => d.lines)
            .filter((l) => l.substitute_display)
            .map((l) => [l.item_id, l.substitute_display]),
        );
        const detail: PatientPrescription = {
          ...patientRow(r),
          items: r.items
            .filter((i) => i.status !== "draft")
            .map((i) => ({
              id: i.id,
              drug_display: i.drug_display,
              dose: i.dose,
              frequency_code: i.frequency_code,
              route: i.route,
              duration_days: i.duration_days,
              quantity: i.quantity,
              dispensed_quantity: i.dispensed_quantity,
              instructions: i.instructions,
              status: i.status,
              substitute_display: subs.get(i.id) ?? "",
            })),
        };
        return HttpResponse.json(detail);
      }),
    ],
  };
};

function patientRow(r: MockRx) {
  return {
    id: r.id,
    patient_id: r.patient_id!,
    number: r.number ?? "",
    facility_name: r.facility_name,
    prescriber_name: r.prescriber_name,
    status: r.status,
    issued_at: r.issued_at ?? now(),
    expires_at: r.expires_at ?? now(),
    item_count: r.items.filter((i) => i.status !== "cancelled").length,
  };
}

const FREQUENCY_WORDS: Record<LanguageCode, Record<FrequencyCode, string>> = {
  en: {
    once: "Once",
    od: "Once a day",
    bd: "Twice a day",
    tds: "Three times a day",
    qds: "Four times a day",
    nocte: "At night",
    prn: "When needed",
  },
  fr: {
    once: "Une fois",
    od: "Une fois par jour",
    bd: "Deux fois par jour",
    tds: "Trois fois par jour",
    qds: "Quatre fois par jour",
    nocte: "Le soir",
    prn: "Si besoin",
  },
  rw: {
    once: "Rimwe",
    od: "Rimwe ku munsi",
    bd: "Kabiri ku munsi",
    tds: "Gatatu ku munsi",
    qds: "Kane ku munsi",
    nocte: "Nijoro",
    prn: "Igihe bikenewe",
  },
};
const ROUTE_WORDS: Record<LanguageCode, Partial<Record<DrugRoute, string>>> = {
  en: { oral: "By mouth" },
  fr: { oral: "Par la bouche" },
  rw: { oral: "Kunywa" },
};
const DAYS: Record<LanguageCode, (n: number) => string> = {
  en: (n) => `For ${n} days`,
  fr: (n) => `Pendant ${n} jours`,
  rw: (n) => `Iminsi ${n}`,
};
