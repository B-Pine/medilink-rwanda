/**
 * S6a clinical record (contract sprint-06 §3): consultations, vitals, history, the
 * treatment-relationship rule and prescribing alerts for staff; signed records for patients.
 *
 * Staff types carry private notes and the examination. The patient types never do (S6-B14).
 */
import type { ApiClient } from "../client";
import type { Uuid } from "../types";
import type { I18nText } from "./masterdata";
import type { AccessReasonCode } from "./patients";
import type { TicketRow } from "./queue";

declare module "../types" {
  interface PermissionCodes {
    "clinical.unsigned_list": true;
  }
}

export type ConsultationStatus = "draft" | "signed" | "entered_in_error";
export type DiagnosisRank = "primary" | "secondary";
export type Certainty = "provisional" | "confirmed";
export type ClinicalAlertKind = "allergy" | "duplicate" | "dose";

export interface Vitals {
  id: Uuid;
  visit_id: Uuid;
  recorded_at: string;
  recorded_by_name: string | null;
  /** Decimal strings, as the API sends them ("38.4"). */
  temperature_c: string | null;
  systolic_mmhg: number | null;
  diastolic_mmhg: number | null;
  pulse_bpm: number | null;
  respiratory_rate: number | null;
  spo2_pct: number | null;
  weight_kg: string | null;
  height_cm: string | null;
  muac_mm: number | null;
  /** Red flags so a dangerous number is never missed (upgrade 05 §3). */
  flags: VitalFlag[];
  is_entered_in_error: boolean;
}

export type VitalFlag =
  | "spo2_low"
  | "bp_high"
  | "bp_low"
  | "temp_high"
  | "temp_low"
  | "pulse_high"
  | "pulse_low"
  | "rr_high";

/** Why the patient came (upgrade 05 §3): their words, symptoms and the triage navigation hint. */
export interface ReasonForVisit {
  patient_words: string;
  symptoms: {
    code: string;
    label: string;
    duration_days: number | null;
    severity: string;
    stage: "booking" | "check_in";
  }[];
  /** Care navigation, never a diagnosis; `signed_off` false while the rules await review. */
  triage: {
    urgency: "self_care" | "soon" | "today" | "emergency";
    service_code: string;
    level_of_care: string;
    red_flags: string[];
    rules_version: string;
    signed_off: boolean;
  } | null;
  /** The triage nurse's urgency and note (#200); null when the patient was not triaged. */
  nurse_triage: {
    urgency: "normal" | "priority" | "emergency";
    note: string;
    by_name: string;
    at: string;
  } | null;
}

/** Doctor Today (upgrade 05 §3): counts for the signed-in clinician. */
export interface MyDay {
  date: string;
  seen_today: number;
  avg_consult_min: number | null;
  signed_today: number;
  trend: { date: string; seen: number }[];
  unsigned: number;
  unsigned_overdue: number;
  results_waiting: number;
  follow_ups_today: number;
  open_questions: {
    id: Uuid;
    prescription_id: Uuid;
    consultation_id: Uuid;
    patient_display_name: string;
    raised_at: string;
  }[];
  updated_at: string;
}

export type VitalsInput = Partial<
  Pick<
    Vitals,
    | "temperature_c"
    | "systolic_mmhg"
    | "diastolic_mmhg"
    | "pulse_bpm"
    | "respiratory_rate"
    | "spo2_pct"
    | "weight_kg"
    | "height_cm"
    | "muac_mm"
  >
>;

export const VITAL_FIELDS = [
  "temperature_c",
  "systolic_mmhg",
  "diastolic_mmhg",
  "pulse_bpm",
  "respiratory_rate",
  "spo2_pct",
  "weight_kg",
  "height_cm",
  "muac_mm",
] as const;
export type VitalField = (typeof VITAL_FIELDS)[number];

/** Plausible ranges (contract §2.2 Vitals); the server enforces the same. */
export const VITAL_RANGES: Record<VitalField, [number, number]> = {
  temperature_c: [30, 45],
  systolic_mmhg: [50, 260],
  diastolic_mmhg: [20, 160],
  pulse_bpm: [20, 250],
  respiratory_rate: [4, 80],
  spo2_pct: [50, 100],
  weight_kg: [0.3, 400],
  height_cm: [20, 250],
  muac_mm: [50, 400],
};

export interface Diagnosis {
  id: Uuid;
  code: string;
  display: string;
  plain_language: string;
  rank: DiagnosisRank;
  certainty: Certainty;
  is_sensitive: boolean;
}

export interface DiagnosisInput {
  code: string;
  rank: DiagnosisRank;
  certainty: Certainty;
}

export interface Addendum {
  id: Uuid;
  author_name: string;
  is_by_author: boolean;
  reason: string;
  body: string;
  signed_at: string;
  content_hash: string;
}

export interface ClinicalAllergy {
  id: Uuid;
  category: "drug" | "food" | "other";
  substance: string;
  reaction: string | null;
  severity: "mild" | "moderate" | "severe" | "unknown";
  verification_status: "unverified" | "verified" | "refuted";
}

export interface Consultation {
  id: Uuid;
  visit_id: Uuid;
  facility_patient_id: Uuid;
  patient: { id: Uuid; display_name: string; age_years: number | null; sex: string | null };
  author: { membership_id: Uuid; full_name: string };
  status: ConsultationStatus;
  started_at: string;
  signed_at: string | null;
  is_late_entry: boolean;
  is_restricted: boolean;
  suggest_restricted: boolean;
  history_text: string;
  examination_text: string;
  plan_text: string;
  patient_instructions_text: string;
  /** Never shown to the patient. */
  private_notes: string;
  diagnoses: Diagnosis[];
  vitals: Vitals[];
  reason_for_visit: ReasonForVisit;
  addenda: Addendum[];
  allergies: ClinicalAllergy[];
  no_known_allergies: boolean | null;
  content_hash: string | null;
  integrity: "ok" | "mismatch" | null;
  entered_in_error: { at: string; reason: string; by_name: string | null } | null;
  can_edit: boolean;
  can_sign: boolean;
  version: number;
}

export const SECTION_FIELDS = [
  "history_text",
  "examination_text",
  "plan_text",
  "patient_instructions_text",
  "private_notes",
] as const;
export type SectionField = (typeof SECTION_FIELDS)[number];

export type ConsultationUpdate = { version: number } & Partial<Record<SectionField, string>> & {
    is_restricted?: boolean;
    diagnoses?: DiagnosisInput[];
  };

export interface ConsultationRow {
  id: Uuid;
  visit_id: Uuid;
  facility_patient_id: Uuid;
  patient_display_name: string;
  service_date: string;
  author: { membership_id: Uuid; full_name: string };
  status: ConsultationStatus;
  started_at: string;
  is_overdue: boolean;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface HistoryItem {
  kind: "consultation" | "vitals";
  id: Uuid;
  occurred_at: string;
  visit_id: Uuid;
  service_name_i18n: I18nText;
  author_name: string | null;
  status: ConsultationStatus | null;
  is_restricted: boolean;
  is_late_entry: boolean;
  diagnoses: { code: string; display: string; certainty: Certainty; rank: DiagnosisRank }[];
  addenda_count: number;
  vitals: Vitals | null;
}

export interface HistoryFilters {
  type?: "consultation" | "vitals" | "";
  code?: string;
  from?: string;
  to?: string;
  page?: number;
}

export interface SummaryItem {
  id: Uuid;
  display: string;
  verification_status: string;
  detail: string | null;
}

export interface ProblemSummary {
  allergies: ClinicalAllergy[];
  no_known_allergies: boolean | null;
  conditions: SummaryItem[];
  medications: SummaryItem[];
  recent_diagnoses: { code: string; display: string; certainty: Certainty; last_seen_at: string }[];
  is_staff_member: boolean;
}

export interface ClinicalAccessState {
  has_relationship: boolean;
  is_staff_member: boolean;
  reason_required: boolean;
  granted_until: string | null;
}

export interface ClinicalAlert {
  drug_code: string;
  kind: ClinicalAlertKind;
  severity: "high" | "medium";
  allergy_id: Uuid | null;
  substance: string | null;
  verification_status: string | null;
  max_usual_quantity: number | null;
}

export type ScanType = "outside_result" | "legacy_record" | "referral_letter" | "other";

/** A scanned paper record or outside result (S6b L2). */
export interface ClinicalScan {
  id: Uuid;
  facility_patient_id: Uuid;
  document_type: ScanType;
  document_date: string;
  description: string;
  content_type: string;
  uploaded_by_name: string;
  uploaded_at: string;
  review_id: Uuid | null;
}

/** An outside result waiting for the doctor (S6b R1). */
export interface ResultReview {
  id: Uuid;
  status: "pending" | "reviewed";
  scan: ClinicalScan;
  patient_display_name: string;
  facility_patient_id: Uuid;
  assigned_to_name: string;
  comment: string;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
  version: number;
}

/** Back-entered history from paper, always labelled historical (S6b L3). */
export interface HistoryEntry {
  id: Uuid;
  kind: "diagnosis" | "allergy" | "condition" | "medication" | "procedure";
  code: string;
  display: string;
  note: string;
  occurred_on: string | null;
  source_scan_id: Uuid | null;
  entered_by_name: string;
  entered_at: string;
  is_historical: boolean;
}

// ---- doctor tools (upgrade 05 §3) ---------------------------------------------------------

/** A pharmacist's question on one of my prescriptions. */
export interface PharmacyQuestion {
  id: Uuid;
  status: "open" | "answered" | "closed";
  message: string;
  raised_by_name: string;
  raised_at: string;
  answered_at: string | null;
  prescription_id: Uuid;
  consultation_id: Uuid;
  facility_patient_id: Uuid;
  patient_display_name: string;
  /** Medicine names on the prescription. */
  items: string[];
}

export type FollowUpState = "missed" | "today" | "upcoming" | "attended";

/** A follow-up I set: missed in the last 30 days, today, the next 14 days, or attended. */
export interface MyFollowUp {
  id: Uuid;
  patient_display_name: string;
  facility_patient_id: Uuid;
  service_name_i18n: I18nText;
  due_on: string;
  mode: "booking" | "reminder";
  status: string;
  state: FollowUpState;
  booking_starts_at: string | null;
  consultation_id: Uuid | null;
}

/** My activity over 7 or 30 days (counts only). */
export interface MyActivity {
  days: 7 | 30;
  seen: number;
  signed: number;
  avg_consult_min: number | null;
  late_signatures: number;
  unsigned_now: number;
  follow_ups_set: number;
  trend: { date: string; seen: number; signed: number }[];
  top_diagnoses: { code: string; display: string; count: number }[];
}

export interface NoteTemplateItem {
  drug_code?: string;
  free_text_drug?: string;
  /** Name to show; the catalogue name for a drug code. */
  drug_display?: string;
  dose: string;
  frequency_code: string;
  route: string;
  duration_days?: number | null;
  quantity?: number | null;
  instructions?: string;
}

export type TemplateSections = Record<
  "history_text" | "examination_text" | "plan_text" | "patient_instructions_text",
  string
>;

/** A diagnosis on a template, labelled in the request language (W3, #202). */
export interface TemplateDiagnosis {
  code: string;
  display: string;
  plain_language: string;
  is_sensitive: boolean;
  /** False when the code is not an active ICD-10 code: applying skips it and says so. */
  is_known: boolean;
}

/**
 * A lab test on an order set: the extension point for W2 lab orders. Stored and returned, but
 * not ordered yet; applying the order set lists the tests to order by hand.
 */
export interface TemplateTest {
  code: string;
  name?: string;
}

/**
 * My note template, used as an order set (W3): diagnoses, plan, instructions and a prescription
 * applied in one click; follows me across facilities.
 */
export interface NoteTemplate {
  id: Uuid;
  name: string;
  sections: TemplateSections;
  diagnosis_codes: string[];
  diagnoses: TemplateDiagnosis[];
  items: NoteTemplateItem[];
  tests: TemplateTest[];
  use_count: number;
  updated_at: string;
}

export type NoteTemplateInput = Pick<NoteTemplate, "name" | "diagnosis_codes" | "items"> & {
  sections: Partial<TemplateSections>;
  tests?: TemplateTest[];
};

/** A medicine I prescribe often, with the dosing of its latest use (W3, #202). */
export interface FavouriteMedicine {
  drug_code: string;
  free_text_drug: string;
  drug_display: string;
  is_controlled: boolean;
  available_here: boolean;
  dose: string;
  frequency_code: string;
  route: string;
  duration_days: number | null;
  count: number;
}

/** My most used diagnoses and medicines here: from my signed work, last 180 days, used twice+. */
export interface ClinicalFavourites {
  window_days: number;
  diagnoses: { code: string; display: string; plain_language: string; count: number }[];
  medicines: FavouriteMedicine[];
}

/** Patient view (PR1/PR2): no private notes, no examination. */
export interface PatientRecordDiagnosis {
  code: string;
  plain_language: string;
  display: string;
  certainty: Certainty;
  rank: DiagnosisRank;
}

export interface PatientRecordRow {
  id: Uuid;
  patient_id: Uuid;
  facility_name: string;
  service_date: string;
  doctor_name: string;
  signed_at: string;
  diagnoses: PatientRecordDiagnosis[];
}

export interface PatientRecord extends PatientRecordRow {
  is_late_entry: boolean;
  history_text: string;
  plan_text: string;
  patient_instructions_text: string;
  vitals: Omit<Vitals, "id" | "visit_id" | "recorded_by_name" | "is_entered_in_error" | "flags">[];
  addenda: { author_name: string; reason: string; body: string; signed_at: string }[];
}

// ---- upgrade 06 §3 (#201, FR-CLN-11): the laboratory loop ------------------------------------

/** `cancelled` only from `ordered`, by the ordering doctor. */
export type LabOrderState =
  "ordered" | "sample_taken" | "resulted" | "reviewed" | "released" | "cancelled";
export type LabSpecimen = "blood" | "urine" | "stool";
/** Against the reference: a number below or above the range, or an unexpected answer. */
export type LabFlag = "low" | "high" | "abnormal";

/** A test of the catalogue: a number with a unit and an adult range, or fixed answers. */
export interface LabCatalogueItem {
  code: string;
  label: string;
  kind: "number" | "choice";
  unit: string;
  /** Decimal strings; null when not judged. */
  low: string | null;
  high: string | null;
  /** Answer codes of a `choice` item (`negative`, `positive`, `invalid`, `trace`, …). */
  choices: string[];
  /** The expected answer; anything else is flagged. Null when none is expected. */
  normal: string | null;
}

/** Not the documents `LabTest` (a line of a lab request letter). */
export interface LabCatalogueTest {
  code: string;
  name: string;
  specimen: LabSpecimen;
  items: LabCatalogueItem[];
}

export interface LabResultItem {
  code: string;
  label: string;
  kind: "number" | "choice";
  value: string;
  unit: string;
  low: string | null;
  high: string | null;
  flag: LabFlag | null;
}

export interface LabOrder {
  id: Uuid;
  visit_id: Uuid;
  consultation_id: Uuid;
  test_code: string;
  test_name: string;
  specimen: LabSpecimen | "";
  state: LabOrderState;
  /** Why the doctor asks; the lab sees it. */
  reason: string;
  ordered_at: string;
  ordered_by_name: string | null;
  sample_taken_at: string | null;
  sample_taken_by_name: string | null;
  resulted_at: string | null;
  resulted_by_name: string | null;
  result: { items: LabResultItem[]; comment: string } | null;
  is_abnormal: boolean;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  /** The clinician's note for the patient; always empty for the lab. */
  review_note: string;
  released_at: string | null;
  version: number;
}

/** What the lab needs to confirm who the patient is. */
export interface LabPatient {
  full_name: string;
  display_name: string;
  date_of_birth: string | null;
  age_years: number | null;
  sex: string | null;
  medilink_number: string | null;
}

/** One visit at the lab: its lab ticket (null until the doctor sends the patient) and tests. */
export interface LabVisit {
  visit_id: Uuid;
  ticket: TicketRow | null;
  patient: LabPatient;
  /** Something is still to pay on the visit's bill. */
  unpaid: boolean;
  orders: LabOrder[];
}

export interface LabQueue {
  /** At least one sample to take. */
  waiting: LabVisit[];
  /** Samples taken, results to enter. */
  in_progress: LabVisit[];
  /** Every test resulted today. */
  done_today: LabVisit[];
}

export interface LabInboxRow {
  order: LabOrder;
  patient: LabPatient;
  facility_patient_id: Uuid;
}

/** A released result, as the patient sees it (never before release). */
export interface PatientLabResult {
  id: Uuid;
  patient_id: Uuid;
  facility_name: string;
  test_code: string;
  test_name: string;
  ordered_at: string;
  released_at: string;
  doctor_name: string;
  items: LabResultItem[];
  is_abnormal: boolean;
  /** The doctor's note with the result. */
  note: string;
}

const STF = "/api/v1/staff";
const PAT = "/api/v1/patient";

export const clinicalPaths = {
  open: (visitId: Uuid) => `${STF}/visits/${visitId}/consultation/`,
  consultations: `${STF}/consultations/`,
  consultation: (id: Uuid) => `${STF}/consultations/${id}/`,
  sign: (id: Uuid) => `${STF}/consultations/${id}/sign/`,
  addenda: (id: Uuid) => `${STF}/consultations/${id}/addenda/`,
  enteredInError: (id: Uuid) => `${STF}/consultations/${id}/entered-in-error/`,
  vitals: (visitId: Uuid) => `${STF}/visits/${visitId}/vitals/`,
  vitalsError: (id: Uuid) => `${STF}/vitals/${id}/entered-in-error/`,
  history: (fpId: Uuid) => `${STF}/clinical/patients/${fpId}/history/`,
  summary: (fpId: Uuid) => `${STF}/clinical/patients/${fpId}/problem-summary/`,
  reasons: (fpId: Uuid) => `${STF}/clinical/patients/${fpId}/access-reasons/`,
  access: (fpId: Uuid) => `${STF}/clinical/patients/${fpId}/access/`,
  alerts: `${STF}/clinical/alerts/`,
  myDay: `${STF}/clinical/my-day/`,
  questions: `${STF}/clinical/questions/`,
  reply: (id: Uuid) => `${STF}/clinical/questions/${id}/reply/`,
  myFollowUps: `${STF}/clinical/my-follow-ups/`,
  myActivity: `${STF}/clinical/my-activity/`,
  templates: `${STF}/clinical/templates/`,
  template: (id: Uuid) => `${STF}/clinical/templates/${id}/`,
  templateUsed: (id: Uuid) => `${STF}/clinical/templates/${id}/used/`,
  favourites: `${STF}/clinical/favourites/`,
  results: `${STF}/results-inbox/`,
  reviewResult: (id: Uuid) => `${STF}/results-inbox/${id}/review/`,
  scans: (fpId: Uuid) => `${STF}/clinical/patients/${fpId}/scans/`,
  scanLink: (id: Uuid) => `${STF}/clinical/scans/${id}/download-link/`,
  historyEntries: (fpId: Uuid) => `${STF}/clinical/patients/${fpId}/history-entries/`,
  records: `${PAT}/records/`,
  record: (id: Uuid) => `${PAT}/records/${id}/`,
  // #201: the laboratory loop
  labTests: `${STF}/lab/tests/`,
  labQueue: `${STF}/lab/queue/`,
  labInbox: `${STF}/lab/results/`,
  labOrders: (consultationId: Uuid) => `${STF}/consultations/${consultationId}/lab-orders/`,
  labOrder: (id: Uuid, step: "sample" | "result" | "review" | "release" | "cancel") =>
    `${STF}/lab-orders/${id}/${step}/`,
  labResults: `${PAT}/results/`,
};

function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function createClinicalApi(client: ApiClient) {
  return {
    open: (visitId: Uuid) => client.post<Consultation>(clinicalPaths.open(visitId), {}),
    get: (id: Uuid) => client.get<Consultation>(clinicalPaths.consultation(id)),
    update: (id: Uuid, body: ConsultationUpdate) =>
      client.request<Consultation>("PATCH", clinicalPaths.consultation(id), { body }),
    sign: (id: Uuid, version: number) =>
      client.post<Consultation>(clinicalPaths.sign(id), { version }),
    addAddendum: (id: Uuid, body: { reason: string; body: string }) =>
      client.post<Addendum>(clinicalPaths.addenda(id), body),
    markEnteredInError: (id: Uuid, body: { version: number; reason: string }) =>
      client.post<Consultation>(clinicalPaths.enteredInError(id), body),
    unsigned: (params: { mine?: boolean; page?: number } = {}) =>
      client.get<Paginated<ConsultationRow>>(
        clinicalPaths.consultations + query({ status: "draft", ...params }),
      ),
    vitals: (visitId: Uuid) => client.get<{ results: Vitals[] }>(clinicalPaths.vitals(visitId)),
    recordVitals: (visitId: Uuid, body: VitalsInput) =>
      client.post<Vitals>(clinicalPaths.vitals(visitId), body),
    vitalsEnteredInError: (id: Uuid, reason: string) =>
      client.post<Vitals>(clinicalPaths.vitalsError(id), { reason }),
    history: (fpId: Uuid, filters: HistoryFilters = {}) =>
      client.get<Paginated<HistoryItem>>(clinicalPaths.history(fpId) + query({ ...filters })),
    summary: (fpId: Uuid) => client.get<ProblemSummary>(clinicalPaths.summary(fpId)),
    access: (fpId: Uuid) => client.get<ClinicalAccessState>(clinicalPaths.access(fpId)),
    giveReason: (fpId: Uuid, body: { reason_code: AccessReasonCode; reason_text?: string }) =>
      client.post<{ granted_until: string }>(clinicalPaths.reasons(fpId), body),
    alerts: (body: {
      facility_patient_id: Uuid;
      items: { drug_code: string; quantity?: number }[];
    }) => client.post<{ alerts: ClinicalAlert[] }>(clinicalPaths.alerts, body),
    myDay: () => client.get<MyDay>(clinicalPaths.myDay),
    questions: (status: "open" | "answered" = "open") =>
      client.get<PharmacyQuestion[]>(clinicalPaths.questions + query({ status })),
    /** Signed addendum and answer in one step; asks for step-up. */
    reply: (id: Uuid, body: string) =>
      client.post<PharmacyQuestion>(clinicalPaths.reply(id), { body }),
    myFollowUps: () => client.get<MyFollowUp[]>(clinicalPaths.myFollowUps),
    myActivity: (days: 7 | 30 = 7) =>
      client.get<MyActivity>(clinicalPaths.myActivity + query({ days })),
    templates: () => client.get<NoteTemplate[]>(clinicalPaths.templates),
    createTemplate: (body: NoteTemplateInput) =>
      client.post<NoteTemplate>(clinicalPaths.templates, body),
    updateTemplate: (id: Uuid, body: NoteTemplateInput) =>
      client.request<NoteTemplate>("PUT", clinicalPaths.template(id), { body }),
    deleteTemplate: (id: Uuid) => client.request<void>("DELETE", clinicalPaths.template(id)),
    templateUsed: (id: Uuid) => client.post<NoteTemplate>(clinicalPaths.templateUsed(id), {}),
    /** W3: my most used diagnoses and medicines, shown first in the pickers. */
    favourites: () => client.get<ClinicalFavourites>(clinicalPaths.favourites),
    /** R1: outside results assigned to me, oldest first. */
    results: (params: { status?: "pending" | "reviewed"; page?: number } = {}) =>
      client.get<Paginated<ResultReview>>(clinicalPaths.results + query(params)),
    reviewResult: (id: Uuid, body: { version: number; comment?: string }) =>
      client.post<ResultReview>(clinicalPaths.reviewResult(id), body),
    scans: (fpId: Uuid) => client.get<ClinicalScan[]>(clinicalPaths.scans(fpId)),
    /** A 5-minute link, audited in the access history. */
    scanLink: (id: Uuid) =>
      client.post<{ url: string; expires_at: string }>(clinicalPaths.scanLink(id), {}),
    historyEntries: (fpId: Uuid) => client.get<HistoryEntry[]>(clinicalPaths.historyEntries(fpId)),
    /** #201 (FR-CLN-11): order, sample, result, review, release. */
    lab: {
      tests: () => client.get<LabCatalogueTest[]>(clinicalPaths.labTests),
      /** The visit's tests (cancelled ones left out). */
      orders: (consultationId: Uuid) =>
        client.get<LabOrder[]>(clinicalPaths.labOrders(consultationId)),
      /** In my draft consultation; `422` for an unknown or already ordered test. */
      order: (consultationId: Uuid, body: { tests: string[]; reason?: string }) =>
        client.post<LabOrder[]>(clinicalPaths.labOrders(consultationId), body),
      queue: () => client.get<LabQueue>(clinicalPaths.labQueue),
      sample: (o: Pick<LabOrder, "id" | "version">) =>
        client.post<LabOrder>(clinicalPaths.labOrder(o.id, "sample"), { version: o.version }),
      /** `values` per item code; `400` names the item (`values.<code>`). */
      result: (
        o: Pick<LabOrder, "id" | "version">,
        body: { values: Record<string, string>; comment?: string },
      ) =>
        client.post<LabOrder>(clinicalPaths.labOrder(o.id, "result"), {
          version: o.version,
          ...body,
        }),
      review: (o: Pick<LabOrder, "id" | "version">, note = "") =>
        client.post<LabOrder>(clinicalPaths.labOrder(o.id, "review"), {
          version: o.version,
          note,
        }),
      release: (o: Pick<LabOrder, "id" | "version">) =>
        client.post<LabOrder>(clinicalPaths.labOrder(o.id, "release"), { version: o.version }),
      cancel: (o: Pick<LabOrder, "id" | "version">) =>
        client.post<LabOrder>(clinicalPaths.labOrder(o.id, "cancel"), { version: o.version }),
      /** Results of the tests I ordered, waiting for my review or release. */
      inbox: () => client.get<LabInboxRow[]>(clinicalPaths.labInbox),
    },
    patient: {
      records: (params: { patient_id?: Uuid; page?: number } = {}) =>
        client.get<Paginated<PatientRecordRow>>(clinicalPaths.records + query(params)),
      record: (id: Uuid) => client.get<PatientRecord>(clinicalPaths.record(id)),
      /** #201: lab results the doctor released (never before), newest first. */
      labResults: (params: { patient_id?: Uuid } = {}) =>
        client.get<PatientLabResult[]>(clinicalPaths.labResults + query(params)),
    },
  };
}

export type ClinicalApi = ReturnType<typeof createClinicalApi>;
