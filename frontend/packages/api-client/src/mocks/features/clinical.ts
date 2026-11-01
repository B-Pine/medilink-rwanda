import { http, HttpResponse } from "msw";

import type {
  Addendum,
  ClinicalAlert,
  Consultation,
  ConsultationRow,
  Diagnosis,
  DiagnosisInput,
  HistoryItem,
  PatientRecord,
  PatientRecordRow,
  ProblemSummary,
  SectionField,
  Vitals,
} from "../../features/clinical";
import { SECTION_FIELDS, VITAL_FIELDS, VITAL_RANGES } from "../../features/clinical";
import type { LanguageCode } from "../../types";
import { extendMockRoleGrants, FACILITIES } from "../data";
import type { FeatureMockFactory } from "../features";
import { CHILD_PATIENT_ID, SELF_PATIENT_ID } from "./patients-store";
import { id, now, page, s1, stepUpFailure } from "./s1-common";
import { SETUP_IDS } from "./setup";

/** A JSON body field as text ("" when missing or not a string). */
const asText = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * S6a mocks (sprint-06 §6.3), Kigali Clinic. Facility records come from the S3 mock store:
 * - `MOCK_CLINICAL_FP` Mukamana Jeanne: in care, penicillin allergy (verified, severe),
 *   hypertension, amlodipine; three signed consultations (malaria B54, hypertension I10 with an
 *   addendum, a cold J06.9) and an unsigned draft from yesterday by Dr Keza
 * - `MOCK_STAFF_PATIENT_FP` Habimana Eric: works here, so a reason is always asked
 * - `MOCK_NO_CARE_FP` Niyonsaba Claudine: no recent visit, a reason is asked
 * `MOCK_CLINICAL_VISIT_ID` is Mukamana's visit today. Any other visit ID (for example the queue
 * mock's patient in service) opens a consultation for Mukamana too.
 * Patients: patient@medilink.test (Mukamana) has two signed records; the dependant one more.
 */
extendMockRoleGrants({
  doctor: ["clinical.unsigned_list"],
  facility_admin: ["clinical.unsigned_list"],
});

export const MOCK_CLINICAL_FP = "5c3d2e1f-3333-4000-8000-000000000001";
export const MOCK_STAFF_PATIENT_FP = "5c3d2e1f-3333-4000-8000-000000000003";
export const MOCK_NO_CARE_FP = "5c3d2e1f-3333-4000-8000-000000000005";
export const MOCK_CLINICAL_VISIT_ID = "7c000000-0000-4000-8000-000000000001";
export const MOCK_PRIVATE_NOTE = "Consider typhoid if the fever lasts";

const DOCTOR = { membership_id: SETUP_IDS.mKeza, full_name: "Uwimana Keza" };
const OTHER_DOCTOR = { membership_id: SETUP_IDS.mPaul, full_name: "Mugabo Paul" };

type I18n = Partial<Record<LanguageCode, string>>;
const ICD: Record<string, { title: I18n; plain: I18n; sensitive: boolean }> = {
  B54: {
    title: { en: "Unspecified malaria", fr: "Paludisme, sans précision", rw: "Malariya" },
    plain: { en: "Malaria", fr: "Paludisme", rw: "Malariya" },
    sensitive: false,
  },
  I10: {
    title: {
      en: "Essential (primary) hypertension",
      fr: "Hypertension essentielle",
      rw: "Umuvuduko w'amaraso",
    },
    plain: { en: "High blood pressure", fr: "Tension élevée", rw: "Umuvuduko w'amaraso ukabije" },
    sensitive: false,
  },
  "J06.9": {
    title: {
      en: "Acute upper respiratory infection",
      fr: "Infection aiguë des voies respiratoires supérieures",
    },
    plain: { en: "Common cold", fr: "Rhume", rw: "Ibicurane" },
    sensitive: false,
  },
  B20: { title: { en: "HIV disease" }, plain: { en: "HIV" }, sensitive: true },
  "F32.9": { title: { en: "Depressive episode" }, plain: { en: "Depression" }, sensitive: true },
};
const pick = (value: I18n, lang: LanguageCode) => value[lang] ?? value.en ?? "";

const DRUGS: Record<string, { name: string; klass: string; max: number | null }> = {
  AMOX500: { name: "Amoxicillin", klass: "penicillin", max: 30 },
  PARA500: { name: "Paracetamol", klass: "analgesic", max: 60 },
  AMLO5: { name: "Amlodipine", klass: "calcium channel blocker", max: 90 },
};

const MESSAGES = {
  reasonRequired: {
    en: "This patient is not in your care today. Give a reason to open the record.",
    fr: "Ce patient n'est pas suivi par vous aujourd'hui. Indiquez un motif pour ouvrir le dossier.",
    rw: "Uyu murwayi ntari mu bo wita ku buzima uyu munsi. Tanga impamvu kugira ngo ufungure dosiye.",
  },
  locked: {
    en: "This record is signed and locked. Add an addendum instead.",
    fr: "Ce dossier est signé et verrouillé. Ajoutez un addendum.",
    rw: "Iyi dosiye yasinywe kandi irafunze. Ongeraho inyongera.",
  },
  needPrimary: {
    en: "Add a primary diagnosis before signing.",
    fr: "Ajoutez un diagnostic principal avant de signer.",
    rw: "Ongeraho isuzuma ry'ingenzi mbere yo gusinya.",
  },
  notAuthor: {
    en: "Only the author can do this.",
    fr: "Seul l'auteur peut faire ceci.",
    rw: "Uwanditse wenyine ni we ushobora kubikora.",
  },
  oneDiagnosis: {
    en: "Choose each diagnosis once, with one primary at most.",
    fr: "Choisissez chaque diagnostic une fois, avec un seul principal.",
    rw: "Hitamo isuzuma rimwe rimwe, ry'ingenzi rimwe gusa.",
  },
  stale: {
    en: "Someone else changed this record. It was reloaded.",
    fr: "Quelqu'un d'autre a modifié ce dossier. Il a été rechargé.",
    rw: "Undi muntu yahinduye iyi dosiye. Yongeye gufungurwa.",
  },
} as const;

interface MockRecord {
  fp: string;
  name: string;
  age: number;
  sex: "female" | "male";
  in_care: boolean;
  is_staff_member: boolean;
}

interface Store {
  consultations: Consultation[];
  vitals: Vitals[];
  reasons: Map<string, string>;
}

const daysAgo = (d: number, h = 0) =>
  new Date(Date.now() - d * 86_400_000 - h * 3_600_000).toISOString();

const RECORDS: MockRecord[] = [
  {
    fp: MOCK_CLINICAL_FP,
    name: "Mukamana Jeanne",
    age: 42,
    sex: "female",
    in_care: true,
    is_staff_member: false,
  },
  {
    fp: MOCK_STAFF_PATIENT_FP,
    name: "Habimana Eric",
    age: 47,
    sex: "male",
    in_care: true,
    is_staff_member: true,
  },
  {
    fp: MOCK_NO_CARE_FP,
    name: "Niyonsaba Claudine",
    age: 34,
    sex: "female",
    in_care: false,
    is_staff_member: false,
  },
];

const ALLERGY = {
  id: "a1000000-0000-4000-8000-000000000001",
  category: "drug" as const,
  substance: "Penicillin",
  reaction: "Hives",
  severity: "severe" as const,
  verification_status: "verified" as const,
};

function diagnosis(
  code: string,
  rank: Diagnosis["rank"],
  certainty: Diagnosis["certainty"],
  lang: LanguageCode = "en",
): Diagnosis {
  const row = ICD[code]!;
  return {
    id: id(),
    code,
    display: pick(row.title, lang),
    plain_language: pick(row.plain, lang),
    rank,
    certainty,
    is_sensitive: row.sensitive,
  };
}

function vitalsRow(visitId: string, at: string, values: Partial<Vitals>): Vitals {
  return {
    id: id(),
    visit_id: visitId,
    recorded_at: at,
    recorded_by_name: "Ingabire Grace",
    temperature_c: null,
    systolic_mmhg: null,
    diastolic_mmhg: null,
    pulse_bpm: null,
    respiratory_rate: null,
    spo2_pct: null,
    weight_kg: null,
    height_cm: null,
    muac_mm: null,
    is_entered_in_error: false,
    ...values,
  };
}

function consultation(
  record: MockRecord,
  visitId: string,
  extra: Partial<Consultation>,
): Consultation {
  return {
    id: id(),
    visit_id: visitId,
    facility_patient_id: record.fp,
    patient: { id: id(), display_name: record.name, age_years: record.age, sex: record.sex },
    author: DOCTOR,
    status: "draft",
    started_at: now(),
    signed_at: null,
    is_late_entry: false,
    is_restricted: false,
    suggest_restricted: false,
    history_text: "",
    examination_text: "",
    plan_text: "",
    patient_instructions_text: "",
    private_notes: "",
    diagnoses: [],
    vitals: [],
    addenda: [],
    allergies: [],
    no_known_allergies: null,
    content_hash: null,
    integrity: null,
    entered_in_error: null,
    can_edit: false,
    can_sign: false,
    version: 1,
    ...extra,
  };
}

function hash(): string {
  return Array.from({ length: 64 }, (_, i) => "0123456789abcdef"[(i * 7 + 3) % 16]).join("");
}

function seed(): Store {
  const jeanne = RECORDS[0]!;
  const signed = (days: number, extra: Partial<Consultation>) =>
    consultation(jeanne, id(), {
      status: "signed",
      started_at: daysAgo(days, 1),
      signed_at: daysAgo(days),
      content_hash: hash(),
      integrity: "ok",
      version: 3,
      ...extra,
    });
  const malaria = signed(40, {
    history_text: "Fever and headache for two days.",
    examination_text: "Temperature 38.9, no neck stiffness.",
    plan_text: "Artemether-lumefantrine for three days.",
    patient_instructions_text:
      "Drink plenty of water. Come back if the fever lasts more than two days.",
    private_notes: MOCK_PRIVATE_NOTE,
    diagnoses: [diagnosis("B54", "primary", "confirmed")],
  });
  const pressure = signed(20, {
    history_text: "Headaches in the morning.",
    plan_text: "Amlodipine 5 mg once a day.",
    patient_instructions_text:
      "Take the tablet every morning and check your blood pressure in a month.",
    diagnoses: [diagnosis("I10", "primary", "confirmed")],
    addenda: [
      {
        id: id(),
        author_name: DOCTOR.full_name,
        is_by_author: true,
        reason: "Result received",
        body: "Kidney function normal.",
        signed_at: daysAgo(18),
        content_hash: hash(),
      },
    ],
  });
  const cold = signed(5, {
    author: OTHER_DOCTOR,
    plan_text: "Rest and fluids.",
    patient_instructions_text: "Rest at home for two days.",
    diagnoses: [diagnosis("J06.9", "primary", "provisional")],
  });
  const draft = consultation(jeanne, id(), {
    started_at: daysAgo(1, 2),
    history_text: "Follow-up of blood pressure.",
  });
  return {
    consultations: [malaria, pressure, cold, draft],
    vitals: [
      vitalsRow(malaria.visit_id, daysAgo(40, 2), { temperature_c: "38.9", pulse_bpm: 102 }),
      vitalsRow(pressure.visit_id, daysAgo(20, 2), { systolic_mmhg: 152, diastolic_mmhg: 96 }),
    ],
    reasons: new Map(),
  };
}

const PATIENT_RECORDS: (PatientRecord & { restricted?: boolean })[] = [
  {
    id: "7d000000-0000-4000-8000-000000000001",
    patient_id: SELF_PATIENT_ID,
    facility_name: FACILITIES.kigaliClinic.name,
    service_date: daysAgo(40).slice(0, 10),
    doctor_name: DOCTOR.full_name,
    signed_at: daysAgo(40),
    diagnoses: [
      {
        code: "B54",
        plain_language: "Malaria",
        display: "Unspecified malaria",
        certainty: "confirmed",
        rank: "primary",
      },
    ],
    is_late_entry: false,
    history_text: "Fever and headache for two days.",
    plan_text: "Artemether-lumefantrine for three days.",
    patient_instructions_text:
      "Drink plenty of water. Come back if the fever lasts more than two days.",
    vitals: [
      {
        recorded_at: daysAgo(40, 2),
        temperature_c: "38.9",
        systolic_mmhg: null,
        diastolic_mmhg: null,
        pulse_bpm: 102,
        respiratory_rate: null,
        spo2_pct: null,
        weight_kg: null,
        height_cm: null,
        muac_mm: null,
      },
    ],
    addenda: [],
  },
  {
    id: "7d000000-0000-4000-8000-000000000002",
    patient_id: SELF_PATIENT_ID,
    facility_name: FACILITIES.kigaliClinic.name,
    service_date: daysAgo(20).slice(0, 10),
    doctor_name: DOCTOR.full_name,
    signed_at: daysAgo(20),
    diagnoses: [
      {
        code: "I10",
        plain_language: "High blood pressure",
        display: "Essential (primary) hypertension",
        certainty: "confirmed",
        rank: "primary",
      },
    ],
    is_late_entry: false,
    history_text: "Headaches in the morning.",
    plan_text: "Amlodipine 5 mg once a day.",
    patient_instructions_text:
      "Take the tablet every morning and check your blood pressure in a month.",
    vitals: [],
    addenda: [
      {
        author_name: DOCTOR.full_name,
        reason: "Result received",
        body: "Kidney function normal.",
        signed_at: daysAgo(18),
      },
    ],
  },
  {
    id: "7d000000-0000-4000-8000-000000000003",
    patient_id: CHILD_PATIENT_ID,
    facility_name: FACILITIES.kigaliClinic.name,
    service_date: daysAgo(10).slice(0, 10),
    doctor_name: DOCTOR.full_name,
    signed_at: daysAgo(10),
    diagnoses: [
      {
        code: "J06.9",
        plain_language: "Common cold",
        display: "Acute upper respiratory infection",
        certainty: "provisional",
        rank: "primary",
      },
    ],
    is_late_entry: false,
    history_text: "Cough for three days.",
    plan_text: "Rest and fluids.",
    patient_instructions_text: "Keep the child warm and give plenty to drink.",
    vitals: [],
    addenda: [],
  },
];

const rowOf = ({
  is_late_entry: _l,
  history_text: _h,
  plan_text: _p,
  patient_instructions_text: _i,
  vitals: _v,
  addenda: _a,
  ...row
}: PatientRecord): PatientRecordRow => row;

export const clinicalMocks: FeatureMockFactory = (context) => {
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
  const record = (fp: string) => RECORDS.find((r) => r.fp === fp);
  const needsReason = (r: MockRecord) => (r.is_staff_member || !r.in_care) && !db.reasons.has(r.fp);
  const reasonError = (lang: LanguageCode) =>
    context.errorResponse(403, "access_reason_required", msg("reasonRequired", lang));
  const isMine = (c: Consultation, me: { full_name: string }) =>
    c.author.full_name === me.full_name;
  const view = (
    c: Consultation,
    me: { full_name: string },
    granted: readonly string[],
  ): Consultation => {
    const draft = c.status === "draft";
    const mine = isMine(c, me);
    return {
      ...c,
      vitals: db.vitals.filter((v) => v.visit_id === c.visit_id && !v.is_entered_in_error),
      allergies: c.facility_patient_id === MOCK_CLINICAL_FP ? [ALLERGY] : [],
      no_known_allergies: null,
      suggest_restricted: c.diagnoses.some((d) => d.is_sensitive) && !c.is_restricted,
      can_edit: draft && mine && granted.includes("clinical.write"),
      can_sign: draft && mine && granted.includes("clinical.sign"),
    };
  };
  const find = (consultationId: unknown) => db.consultations.find((c) => c.id === consultationId);
  const resolve = (items: DiagnosisInput[], lang: LanguageCode): Diagnosis[] | null => {
    const codes = items.map((d) => d.code.toUpperCase());
    if (new Set(codes).size !== codes.length) return null;
    if (items.filter((d) => d.rank === "primary").length > 1) return null;
    if (codes.some((c) => !ICD[c])) return null;
    return items.map((d) => diagnosis(d.code.toUpperCase(), d.rank, d.certainty, lang));
  };

  return {
    reset() {
      db = seed();
    },
    handlers: [
      http.post(`${S}/visits/:visitId/consultation/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["clinical.write"]);
        if ("error" in ok) return ok.error;
        const visitId = String(params.visitId);
        const existing = db.consultations.find(
          (c) => c.visit_id === visitId && c.status === "draft" && isMine(c, ok.me),
        );
        if (existing) return HttpResponse.json(view(existing, ok.me, ok.granted));
        const created = consultation(RECORDS[0]!, visitId, {
          author: { ...DOCTOR, full_name: ok.me.full_name },
        });
        db.consultations.push(created);
        return HttpResponse.json(view(created, ok.me, ok.granted), { status: 201 });
      }),

      http.get(`${S}/consultations/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["clinical.unsigned_list"]);
        if ("error" in ok) return ok.error;
        const url = new URL(request.url);
        const everyone =
          ok.granted.includes("facility.configure") && url.searchParams.get("mine") !== "true";
        const rows: ConsultationRow[] = db.consultations
          .filter((c) => c.status === "draft" && (everyone || isMine(c, ok.me)))
          .sort((a, b) => a.started_at.localeCompare(b.started_at))
          .map((c) => ({
            id: c.id,
            visit_id: c.visit_id,
            facility_patient_id: c.facility_patient_id,
            patient_display_name: c.patient.display_name,
            service_date: c.started_at.slice(0, 10),
            author: c.author,
            status: c.status,
            started_at: c.started_at,
            is_overdue: Date.now() - Date.parse(c.started_at) > 86_400_000,
          }));
        return HttpResponse.json(page(rows, url));
      }),

      http.get(`${S}/consultations/:id/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["clinical.view"]);
        if ("error" in ok) return ok.error;
        const c = find(params.id);
        if (!c) return notFound(ok.lang);
        const r = record(c.facility_patient_id);
        if (r && needsReason(r)) return reasonError(ok.lang);
        return HttpResponse.json(view(c, ok.me, ok.granted));
      }),

      http.patch(`${S}/consultations/:id/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["clinical.write"]);
        if ("error" in ok) return ok.error;
        const c = find(params.id);
        if (!c) return notFound(ok.lang);
        const body = (await context.readJson(request)) ?? {};
        if (body.version !== c.version)
          return context.errorResponse(409, "conflict", msg("stale", ok.lang));
        if (c.status !== "draft")
          return context.errorResponse(422, "business_rule_violation", msg("locked", ok.lang));
        if (!isMine(c, ok.me))
          return context.errorResponse(422, "business_rule_violation", msg("notAuthor", ok.lang));
        if (Array.isArray(body.diagnoses)) {
          const resolved = resolve(body.diagnoses as DiagnosisInput[], ok.lang);
          if (!resolved)
            return context.errorResponse(
              422,
              "business_rule_violation",
              msg("oneDiagnosis", ok.lang),
              {
                fields: { diagnoses: [msg("oneDiagnosis", ok.lang)] },
              },
            );
          c.diagnoses = resolved;
        }
        for (const field of SECTION_FIELDS)
          if (typeof body[field] === "string")
            (c as Record<SectionField, string>)[field] = body[field];
        if (typeof body.is_restricted === "boolean") c.is_restricted = body.is_restricted;
        c.version += 1;
        return HttpResponse.json(view(c, ok.me, ok.granted));
      }),

      http.post(`${S}/consultations/:id/sign/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["clinical.sign"]);
        if ("error" in ok) return ok.error;
        const c = find(params.id);
        if (!c) return notFound(ok.lang);
        const step = stepUpFailure(context, ok.lang);
        if (step) return step;
        const body = (await context.readJson(request)) ?? {};
        if (body.version !== c.version)
          return context.errorResponse(409, "conflict", msg("stale", ok.lang));
        if (c.status !== "draft")
          return context.errorResponse(422, "business_rule_violation", msg("locked", ok.lang));
        if (!c.diagnoses.some((d) => d.rank === "primary"))
          return context.errorResponse(422, "business_rule_violation", msg("needPrimary", ok.lang));
        c.status = "signed";
        c.signed_at = now();
        c.is_late_entry = Date.now() - Date.parse(c.started_at) > 86_400_000;
        c.content_hash = hash();
        c.integrity = "ok";
        c.version += 1;
        return HttpResponse.json(view(c, ok.me, ok.granted));
      }),

      http.post(`${S}/consultations/:id/addenda/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["clinical.write"]);
        if ("error" in ok) return ok.error;
        const c = find(params.id);
        if (!c) return notFound(ok.lang);
        const step = stepUpFailure(context, ok.lang);
        if (step) return step;
        if (c.status !== "signed")
          return context.errorResponse(422, "business_rule_violation", msg("locked", ok.lang));
        const body = (await context.readJson(request)) ?? {};
        const reason = asText(body.reason).trim();
        const text = asText(body.body).trim();
        if (!reason || !text)
          return context.validationError(ok.lang, {
            ...(reason ? {} : { reason: "required" }),
            ...(text ? {} : { body: "required" }),
          });
        const addendum: Addendum = {
          id: id(),
          author_name: ok.me.full_name,
          is_by_author: isMine(c, ok.me),
          reason,
          body: text,
          signed_at: now(),
          content_hash: hash(),
        };
        c.addenda.push(addendum);
        return HttpResponse.json(addendum, { status: 201 });
      }),

      http.post(`${S}/consultations/:id/entered-in-error/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["clinical.amend_own"]);
        if ("error" in ok) return ok.error;
        const c = find(params.id);
        if (!c) return notFound(ok.lang);
        const step = stepUpFailure(context, ok.lang);
        if (step) return step;
        const body = (await context.readJson(request)) ?? {};
        if (body.version !== c.version)
          return context.errorResponse(409, "conflict", msg("stale", ok.lang));
        if (!isMine(c, ok.me) || c.status === "entered_in_error")
          return context.errorResponse(422, "business_rule_violation", msg("notAuthor", ok.lang));
        const reason = asText(body.reason).trim();
        if (!reason) return context.validationError(ok.lang, { reason: "required" });
        c.status = "entered_in_error";
        c.entered_in_error = { at: now(), reason, by_name: ok.me.full_name };
        c.version += 1;
        return HttpResponse.json(view(c, ok.me, ok.granted));
      }),

      http.get(`${S}/visits/:visitId/vitals/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["vitals.record", "clinical.view"]);
        if ("error" in ok) return ok.error;
        const rows = db.vitals.filter(
          (v) =>
            v.visit_id === params.visitId &&
            (ok.granted.includes("clinical.view") || v.recorded_by_name === ok.me.full_name),
        );
        return HttpResponse.json({ results: rows });
      }),

      http.post(`${S}/visits/:visitId/vitals/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["vitals.record"]);
        if ("error" in ok) return ok.error;
        const body = (await context.readJson(request)) ?? {};
        const values: Partial<Vitals> = {};
        const errors: Record<string, string> = {};
        for (const field of VITAL_FIELDS) {
          const raw = body[field];
          if (raw === undefined || raw === null || raw === "") continue;
          const n = Number(raw);
          const [low, high] = VITAL_RANGES[field];
          if (!Number.isFinite(n) || n < low || n > high) errors[field] = "range";
          else (values as Record<string, unknown>)[field] = typeof raw === "string" ? raw : n;
        }
        if (!Object.keys(values).length && !Object.keys(errors).length)
          errors.non_field_errors = "required";
        if (Object.keys(errors).length)
          return context.errorResponse(
            400,
            "validation_error",
            context.message("validation", ok.lang),
            {
              fields: Object.fromEntries(
                Object.entries(errors).map(([k, v]) => [
                  k,
                  [
                    v === "range"
                      ? `Between ${VITAL_RANGES[k as keyof typeof VITAL_RANGES]?.join(" and ")}.`
                      : "Enter at least one value.",
                  ],
                ]),
              ),
            },
          );
        const row = vitalsRow(String(params.visitId), now(), {
          ...values,
          recorded_by_name: ok.me.full_name,
        });
        db.vitals.push(row);
        return HttpResponse.json(row, { status: 201 });
      }),

      http.post(`${S}/vitals/:id/entered-in-error/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["vitals.record", "clinical.write"]);
        if ("error" in ok) return ok.error;
        const row = db.vitals.find((v) => v.id === params.id);
        if (!row) return notFound(ok.lang);
        row.is_entered_in_error = true;
        return HttpResponse.json(row);
      }),

      http.get(`${S}/clinical/patients/:fp/access/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["clinical.view"]);
        if ("error" in ok) return ok.error;
        const r = record(String(params.fp));
        if (!r) return notFound(ok.lang);
        return HttpResponse.json({
          has_relationship: r.in_care,
          is_staff_member: r.is_staff_member,
          reason_required: needsReason(r),
          granted_until: db.reasons.get(r.fp) ?? null,
        });
      }),

      http.post(`${S}/clinical/patients/:fp/access-reasons/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["clinical.view"]);
        if ("error" in ok) return ok.error;
        const r = record(String(params.fp));
        if (!r) return notFound(ok.lang);
        const body = (await context.readJson(request)) ?? {};
        if (body.reason_code === "other" && !asText(body.reason_text).trim())
          return context.errorResponse(
            422,
            "business_rule_violation",
            "Say why you need this record.",
            {
              fields: { reason_text: ["Say why you need this record."] },
            },
          );
        const until = new Date(Date.now() + 120 * 60_000).toISOString();
        db.reasons.set(r.fp, until);
        return HttpResponse.json({ granted_until: until }, { status: 201 });
      }),

      http.get(`${S}/clinical/patients/:fp/history/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["clinical.view"]);
        if ("error" in ok) return ok.error;
        const r = record(String(params.fp));
        if (!r) return notFound(ok.lang);
        if (needsReason(r)) return reasonError(ok.lang);
        const url = new URL(request.url);
        const type = url.searchParams.get("type") ?? "";
        const code = (url.searchParams.get("code") ?? "").toUpperCase();
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        const service = {
          en: "General consultation",
          rw: "Isuzuma rusange",
          fr: "Consultation générale",
        };
        const items: HistoryItem[] = [];
        if (type !== "vitals")
          for (const c of db.consultations.filter(
            (x) =>
              x.facility_patient_id === r.fp &&
              (x.status === "signed" || (x.status === "draft" && isMine(x, ok.me))) &&
              (!code || x.diagnoses.some((d) => d.code.startsWith(code))),
          ))
            items.push({
              kind: "consultation",
              id: c.id,
              occurred_at: c.signed_at ?? c.started_at,
              visit_id: c.visit_id,
              service_name_i18n: service,
              author_name: c.author.full_name,
              status: c.status,
              is_restricted: c.is_restricted,
              is_late_entry: c.is_late_entry,
              diagnoses: c.diagnoses.map(({ code: dc, display, certainty, rank }) => ({
                code: dc,
                display,
                certainty,
                rank,
              })),
              addenda_count: c.addenda.length,
              vitals: null,
            });
        if (type !== "consultation" && !code && r.fp === MOCK_CLINICAL_FP)
          for (const v of db.vitals.filter((x) => !x.is_entered_in_error))
            items.push({
              kind: "vitals",
              id: v.id,
              occurred_at: v.recorded_at,
              visit_id: v.visit_id,
              service_name_i18n: service,
              author_name: v.recorded_by_name,
              status: null,
              is_restricted: false,
              is_late_entry: false,
              diagnoses: [],
              addenda_count: 0,
              vitals: v,
            });
        const filtered = items
          .filter(
            (i) =>
              (!from || i.occurred_at.slice(0, 10) >= from) &&
              (!to || i.occurred_at.slice(0, 10) <= to),
          )
          .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
        return HttpResponse.json(page(filtered, url));
      }),

      http.get(`${S}/clinical/patients/:fp/problem-summary/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["clinical.view"]);
        if ("error" in ok) return ok.error;
        const r = record(String(params.fp));
        if (!r) return notFound(ok.lang);
        if (needsReason(r)) return reasonError(ok.lang);
        const main = r.fp === MOCK_CLINICAL_FP;
        const seen = new Map<string, ProblemSummary["recent_diagnoses"][number]>();
        for (const c of db.consultations
          .filter((x) => x.facility_patient_id === r.fp && x.status === "signed")
          .sort((a, b) => (b.signed_at ?? "").localeCompare(a.signed_at ?? "")))
          for (const d of c.diagnoses)
            if (!seen.has(d.code))
              seen.set(d.code, {
                code: d.code,
                display: d.display,
                certainty: d.certainty,
                last_seen_at: c.signed_at!,
              });
        const summary: ProblemSummary = {
          allergies: main ? [ALLERGY] : [],
          no_known_allergies: main ? null : true,
          conditions: main
            ? [{ id: id(), display: "Hypertension", verification_status: "verified", detail: null }]
            : [],
          medications: main
            ? [
                {
                  id: id(),
                  display: "Amlodipine",
                  verification_status: "verified",
                  detail: "5 mg once a day",
                },
              ]
            : [],
          recent_diagnoses: [...seen.values()],
          is_staff_member: r.is_staff_member,
        };
        return HttpResponse.json(summary);
      }),

      http.post(`${S}/clinical/alerts/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["clinical.write", "prescription.issue"]);
        if ("error" in ok) return ok.error;
        const body = ((await context.readJson(request)) ?? {}) as {
          facility_patient_id?: string;
          items?: { drug_code: string; quantity?: number }[];
        };
        const r = record(String(body.facility_patient_id));
        if (!r) return notFound(ok.lang);
        if (needsReason(r)) return reasonError(ok.lang);
        const alerts: ClinicalAlert[] = [];
        const seen = new Set<string>();
        for (const item of body.items ?? []) {
          const drug = DRUGS[item.drug_code];
          if (!drug)
            return context.validationError(ok.lang, { items: [`Unknown drug: ${item.drug_code}`] });
          const base = {
            drug_code: item.drug_code,
            allergy_id: null,
            substance: null,
            verification_status: null,
            max_usual_quantity: null,
          };
          if (r.fp === MOCK_CLINICAL_FP && drug.klass === "penicillin")
            alerts.push({
              ...base,
              kind: "allergy",
              severity: "high",
              allergy_id: ALLERGY.id,
              substance: ALLERGY.substance,
              verification_status: "verified",
            });
          if (seen.has(drug.name) || (r.fp === MOCK_CLINICAL_FP && drug.name === "Amlodipine"))
            alerts.push({ ...base, kind: "duplicate", severity: "medium" });
          seen.add(drug.name);
          if (item.quantity && drug.max && item.quantity > drug.max)
            alerts.push({
              ...base,
              kind: "dose",
              severity: "medium",
              max_usual_quantity: drug.max,
            });
        }
        return HttpResponse.json({ alerts });
      }),

      // ---- patient (PR1, PR2): never private notes or examination
      http.get(`${api}/patient/records/`, async ({ request }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const auth = context.authenticatedPatient(lang);
        if ("error" in auth) return auth.error;
        const profiles = new Set(auth.me.profiles.map((p) => p.patient_id));
        const url = new URL(request.url);
        const wanted = url.searchParams.get("patient_id");
        const rows = PATIENT_RECORDS.filter(
          (r) => profiles.has(r.patient_id) && (!wanted || r.patient_id === wanted),
        )
          .sort((a, b) => b.signed_at.localeCompare(a.signed_at))
          .map(rowOf);
        return HttpResponse.json(page(rows, url));
      }),

      http.get(`${api}/patient/records/:id/`, async ({ request, params }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const auth = context.authenticatedPatient(lang);
        if ("error" in auth) return auth.error;
        const profiles = new Set(auth.me.profiles.map((p) => p.patient_id));
        const found = PATIENT_RECORDS.find((r) => r.id === params.id && profiles.has(r.patient_id));
        if (!found) return notFound(lang);
        return HttpResponse.json(found);
      }),
    ],
  };
};
