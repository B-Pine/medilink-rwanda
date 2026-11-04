/**
 * S7a pharmacy (contract sprint-07 §3.1, §3.2): prescribing inside the consultation, the pharmacy
 * queue, dispensing, queries, availability and dosing labels for staff; My medicines for patients.
 *
 * Pharmacist responses carry no consultation text (§4). Patient types carry no prescriber notes and
 * no alert overrides (§2.2 Patient read).
 */
import type { ApiClient } from "../client";
import type { LanguageCode, Uuid } from "../types";
import type { ClinicalAlertKind } from "./clinical";

declare module "../types" {
  interface PermissionCodes {
    "pharmacy.availability": true;
    "pharmacy.stock": true;
  }
}

export type FrequencyCode = "once" | "od" | "bd" | "tds" | "qds" | "nocte" | "prn";
export const FREQUENCY_CODES: readonly FrequencyCode[] = [
  "od",
  "bd",
  "tds",
  "qds",
  "nocte",
  "prn",
  "once",
];
/** Doses a day for the default quantity (backend `PER_DAY`). */
export const PER_DAY: Partial<Record<FrequencyCode, number>> = {
  od: 1,
  bd: 2,
  tds: 3,
  qds: 4,
  nocte: 1,
};

export type DrugRoute =
  "oral" | "topical" | "inhaled" | "rectal" | "vaginal" | "eye" | "ear" | "nasal" | "injection";
export const DRUG_ROUTES: readonly DrugRoute[] = [
  "oral",
  "topical",
  "inhaled",
  "eye",
  "ear",
  "nasal",
  "rectal",
  "vaginal",
  "injection",
];

export type PrescriptionStatus =
  | "draft"
  | "issued"
  | "awaiting_payment"
  | "ready_to_dispense"
  | "partly_dispensed"
  | "dispensed"
  | "not_available"
  | "cancelled"
  | "expired";
export type PrescriptionItemStatus =
  "draft" | "issued" | "partly_dispensed" | "dispensed" | "not_available" | "cancelled" | "expired";
export type DispenseOutcome = "full" | "partial" | "substituted" | "not_available";
export type IdentityCheckMethod = "ticket_name_dob" | "verification_code";
export type PrescriptionQueryStatus = "open" | "answered" | "closed";
export type PharmacyQueueTab = "ready" | "partly" | "queried";
/** W5: a medicine's stock here; `null` when it does not follow a stock count (manual flag). */
export type StockLevel = "in_stock" | "low" | "out";
export type StockMovementKind = "received" | "dispensed" | "adjusted";
export type StockAdjustReason = "count_correction" | "damaged" | "expired";
export const STOCK_ADJUST_REASONS: readonly StockAdjustReason[] = [
  "count_correction",
  "damaged",
  "expired",
];

/** Items that can still be dispensed or cancelled. */
export const OPEN_ITEM_STATUSES: readonly PrescriptionItemStatus[] = [
  "issued",
  "partly_dispensed",
  "not_available",
];

/** `default_quantity` of the backend: whole-number dose × times a day × days, else null. */
export function defaultQuantity(
  dose: string,
  frequency: FrequencyCode,
  durationDays: number | null,
): number | null {
  const perDay = PER_DAY[frequency];
  if (!perDay || !durationDays) return null;
  const head = dose.trim().split(" ", 1)[0] ?? "";
  if (!/^\d+$/.test(head)) return null;
  return Number(head) * perDay * durationDays;
}

export interface AlertOverride {
  kind: ClinicalAlertKind;
  reason: string;
}

export interface PrescriptionItem {
  id: Uuid;
  drug_code: string;
  drug_display: string;
  /** Catalogue generic name and strength, for the substitute search; blank off catalogue. */
  generic_name: string;
  strength: string;
  is_off_catalogue: boolean;
  is_controlled: boolean;
  available_here: boolean;
  stock_level: StockLevel | null;
  dose: string;
  frequency_code: FrequencyCode;
  route: DrugRoute;
  duration_days: number | null;
  quantity: number;
  dispensed_quantity: number;
  instructions: string;
  substitution_allowed: boolean;
  status: PrescriptionItemStatus;
  alert_overrides: AlertOverride[];
  replaces_item_id: Uuid | null;
  cancelled_reason: string;
}

export interface PrescriptionAlert {
  item_id: Uuid;
  drug_code: string;
  kind: ClinicalAlertKind;
  severity: "high" | "medium";
  allergy_id: Uuid | null;
  substance: string | null;
  verification_status: string | null;
  max_usual_quantity: number | null;
  overridden: boolean;
}

export interface DispenseLine {
  id: Uuid;
  item_id: Uuid;
  outcome: DispenseOutcome;
  quantity: number;
  substitute_display: string;
  substitution_reason: string;
}

export interface DispenseRecord {
  id: Uuid;
  pharmacist_name: string;
  identity_check_method: IdentityCheckMethod;
  controlled_confirmed: boolean;
  signed_at: string;
  lines: DispenseLine[];
}

/** Pharmacist Today (upgrade 05 §4): counts for the facility and for me. */
export interface PharmacyDay {
  date: string;
  ready: number;
  partly: number;
  questions_open: number;
  questions_answered: number;
  dispensed_today: number;
  dispensed_by_me: number;
  not_available_today: number;
  substituted_today: number;
  out_of_stock: number;
  /** W5: medicines below their low-stock threshold. */
  low_stock: number;
  /** W5: batches with units left expiring within 60 days (expired included). */
  expiring_soon: number;
  updated_at: string;
}

/** One dispensing in the history, with each line's outcome. */
export interface DispenseHistoryRow {
  id: Uuid;
  prescription_id: Uuid;
  prescription_number: string;
  patient_display_name: string;
  pharmacist_name: string;
  signed_at: string;
  identity_check_method: string;
  controlled_confirmed: boolean;
  lines: { drug: string; outcome: string; quantity: number }[];
  status: string;
}

export interface PrescriptionQuery {
  id: Uuid;
  status: PrescriptionQueryStatus;
  message: string;
  raised_by_name: string;
  raised_at: string;
  answered_by_addendum_id: Uuid | null;
  answered_at: string | null;
  closed_at: string | null;
}

export interface Prescription {
  id: Uuid;
  consultation_id: Uuid;
  visit_id: Uuid;
  facility_patient_id: Uuid;
  patient_display_name: string;
  prescriber_name: string;
  status: PrescriptionStatus;
  number: string | null;
  issued_at: string | null;
  expires_at: string | null;
  cancelled_reason: string;
  version: number;
  items: PrescriptionItem[];
  alerts: PrescriptionAlert[];
  dispense_records: DispenseRecord[];
  queries: PrescriptionQuery[];
}

export interface PrescriptionItemInput {
  drug_code?: string;
  free_text_drug?: string;
  dose: string;
  frequency_code: FrequencyCode;
  route: DrugRoute;
  duration_days?: number | null;
  quantity?: number | null;
  instructions?: string;
  substitution_allowed?: boolean;
  alert_overrides?: AlertOverride[];
}

export interface DispenseLineInput {
  item_id: Uuid;
  outcome: DispenseOutcome;
  quantity?: number;
  substitute_drug_code?: string;
  substitution_reason?: string;
}

export interface DispenseInput {
  version: number;
  identity_check_method: IdentityCheckMethod;
  verification_code?: string;
  controlled_confirmed?: boolean;
  lines: DispenseLineInput[];
}

export interface PharmacyQueueRow {
  id: Uuid;
  number: string;
  status: PrescriptionStatus;
  patient_display_name: string;
  patient_age: number | null;
  ticket_number: string | null;
  issued_at: string;
  expires_at: string;
  item_count: number;
  has_controlled: boolean;
  has_open_query: boolean;
  has_unavailable: boolean;
  version: number;
}

export interface DrugRow {
  code: string;
  display: string;
  generic_name: string;
  strength: string;
  form: string;
  is_controlled: boolean;
  available_here: boolean;
  stock_level: StockLevel | null;
}

export interface AvailabilityRow {
  drug_code: string;
  display: string;
  is_available: boolean;
  updated_at: string | null;
  /** W5: the medicine has stock here, so its availability follows the count (read-only). */
  follows_stock: boolean;
  stock_level: StockLevel | null;
}

/** W5 stock card: one medicine at this facility. */
export interface StockCard {
  drug_code: string;
  display: string;
  is_controlled: boolean;
  /** Units in batches that have not expired. */
  on_hand: number;
  /** Units in expired batches, still to remove. */
  expired_on_hand: number;
  low_stock_threshold: number;
  stock_level: StockLevel;
  next_expiry: string | null;
  updated_at: string;
}

export interface StockBatch {
  id: Uuid;
  drug_code: string;
  display: string;
  batch_number: string;
  expiry_date: string;
  quantity_on_hand: number;
  supplier: string;
  is_expired: boolean;
  received_at: string;
}

export interface StockMovement {
  id: Uuid;
  drug_code: string;
  display: string;
  batch_id: Uuid;
  batch_number: string;
  kind: StockMovementKind;
  /** Signed: + received, - dispensed or removed. */
  quantity: number;
  balance_after: number;
  reason: StockAdjustReason | "";
  note: string;
  prescription_id: Uuid | null;
  by_name: string;
  occurred_at: string;
}

export interface StockDetail extends StockCard {
  batches: StockBatch[];
  movements: StockMovement[];
}

export interface StockReceiveInput {
  drug_code: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  supplier?: string;
  low_stock_threshold?: number | null;
}

export interface StockAdjustInput {
  quantity_change: number;
  reason: StockAdjustReason;
  note?: string;
}

export interface DosingLabel {
  line_id: Uuid;
  language: LanguageCode;
  drug: string;
  quantity: number;
  dose: string;
  frequency: string;
  route: string;
  duration: string;
  instructions: string;
  patient_name: string;
  dispensed_on: string;
  facility_name: string;
  prescription_number: string;
}

export interface PatientPrescriptionRow {
  id: Uuid;
  patient_id: Uuid;
  number: string;
  facility_name: string;
  prescriber_name: string;
  status: PrescriptionStatus;
  issued_at: string;
  expires_at: string;
  item_count: number;
}

export interface PatientPrescriptionItem {
  id: Uuid;
  drug_display: string;
  dose: string;
  frequency_code: FrequencyCode;
  route: DrugRoute;
  duration_days: number | null;
  quantity: number;
  dispensed_quantity: number;
  instructions: string;
  status: PrescriptionItemStatus;
  substitute_display: string;
}

export interface PatientPrescription extends PatientPrescriptionRow {
  items: PatientPrescriptionItem[];
}

interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

const STF = "/api/v1/staff";
const PAT = "/api/v1/patient";

export const pharmacyPaths = {
  prescription: (consultationId: Uuid) => `${STF}/consultations/${consultationId}/prescription/`,
  items: (consultationId: Uuid) => `${STF}/consultations/${consultationId}/prescription/items/`,
  item: (itemId: Uuid) => `${STF}/prescription-items/${itemId}/`,
  cancelItem: (itemId: Uuid) => `${STF}/prescription-items/${itemId}/cancel/`,
  byId: (id: Uuid) => `${STF}/prescriptions/${id}/`,
  cancel: (id: Uuid) => `${STF}/prescriptions/${id}/cancel/`,
  dispense: (id: Uuid) => `${STF}/prescriptions/${id}/dispense/`,
  labels: (id: Uuid) => `${STF}/prescriptions/${id}/labels/`,
  queries: (id: Uuid) => `${STF}/prescriptions/${id}/queries/`,
  answerQuery: (id: Uuid) => `${STF}/prescription-queries/${id}/answer/`,
  closeQuery: (id: Uuid) => `${STF}/prescription-queries/${id}/close/`,
  queue: `${STF}/pharmacy/queue/`,
  myDay: `${STF}/pharmacy/my-day/`,
  history: `${STF}/pharmacy/history/`,
  availability: `${STF}/pharmacy/availability/`,
  availabilityDrug: (code: string) => `${STF}/pharmacy/availability/${encodeURIComponent(code)}/`,
  drugs: `${STF}/drugs/`,
  stock: `${STF}/pharmacy/stock/`,
  stockReceive: `${STF}/pharmacy/stock/receive/`,
  stockExpiring: `${STF}/pharmacy/stock/expiring/`,
  stockMovements: `${STF}/pharmacy/stock/movements/`,
  stockDrug: (code: string) => `${STF}/pharmacy/stock/${encodeURIComponent(code)}/`,
  stockAdjust: (batchId: Uuid) => `${STF}/pharmacy/stock/batches/${batchId}/adjust/`,
  patientList: `${PAT}/prescriptions/`,
  patientOne: (id: Uuid) => `${PAT}/prescriptions/${id}/`,
};

function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function createPharmacyApi(client: ApiClient) {
  return {
    /** P1: `404` when the consultation has no prescription yet. */
    forConsultation: (consultationId: Uuid) =>
      client.get<Prescription>(pharmacyPaths.prescription(consultationId)),
    addItem: (
      consultationId: Uuid,
      body: PrescriptionItemInput & { replaces_item_id?: Uuid | null },
    ) => client.post<Prescription>(pharmacyPaths.items(consultationId), body),
    updateItem: (itemId: Uuid, body: PrescriptionItemInput & { version: number }) =>
      client.request<Prescription>("PATCH", pharmacyPaths.item(itemId), { body }),
    removeItem: (itemId: Uuid, version: number) =>
      client.request<Prescription>("DELETE", pharmacyPaths.item(itemId) + query({ version })),
    cancelItem: (itemId: Uuid, body: { version: number; reason: string }) =>
      client.post<Prescription>(pharmacyPaths.cancelItem(itemId), body),
    get: (id: Uuid) => client.get<Prescription>(pharmacyPaths.byId(id)),
    cancel: (id: Uuid, body: { version: number; reason: string }) =>
      client.post<Prescription>(pharmacyPaths.cancel(id), body),
    dispense: (id: Uuid, body: DispenseInput) =>
      client.post<Prescription>(pharmacyPaths.dispense(id), body),
    labels: (id: Uuid, language?: LanguageCode) =>
      client.get<{ labels: DosingLabel[] }>(pharmacyPaths.labels(id) + query({ language })),
    raiseQuery: (id: Uuid, message: string) =>
      client.post<PrescriptionQuery>(pharmacyPaths.queries(id), { message }),
    answerQuery: (queryId: Uuid, addendumId: Uuid) =>
      client.post<PrescriptionQuery>(pharmacyPaths.answerQuery(queryId), {
        addendum_id: addendumId,
      }),
    closeQuery: (queryId: Uuid) =>
      client.post<PrescriptionQuery>(pharmacyPaths.closeQuery(queryId), {}),
    queue: (params: { status?: PharmacyQueueTab; q?: string; page?: number } = {}) =>
      client.get<Paginated<PharmacyQueueRow>>(pharmacyPaths.queue + query(params)),
    myDay: () => client.get<PharmacyDay>(pharmacyPaths.myDay),
    history: (params: { days?: 1 | 7 | 30; mine?: boolean; q?: string } = {}) =>
      client.get<DispenseHistoryRow[]>(pharmacyPaths.history + query(params)),
    availability: (params: { q?: string; available?: boolean; page?: number } = {}) =>
      client.get<Paginated<AvailabilityRow>>(pharmacyPaths.availability + query(params)),
    setAvailability: (drugCode: string, isAvailable: boolean) =>
      client.request<AvailabilityRow>("PUT", pharmacyPaths.availabilityDrug(drugCode), {
        body: { is_available: isAvailable },
      }),
    /** PS1: `q` of 2 characters or more; 25 results. */
    drugs: (q: string) => client.get<DrugRow[]>(pharmacyPaths.drugs + query({ q })),
    /** W5 stock: cards, receive, adjust, threshold, expiring soon and movements. */
    stock: {
      list: (params: { q?: string; level?: "low" | "out" | "short"; page?: number } = {}) =>
        client.get<Paginated<StockCard>>(pharmacyPaths.stock + query(params)),
      get: (drugCode: string) => client.get<StockDetail>(pharmacyPaths.stockDrug(drugCode)),
      receive: (body: StockReceiveInput) =>
        client.post<StockDetail>(pharmacyPaths.stockReceive, body),
      adjust: (batchId: Uuid, body: StockAdjustInput) =>
        client.post<StockDetail>(pharmacyPaths.stockAdjust(batchId), body),
      setThreshold: (drugCode: string, lowStockThreshold: number) =>
        client.request<StockDetail>("PUT", pharmacyPaths.stockDrug(drugCode), {
          body: { low_stock_threshold: lowStockThreshold },
        }),
      expiring: (days?: 30 | 60 | 90) =>
        client.get<StockBatch[]>(pharmacyPaths.stockExpiring + query({ days })),
      movements: (params: { kind?: StockMovementKind; page?: number } = {}) =>
        client.get<Paginated<StockMovement>>(pharmacyPaths.stockMovements + query(params)),
    },
    patient: {
      list: (params: { patient_id?: Uuid; status?: "active" | "past"; page?: number } = {}) =>
        client.get<Paginated<PatientPrescriptionRow>>(pharmacyPaths.patientList + query(params)),
      get: (id: Uuid) => client.get<PatientPrescription>(pharmacyPaths.patientOne(id)),
    },
  };
}

export type PharmacyApi = ReturnType<typeof createPharmacyApi>;
