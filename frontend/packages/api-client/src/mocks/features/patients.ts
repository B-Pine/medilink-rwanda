import { http, HttpResponse } from "msw";

import type {
  ExternalMatch,
  FacilityPatientDetail,
  HealthItem,
  HealthKind,
  InsuranceProfile,
  MatchLevel,
  MergeRequest,
  MergeSide,
  PatientSummary,
} from "../../features/patients";
import type { LanguageCode, StaffMe } from "../../types";
import { extendMockRoleGrants, FACILITIES, ROLE_PERMISSIONS, STAFF_USERS } from "../data";
import type { FeatureMockFactory } from "../features";
import type { MockContext } from "../handlers";
import {
  ageYears,
  createPatientsStore,
  mask,
  maskPhone,
  medilinkNumber,
  normalizeMedilinkNumber,
  normalizeName,
  normalizePhone,
  similarity,
  type MockFacilityRecord,
  type MockPatient,
  type PatientsStore,
} from "./patients-store";
import { page, platformAdmin, s1, str } from "./s1-common";

/** S3 staff patients and merges mocks (sprint-03 §3.3, §3.4). */

// Mirrors backend medilink.patients.permissions.ROLE_GRANTS
extendMockRoleGrants({
  receptionist: [
    "patients.view",
    "patients.identifier_reveal",
    "patients.insurance_verify",
    "patients.merge_request",
  ],
  facility_admin: [
    "patients.view",
    "patients.identifier_reveal",
    "patients.insurance_verify",
    "patients.merge_approve",
  ],
  doctor: ["patients.view"],
});

const MESSAGES = {
  duplicate: {
    en: "This patient may already be registered here. Check the matches first.",
    fr: "Ce patient est peut-être déjà enregistré ici. Vérifiez les correspondances.",
    rw: "Uyu murwayi ashobora kuba yaranditswe hano. Banza urebe abasa na we.",
  },
  existsElsewhere: {
    en: "This patient is already on MediLink. Add them to this facility instead.",
    fr: "Ce patient est déjà sur MediLink. Ajoutez-le plutôt à cet établissement.",
    rw: "Uyu murwayi asanzwe kuri MediLink. Mwongere kuri iki kigo.",
  },
  fileNumber: {
    en: "Another patient here has this file number.",
    fr: "Un autre patient a déjà ce numéro de dossier.",
    rw: "Undi murwayi afite iyi nomero ya dosiye.",
  },
  identifierTaken: {
    en: "Another patient has this document. Request a merge instead.",
    fr: "Un autre patient a ce document. Demandez une fusion.",
    rw: "Undi murwayi afite iyi nyandiko. Saba guhuza.",
  },
  proof: {
    en: "The proof doesn't match this patient.",
    fr: "La preuve ne correspond pas à ce patient.",
    rw: "Ikimenyetso ntigihuye n'uyu murwayi.",
  },
  phone: {
    en: "Enter a Rwandan mobile number like 0788 123 456",
    fr: "Saisissez un numéro mobile rwandais, par ex. 0788 123 456",
    rw: "Andika nimero ya telefoni nka 0788 123 456",
  },
  nationalId: {
    en: "A national ID has 16 digits",
    fr: "Un numéro d'identité national compte 16 chiffres",
    rw: "Indangamuntu igira imibare 16",
  },
  reason: { en: "Say why you need it.", fr: "Indiquez pourquoi.", rw: "Vuga impamvu." },
  requester: {
    en: "Another approver has to decide on your own request.",
    fr: "Un autre approbateur doit décider de votre demande.",
    rw: "Undi muntu agomba kwemeza ubusabe bwawe.",
  },
  platformOnly: {
    en: "This request needs the platform team.",
    fr: "Cette demande relève de l'équipe plateforme.",
    rw: "Ubu busabe bukeneye itsinda rya platform.",
  },
  otherApprover: {
    en: "Someone else here can approve this request.",
    fr: "Quelqu'un d'autre ici peut approuver cette demande.",
    rw: "Hari undi hano ushobora kwemeza ubu busabe.",
  },
  openRequest: {
    en: "There is already an open merge request for one of these patients.",
    fr: "Une demande de fusion est déjà ouverte pour l'un de ces patients.",
    rw: "Hari ubusabe bwo guhuza busanzwe kuri umwe muri aba barwayi.",
  },
} as const;

type MessageKey = keyof typeof MESSAGES;
const msg = (key: MessageKey, lang: LanguageCode) => MESSAGES[key][lang];

let shared: PatientsStore | null = null;
/** The store shared by the staff and patient S3 mocks. */
export function patientsStore(): PatientsStore {
  shared ??= createPatientsStore();
  return shared;
}
export function resetPatientsStore() {
  shared = createPatientsStore();
}

const HEALTH_KIND = {
  allergies: "allergy",
  conditions: "condition",
  medications: "medication",
} as const;

function insuranceBadges(patient: MockPatient) {
  return patient.insurance
    .filter((p) => p.is_active)
    .map((p) => ({ insurer_code: p.insurer_code, status: p.status, is_expired: p.is_expired }));
}

export function summary(
  store: PatientsStore,
  record: MockFacilityRecord,
  match: string | null = null,
): PatientSummary {
  const patient = store.patients.get(record.patient_id)!;
  const nid = patient.identifiers.find((i) => i.kind === "national_id");
  return {
    facility_patient_id: record.id,
    patient_id: patient.id,
    medilink_number: patient.medilink_number,
    file_number: record.file_number,
    full_name: patient.full_name,
    preferred_name: patient.preferred_name,
    sex: patient.sex,
    date_of_birth: patient.date_of_birth,
    is_birth_date_estimated: patient.is_birth_date_estimated,
    age_years: ageYears(patient.date_of_birth),
    phone_masked: maskPhone(patient.phone_e164),
    national_id_masked: nid ? nid.masked_value : null,
    insurance: insuranceBadges(patient),
    has_account: store.links.some(
      (l) => l.patient_id === patient.id && l.relationship === "self" && !l.revoked,
    ),
    is_staff_member: record.is_staff_member,
    match,
  };
}

function detail(store: PatientsStore, record: MockFacilityRecord): FacilityPatientDetail {
  const patient = store.patients.get(record.patient_id)!;
  const contact = patient.emergency_contact;
  return {
    ...summary(store, record),
    address: patient.address,
    email: patient.email,
    emergency_contact: contact ? { ...contact, phone_e164: maskPhone(contact.phone_e164)! } : null,
    reception_notes: record.reception_notes,
    identifiers: patient.identifiers.map(({ value: _value, ...rest }) => rest),
    has_care_consent: patient.consents.some((c) => c.kind === "care" && c.granted),
    open_claim_reference:
      store.claims.find((c) => c.patient_id === patient.id && c.status === "awaiting_reception")
        ?.reference ?? null,
    is_active: record.is_active,
    merged_into_facility_patient_id: record.merged_into,
    version: record.version,
    patient_version: patient.version,
  };
}

function external(patient: MockPatient, matchedOn: string): ExternalMatch {
  return {
    patient_ref: patient.id,
    full_name: patient.full_name,
    birth_year: patient.date_of_birth ? Number(patient.date_of_birth.slice(0, 4)) : null,
    sex: patient.sex,
    medilink_number: patient.medilink_number,
    matched_on: matchedOn,
  };
}

function resolve(store: PatientsStore, patient: MockPatient | undefined): MockPatient | undefined {
  let current = patient;
  while (current?.merged_into) current = store.patients.get(current.merged_into);
  return current;
}

function byIdentifier(store: PatientsStore, kind: string, value: string): MockPatient | undefined {
  const clean = value.replace(/[\s\-.]/g, "").toUpperCase();
  for (const patient of store.patients.values()) {
    if (patient.identifiers.some((i) => i.kind === kind && i.value === clean))
      return resolve(store, patient);
  }
  return undefined;
}

function byNumber(store: PatientsStore, value: string): MockPatient | undefined {
  const number = normalizeMedilinkNumber(value);
  if (!number) return undefined;
  return resolve(
    store,
    [...store.patients.values()].find((p) => p.medilink_number === number),
  );
}

function staff(context: MockContext, request: Request, codes: string[]) {
  const lang = context.languageFrom(request);
  const result = context.authenticatedStaff(lang);
  if ("error" in result) return { lang, error: result.error };
  const me: StaffMe = result.me;
  if (!me.active_facility_id || !codes.some((c) => (me.permissions as string[]).includes(c)))
    return {
      lang,
      error: context.errorResponse(403, "permission_denied", s1("permissionDenied", lang)),
    };
  return { lang, me, facilityId: me.active_facility_id };
}

function fieldConflict(context: MockContext, lang: LanguageCode, field: string, key: MessageKey) {
  return context.errorResponse(409, "conflict", msg(key, lang), {
    fields: { [field]: [msg(key, lang)] },
  });
}

function birth(body: Record<string, unknown>): { dob: string | null; estimated: boolean } {
  if (body.date_of_birth) return { dob: str(body.date_of_birth), estimated: false };
  const years = body.estimated_age_years;
  const months = body.estimated_age_months;
  const today = new Date();
  if (typeof years === "number")
    return { dob: `${today.getFullYear() - years}-01-01`, estimated: true };
  if (typeof months === "number") {
    const d = new Date(today.getFullYear(), today.getMonth() - months, 1);
    return { dob: d.toISOString().slice(0, 10), estimated: true };
  }
  return { dob: null, estimated: false };
}

export function findMatches(
  store: PatientsStore,
  facilityId: string,
  body: Record<string, unknown>,
) {
  const matches: { level: MatchLevel; record: MockFacilityRecord; on: string }[] = [];
  let externalMatch: ExternalMatch | null = null;
  let elsewhere = 0;
  const seen = new Set<string>();
  const here = (patient: MockPatient) =>
    store.records.find(
      (r) => r.facility_id === facilityId && r.patient_id === patient.id && r.is_active,
    );
  const ident = body.identifier as { kind?: string; value?: string } | undefined;
  const exact: [MockPatient | undefined, string][] = [];
  if (ident?.value)
    exact.push([byIdentifier(store, str(ident.kind), str(ident.value)), str(ident.kind)]);
  if (body.medilink_number)
    exact.push([byNumber(store, str(body.medilink_number)), "medilink_number"]);
  for (const [patient, on] of exact) {
    if (!patient || seen.has(patient.id)) continue;
    seen.add(patient.id);
    const record = here(patient);
    if (record) matches.push({ level: "exact_identifier", record, on });
    else externalMatch ??= external(patient, on);
  }
  const name = normalizeName(str(body.full_name));
  const phone = normalizePhone(str(body.phone_e164) || null);
  const { dob } = birth(body);
  if (name || (phone && phone !== "invalid")) {
    for (const patient of store.patients.values()) {
      if (patient.merged_into || seen.has(patient.id)) continue;
      const score = name ? similarity(normalizeName(patient.full_name), name) : 0;
      const samePhone = Boolean(phone && phone !== "invalid" && patient.phone_e164 === phone);
      const sameDob = Boolean(dob && patient.date_of_birth === dob);
      let level: MatchLevel | null = null;
      if ((score >= 0.6 && (sameDob || samePhone)) || (samePhone && sameDob)) level = "strong";
      else if (
        score >= 0.45 &&
        (samePhone ||
          (dob &&
            patient.date_of_birth &&
            Math.abs(Number(patient.date_of_birth.slice(0, 4)) - Number(dob.slice(0, 4))) <= 2))
      )
        level = "possible";
      if (level === "strong" && body.sex && patient.sex && patient.sex !== body.sex)
        level = "possible";
      if (!level) continue;
      const record = here(patient);
      if (record) matches.push({ level, record, on: "name" });
      else if (store.records.some((r) => r.patient_id === patient.id && r.is_active)) elsewhere++;
    }
  }
  const order = { exact_identifier: 0, strong: 1, possible: 2 };
  matches.sort((a, b) => order[a.level] - order[b.level]);
  return { matches, externalMatch, elsewhere };
}

function mergeSide(store: PatientsStore, patientId: string, recordId: string | null): MergeSide {
  const patient = store.patients.get(patientId)!;
  const record = store.records.find((r) => r.id === recordId);
  return {
    patient_id: patient.id,
    medilink_number: patient.medilink_number,
    full_name: patient.full_name,
    date_of_birth: patient.date_of_birth,
    sex: patient.sex,
    file_number: record?.file_number ?? null,
  };
}

function knownElsewhere(store: PatientsStore, patientId: string, facilityId: string) {
  return store.records.some(
    (r) => r.patient_id === patientId && r.facility_id !== facilityId && r.is_active,
  );
}

export const patientsMocks: FeatureMockFactory = (context) => {
  const { api } = context;
  const base = `${api}/staff/patients`;
  const store = () => patientsStore();

  const record = (facilityId: string, fpId: string) =>
    store().records.find((r) => r.id === fpId && r.facility_id === facilityId);

  const notFound = (lang: LanguageCode) =>
    context.errorResponse(404, "not_found", context.message("notFound", lang));

  const unsafe = async (request: Request, codes: string[]) => {
    await context.settle();
    const auth = staff(context, request, codes);
    if ("error" in auth) return auth;
    const csrf = context.csrfFailure(request, auth.lang);
    if (csrf) return { lang: auth.lang, error: csrf };
    return auth;
  };

  const executeMerge = (merge: PatientsStore["merges"][number]) => {
    const s = store();
    const merged = s.patients.get(merge.merged.patient_id)!;
    const survivor = s.patients.get(merge.surviving.patient_id)!;
    merged.merged_into = survivor.id;
    for (const r of s.records.filter((r) => r.patient_id === merged.id)) {
      const mine = s.records.find(
        (x) => x.facility_id === r.facility_id && x.patient_id === survivor.id && x.is_active,
      );
      if (mine) {
        r.is_active = false;
        r.merged_into = mine.id;
      } else r.patient_id = survivor.id;
    }
    merge.status = "executed";
    merge.executed_at = new Date().toISOString();
    merge.version++;
  };

  return {
    reset: resetPatientsStore,
    handlers: [
      http.post(`${base}/search/`, async ({ request }) => {
        const auth = await unsafe(request, ["patients.view"]);
        if ("error" in auth) return auth.error;
        const body = await context.readJson(request);
        const s = store();
        const q = str(body.query).trim();
        let by = str(body.by) || "auto";
        if (by === "auto") {
          if (normalizeMedilinkNumber(q)) by = "medilink_number";
          else if (/^\d{16}$/.test(q.replace(/[\s\-.]/g, ""))) by = "national_id";
          else if (normalizePhone(q) && normalizePhone(q) !== "invalid") by = "phone";
          else if (/\d/.test(q)) by = "file_number";
          else by = "name";
        }
        const here = s.records.filter((r) => r.facility_id === auth.facilityId);
        let results: PatientSummary[] = [];
        let externalMatch: ExternalMatch | null = null;
        if (by === "national_id" || by === "identifier" || by === "medilink_number") {
          const patient =
            by === "medilink_number"
              ? byNumber(s, q)
              : byIdentifier(s, by === "national_id" ? "national_id" : str(body.kind), q);
          if (patient) {
            const r = here.find((x) => x.patient_id === patient.id && x.is_active);
            if (r) results = [summary(s, r, by)];
            else externalMatch = external(patient, by);
          }
        } else if (by === "phone") {
          const phone = normalizePhone(q);
          results = here
            .filter((r) => r.is_active && s.patients.get(r.patient_id)!.phone_e164 === phone)
            .map((r) => summary(s, r, "phone"));
        } else if (by === "file_number") {
          results = here
            .filter((r) => r.file_number?.toLowerCase() === q.toLowerCase())
            .map((r) => {
              let target = r;
              while (target.merged_into)
                target = s.records.find((x) => x.id === target.merged_into)!;
              return summary(s, target, "file_number");
            });
        } else {
          const name = normalizeName(q);
          results = here
            .filter((r) => r.is_active)
            .map((r) => ({
              r,
              score: similarity(normalizeName(s.patients.get(r.patient_id)!.full_name), name),
            }))
            .filter((x) => x.score >= 0.3)
            .sort((a, b) => b.score - a.score)
            .map((x) => summary(s, x.r, "name"));
        }
        return HttpResponse.json({ results: results.slice(0, 20), external_match: externalMatch });
      }),

      http.post(`${base}/duplicate-checks/`, async ({ request }) => {
        const auth = await unsafe(request, ["patient.register"]);
        if ("error" in auth) return auth.error;
        const body = await context.readJson(request);
        const s = store();
        const found = findMatches(s, auth.facilityId, body);
        return HttpResponse.json({
          matches: found.matches.map((m) => ({
            level: m.level,
            patient: summary(s, m.record, m.on),
          })),
          external_match: found.externalMatch,
          other_facility_possible_count: found.elsewhere,
        });
      }),

      http.post(`${base}/`, async ({ request }) => {
        const auth = await unsafe(request, ["patient.register"]);
        if ("error" in auth) return auth.error;
        const { lang, facilityId } = auth;
        const body = await context.readJson(request);
        const s = store();
        const errors: Record<string, string> = {};
        if (!str(body.full_name).trim()) errors.full_name = context.message("required", lang);
        if (!body.sex) errors.sex = context.message("required", lang);
        const { dob, estimated } = birth(body);
        if (!dob) errors.date_of_birth = context.message("required", lang);
        const phone = normalizePhone(str(body.phone_e164) || null);
        if (phone === "invalid") errors.phone_e164 = msg("phone", lang);
        const consent = body.care_consent as { granted?: boolean; version?: string } | undefined;
        if (!consent?.granted) errors.care_consent = context.message("required", lang);
        const ident = body.identifier as { kind?: string; value?: string } | undefined;
        if (
          ident?.value &&
          ident.kind === "national_id" &&
          !/^\d{16}$/.test(str(ident.value).replace(/[\s\-.]/g, ""))
        )
          errors["identifier.value"] = msg("nationalId", lang);
        if (Object.keys(errors).length)
          return context.errorResponse(
            400,
            "validation_error",
            context.message("validation", lang),
            {
              fields: Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [v]])),
            },
          );
        if (ident?.value && byIdentifier(s, str(ident.kind), str(ident.value)))
          return fieldConflict(context, lang, "identifier", "existsElsewhere");
        const fileNumber = str(body.file_number).trim() || null;
        if (
          fileNumber &&
          s.records.some((r) => r.facility_id === facilityId && r.file_number === fileNumber)
        )
          return fieldConflict(context, lang, "file_number", "fileNumber");
        const found = findMatches(s, facilityId, body);
        if (found.matches.some((m) => m.level !== "possible") && !body.confirm_not_duplicate)
          return fieldConflict(context, lang, "non_field_errors", "duplicate");
        const seed = s.nextSeed++;
        const patient: MockPatient = {
          id: crypto.randomUUID(),
          medilink_number: medilinkNumber(seed),
          full_name: str(body.full_name).trim(),
          preferred_name: null,
          sex: body.sex as MockPatient["sex"],
          date_of_birth: dob,
          is_birth_date_estimated: estimated,
          phone_e164: phone,
          email: null,
          address: null,
          emergency_contact: null,
          no_known_allergies: null,
          merged_into: null,
          version: 1,
          identifiers: [],
          insurance: [],
          allergies: [],
          conditions: [],
          medications: [],
          consents: [
            {
              id: crypto.randomUUID(),
              kind: "care",
              patient_id: null,
              granted: true,
              version: str(consent?.version),
              granted_at: new Date().toISOString(),
              channel: "staff_assisted",
            },
          ],
          history: [],
        };
        if (ident?.value) {
          const value = str(ident.value)
            .replace(/[\s\-.]/g, "")
            .toUpperCase();
          patient.identifiers.push({
            id: crypto.randomUUID(),
            kind: ident.kind as MockPatient["identifiers"][number]["kind"],
            issuing_country:
              ident.kind === "national_id"
                ? "RW"
                : str((ident as Record<string, unknown>).issuing_country).toUpperCase(),
            masked_value: mask(value.slice(-4)),
            is_verified: false,
            verified_at: null,
            value,
          });
        }
        s.patients.set(patient.id, patient);
        const rec: MockFacilityRecord = {
          id: crypto.randomUUID(),
          facility_id: facilityId,
          patient_id: patient.id,
          file_number: fileNumber,
          reception_notes: null,
          is_staff_member: false,
          is_active: true,
          merged_into: null,
          version: 1,
        };
        s.records.push(rec);
        return HttpResponse.json(detail(s, rec), { status: 201 });
      }),

      http.post(`${base}/add-existing/`, async ({ request }) => {
        const auth = await unsafe(request, ["patient.register"]);
        if ("error" in auth) return auth.error;
        const { lang, facilityId } = auth;
        const body = await context.readJson(request);
        const s = store();
        const patient = resolve(s, s.patients.get(str(body.patient_ref)));
        const proof = (body.proof ?? {}) as {
          medilink_number?: string;
          identifier?: { kind: string; value: string };
        };
        const proven = proof.medilink_number
          ? byNumber(s, proof.medilink_number)
          : proof.identifier
            ? byIdentifier(s, proof.identifier.kind, proof.identifier.value)
            : undefined;
        if (!patient || proven?.id !== patient.id)
          return context.errorResponse(422, "business_rule_violation", msg("proof", lang), {
            fields: { proof: [msg("proof", lang)] },
          });
        const existing = s.records.find(
          (r) => r.facility_id === facilityId && r.patient_id === patient.id,
        );
        if (existing) return HttpResponse.json(detail(s, existing));
        const rec: MockFacilityRecord = {
          id: crypto.randomUUID(),
          facility_id: facilityId,
          patient_id: patient.id,
          file_number: str(body.file_number).trim() || null,
          reception_notes: null,
          is_staff_member: false,
          is_active: true,
          merged_into: null,
          version: 1,
        };
        s.records.push(rec);
        return HttpResponse.json(detail(s, rec), { status: 201 });
      }),

      http.get(`${base}/:fp/`, async ({ request, params }) => {
        await context.settle();
        const auth = staff(context, request, ["patients.view"]);
        if ("error" in auth) return auth.error;
        const rec = record(auth.facilityId, str(params.fp));
        return rec ? HttpResponse.json(detail(store(), rec)) : notFound(auth.lang);
      }),

      http.patch(`${base}/:fp/`, async ({ request, params }) => {
        const auth = await unsafe(request, ["patient.register"]);
        if ("error" in auth) return auth.error;
        const rec = record(auth.facilityId, str(params.fp));
        if (!rec) return notFound(auth.lang);
        const s = store();
        const patient = s.patients.get(rec.patient_id)!;
        const body = await context.readJson(request);
        if (body.version !== rec.version || body.patient_version !== patient.version)
          return context.errorResponse(409, "conflict", s1("conflict", auth.lang));
        if ("phone_e164" in body) {
          const phone = normalizePhone(str(body.phone_e164) || null);
          if (phone === "invalid")
            return context.errorResponse(
              400,
              "validation_error",
              context.message("validation", auth.lang),
              {
                fields: { phone_e164: [msg("phone", auth.lang)] },
              },
            );
          body.phone_e164 = phone;
        }
        const fields = [
          "full_name",
          "preferred_name",
          "sex",
          "date_of_birth",
          "is_birth_date_estimated",
          "phone_e164",
          "email",
          "address",
          "emergency_contact",
        ] as const;
        let changed = false;
        for (const f of fields)
          if (f in body) {
            (patient as unknown as Record<string, unknown>)[f] = body[f];
            changed = true;
          }
        if (changed) patient.version++;
        for (const f of ["file_number", "reception_notes"] as const)
          if (f in body) rec[f] = (body[f] as string | null) ?? null;
        rec.version++;
        return HttpResponse.json(detail(s, rec));
      }),

      http.post(`${base}/:fp/identifiers/`, async ({ request, params }) => {
        const auth = await unsafe(request, ["patient.register"]);
        if ("error" in auth) return auth.error;
        const rec = record(auth.facilityId, str(params.fp));
        if (!rec) return notFound(auth.lang);
        const s = store();
        const body = await context.readJson(request);
        const kind = str(body.kind);
        const value = str(body.value)
          .replace(/[\s\-.]/g, "")
          .toUpperCase();
        if (kind === "national_id" && !/^\d{16}$/.test(value))
          return context.errorResponse(
            400,
            "validation_error",
            context.message("validation", auth.lang),
            {
              fields: { value: [msg("nationalId", auth.lang)] },
            },
          );
        const holder = byIdentifier(s, kind, value);
        if (holder && holder.id !== rec.patient_id)
          return fieldConflict(context, auth.lang, "value", "identifierTaken");
        const patient = s.patients.get(rec.patient_id)!;
        patient.identifiers = patient.identifiers.filter((i) => i.kind !== kind);
        const identifier = {
          id: crypto.randomUUID(),
          kind: kind as MockPatient["identifiers"][number]["kind"],
          issuing_country: kind === "national_id" ? "RW" : str(body.issuing_country).toUpperCase(),
          masked_value: mask(value.slice(-4)),
          is_verified: Boolean(body.seen_document),
          verified_at: body.seen_document ? new Date().toISOString() : null,
          value,
        };
        patient.identifiers.push(identifier);
        const { value: _v, ...shown } = identifier;
        return HttpResponse.json(shown, { status: 201 });
      }),

      http.post(`${base}/:fp/reveal/`, async ({ request, params }) => {
        const auth = await unsafe(request, ["patients.view"]);
        if ("error" in auth) return auth.error;
        const rec = record(auth.facilityId, str(params.fp));
        if (!rec) return notFound(auth.lang);
        const body = await context.readJson(request);
        if (body.reason_code === "other" && !str(body.reason_text).trim())
          return context.errorResponse(
            400,
            "validation_error",
            context.message("validation", auth.lang),
            {
              fields: { reason_text: [msg("reason", auth.lang)] },
            },
          );
        const patient = store().patients.get(rec.patient_id)!;
        let value: string | undefined;
        if (body.field === "phone") value = patient.phone_e164 ?? undefined;
        else {
          if (!(auth.me.permissions as string[]).includes("patients.identifier_reveal"))
            return context.errorResponse(
              403,
              "permission_denied",
              s1("permissionDenied", auth.lang),
            );
          value = patient.identifiers.find((i) => i.id === body.identifier_id)?.value;
        }
        if (!value) return notFound(auth.lang);
        return HttpResponse.json({ value }, { headers: { "Cache-Control": "no-store" } });
      }),

      http.get(`${base}/:fp/insurance-profiles/`, async ({ request, params }) => {
        await context.settle();
        const auth = staff(context, request, ["patients.view"]);
        if ("error" in auth) return auth.error;
        const rec = record(auth.facilityId, str(params.fp));
        if (!rec) return notFound(auth.lang);
        const patient = store().patients.get(rec.patient_id)!;
        return HttpResponse.json({
          results: [...patient.insurance].sort((a, b) => Number(b.is_active) - Number(a.is_active)),
        });
      }),

      http.post(`${base}/:fp/insurance-profiles/`, async ({ request, params }) => {
        const auth = await unsafe(request, ["patient.register"]);
        if ("error" in auth) return auth.error;
        const rec = record(auth.facilityId, str(params.fp));
        if (!rec) return notFound(auth.lang);
        const body = await context.readJson(request);
        return addInsurance(context, auth.lang, store().patients.get(rec.patient_id)!, body);
      }),

      http.patch(`${base}/:fp/insurance-profiles/:profile/`, async ({ request, params }) => {
        const auth = await unsafe(request, ["patient.register"]);
        if ("error" in auth) return auth.error;
        const rec = record(auth.facilityId, str(params.fp));
        const profile =
          rec &&
          store()
            .patients.get(rec.patient_id)!
            .insurance.find((p) => p.id === params.profile);
        if (!profile) return notFound(auth.lang);
        return updateInsurance(context, auth.lang, profile, await context.readJson(request));
      }),

      http.post(`${base}/:fp/insurance-profiles/:profile/verify/`, async ({ request, params }) => {
        const auth = await unsafe(request, ["patients.insurance_verify"]);
        if ("error" in auth) return auth.error;
        const rec = record(auth.facilityId, str(params.fp));
        const profile =
          rec &&
          store()
            .patients.get(rec.patient_id)!
            .insurance.find((p) => p.id === params.profile);
        if (!profile) return notFound(auth.lang);
        const body = await context.readJson(request);
        if (body.outcome === "rejected" && !str(body.reason).trim())
          return context.errorResponse(
            400,
            "validation_error",
            context.message("validation", auth.lang),
            {
              fields: { reason: [context.message("required", auth.lang)] },
            },
          );
        profile.status = body.outcome === "rejected" ? "rejected" : "verified";
        profile.status_reason = body.outcome === "rejected" ? str(body.reason) : null;
        if (body.valid_until) profile.valid_until = str(body.valid_until);
        profile.last_verified = {
          facility_name:
            Object.values(FACILITIES).find((f) => f.id === auth.facilityId)?.name ?? null,
          at: new Date().toISOString(),
        };
        profile.version++;
        return HttpResponse.json(profile);
      }),

      http.get(`${base}/:fp/health-profile/`, async ({ request, params }) => {
        await context.settle();
        const auth = staff(context, request, ["clinical.view", "prescription.view"]);
        if ("error" in auth) return auth.error;
        const rec = record(auth.facilityId, str(params.fp));
        if (!rec) return notFound(auth.lang);
        const full = (auth.me.permissions as string[]).includes("clinical.view");
        return HttpResponse.json(healthProfile(store().patients.get(rec.patient_id)!, full));
      }),

      http.post(`${base}/:fp/:kind/:item/review/`, async ({ request, params }) => {
        const auth = await unsafe(request, ["clinical.write"]);
        if ("error" in auth) return auth.error;
        const rec = record(auth.facilityId, str(params.fp));
        const kind = str(params.kind) as HealthKind;
        if (!rec || !(kind in HEALTH_KIND)) return notFound(auth.lang);
        const patient = store().patients.get(rec.patient_id)!;
        const item = patient[kind].find((i) => i.id === params.item);
        if (!item) return notFound(auth.lang);
        const body = await context.readJson(request);
        if (body.outcome !== "verified" && !str(body.note).trim())
          return context.errorResponse(
            400,
            "validation_error",
            context.message("validation", auth.lang),
            {
              fields: { note: [context.message("required", auth.lang)] },
            },
          );
        if (body.outcome === "entered_in_error")
          patient[kind] = patient[kind].filter((i) => i !== item);
        else item.verification_status = body.outcome as HealthItem["verification_status"];
        item.reviewed_at = new Date().toISOString();
        item.review_note = str(body.note) || null;
        return HttpResponse.json(item);
      }),

      http.post(`${base}/:fp/consents/`, async ({ request, params }) => {
        const auth = await unsafe(request, ["patient.register"]);
        if ("error" in auth) return auth.error;
        const rec = record(auth.facilityId, str(params.fp));
        if (!rec) return notFound(auth.lang);
        const body = await context.readJson(request);
        if (!body.script_read)
          return context.errorResponse(
            400,
            "validation_error",
            context.message("validation", auth.lang),
            {
              fields: { script_read: [context.message("required", auth.lang)] },
            },
          );
        const consent = {
          id: crypto.randomUUID(),
          kind: str(body.kind),
          patient_id: rec.patient_id,
          granted: Boolean(body.granted),
          version: str(body.version),
          granted_at: new Date().toISOString(),
          channel: "staff_assisted",
        };
        store().patients.get(rec.patient_id)!.consents.unshift(consent);
        return HttpResponse.json(consent, { status: 201 });
      }),

      http.post(`${base}/:fp/claim-confirmations/`, async ({ request, params }) => {
        const auth = await unsafe(request, ["patient.register"]);
        if ("error" in auth) return auth.error;
        const rec = record(auth.facilityId, str(params.fp));
        if (!rec) return notFound(auth.lang);
        const body = await context.readJson(request);
        const claim = store().claims.find(
          (c) =>
            c.reference === str(body.claim_reference).toUpperCase() &&
            c.patient_id === rec.patient_id &&
            c.status === "awaiting_reception",
        );
        if (!claim) return notFound(auth.lang);
        claim.status = "completed";
        const { account_email: _a, patient_id: _p, code: _c, attempts: _t, ...shown } = claim;
        return HttpResponse.json(shown);
      }),

      http.post(`${base}/:fp/:kind/`, async ({ request, params }) => {
        const auth = await unsafe(request, ["clinical.write"]);
        if ("error" in auth) return auth.error;
        const rec = record(auth.facilityId, str(params.fp));
        const kind = str(params.kind) as HealthKind;
        if (!rec || !(kind in HEALTH_KIND)) return notFound(auth.lang);
        const item = addHealthItem(
          store().patients.get(rec.patient_id)!,
          kind,
          await context.readJson(request),
          "clinician",
        );
        return HttpResponse.json(item, { status: 201 });
      }),

      // ---- merges ----------------------------------------------------------------------------
      http.get(`${api}/staff/merge-requests/`, async ({ request }) => {
        await context.settle();
        const auth = staff(context, request, ["patients.merge_request", "patients.merge_approve"]);
        if ("error" in auth) return auth.error;
        const url = new URL(request.url);
        const status = url.searchParams.get("status");
        const items = store().merges.filter(
          (m) => m.facility_id === auth.facilityId && (!status || m.status === status),
        );
        return HttpResponse.json(page(items.map(publicMerge), url));
      }),

      http.post(`${api}/staff/merge-requests/`, async ({ request }) => {
        const auth = await unsafe(request, ["patients.merge_request"]);
        if ("error" in auth) return auth.error;
        const body = await context.readJson(request);
        const s = store();
        const survivor = record(auth.facilityId, str(body.surviving_facility_patient_id));
        const merged = record(auth.facilityId, str(body.merged_facility_patient_id));
        if (!survivor || !merged) return notFound(auth.lang);
        if (survivor.patient_id === merged.patient_id)
          return context.errorResponse(422, "business_rule_violation", s1("notAllowed", auth.lang));
        if (
          s.merges.some(
            (m) =>
              m.status === "requested" &&
              [m.surviving.patient_id, m.merged.patient_id].some(
                (p) => p === survivor.patient_id || p === merged.patient_id,
              ),
          )
        )
          return context.errorResponse(409, "conflict", msg("openRequest", auth.lang));
        const scope =
          knownElsewhere(s, survivor.patient_id, auth.facilityId) ||
          knownElsewhere(s, merged.patient_id, auth.facilityId)
            ? "cross_facility"
            : "facility";
        const merge: PatientsStore["merges"][number] = {
          id: crypto.randomUUID(),
          scope,
          status: "requested",
          is_escalated: false,
          facility: {
            id: auth.facilityId,
            name: Object.values(FACILITIES).find((f) => f.id === auth.facilityId)?.name ?? "",
          },
          surviving: mergeSide(s, survivor.patient_id, survivor.id),
          merged: mergeSide(s, merged.patient_id, merged.id),
          preview: {
            identifiers: s.patients.get(merged.patient_id)!.identifiers.length,
            insurance_profiles: s.patients.get(merged.patient_id)!.insurance.length,
            health_items: 0,
            account_links: 0,
            facility_records_here: 2,
            other_facilities: 0,
            conflicts: [],
          },
          reason: str(body.reason),
          requested_by: auth.me.full_name,
          requested_at: new Date().toISOString(),
          decided_by: null,
          decided_at: null,
          decision_reason: null,
          executed_at: null,
          undone_at: null,
          version: 1,
          requested_by_email: auth.me.email,
          facility_id: auth.facilityId,
        };
        s.merges.unshift(merge);
        return HttpResponse.json(publicMerge(merge), { status: 201 });
      }),

      http.get(`${api}/staff/merge-requests/:id/`, async ({ request, params }) => {
        await context.settle();
        const auth = staff(context, request, ["patients.merge_request", "patients.merge_approve"]);
        if ("error" in auth) return auth.error;
        const merge = store().merges.find(
          (m) => m.id === params.id && m.facility_id === auth.facilityId,
        );
        return merge ? HttpResponse.json(publicMerge(merge)) : notFound(auth.lang);
      }),

      http.post(`${api}/staff/merge-requests/:id/:action/`, async ({ request, params }) => {
        const action = str(params.action);
        const codes = ["cancel", "escalate"].includes(action)
          ? ["patients.merge_request"]
          : ["patients.merge_approve"];
        const auth = await unsafe(request, codes);
        if ("error" in auth) return auth.error;
        const merge = store().merges.find(
          (m) => m.id === params.id && m.facility_id === auth.facilityId,
        );
        if (!merge) return notFound(auth.lang);
        return mergeAction(
          context,
          auth.lang,
          merge,
          action,
          auth.me,
          await context.readJson(request),
          false,
        );
      }),

      http.get(`${api}/platform/merge-requests/`, async ({ request }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const admin = platformAdmin(context, lang);
        if ("error" in admin) return admin.error;
        const url = new URL(request.url);
        const items = store().merges.filter(
          (m) =>
            (m.scope !== "facility" || m.is_escalated) &&
            (!url.searchParams.get("status") || m.status === url.searchParams.get("status")),
        );
        return HttpResponse.json(page(items.map(publicMerge), url));
      }),

      http.get(`${api}/platform/merge-requests/:id/`, async ({ request, params }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const admin = platformAdmin(context, lang);
        if ("error" in admin) return admin.error;
        const merge = store().merges.find(
          (m) => m.id === params.id && (m.scope !== "facility" || m.is_escalated),
        );
        return merge ? HttpResponse.json(publicMerge(merge)) : notFound(lang);
      }),

      http.post(`${api}/platform/merge-requests/:id/:action/`, async ({ request, params }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const admin = platformAdmin(context, lang);
        if ("error" in admin) return admin.error;
        const csrf = context.csrfFailure(request, lang);
        if (csrf) return csrf;
        const merge = store().merges.find(
          (m) => m.id === params.id && (m.scope !== "facility" || m.is_escalated),
        );
        if (!merge) return notFound(lang);
        return mergeAction(
          context,
          lang,
          merge,
          str(params.action),
          admin.me,
          await context.readJson(request),
          true,
        );
      }),
    ],
  };

  function mergeAction(
    ctx: MockContext,
    lang: LanguageCode,
    merge: PatientsStore["merges"][number],
    action: string,
    me: StaffMe,
    body: Record<string, unknown>,
    platform: boolean,
  ) {
    const s = store();
    if (["approve", "undo"].includes(action) && (s.requireStepUp || !ctx.hasRecentAuth()))
      return ctx.errorResponse(403, "step_up_required", s1("stepUpRequired", lang));
    if (["approve", "reject", "undo"].includes(action) && body.version !== merge.version)
      return ctx.errorResponse(409, "conflict", s1("conflict", lang));
    const isRequester = merge.requested_by_email === me.email;
    const rule = (key: MessageKey) =>
      ctx.errorResponse(422, "business_rule_violation", msg(key, lang));
    switch (action) {
      case "approve":
        if (merge.status !== "requested") return rule("openRequest");
        if (isRequester) return rule("requester");
        if (!platform && (merge.scope !== "facility" || merge.is_escalated))
          return rule("platformOnly");
        merge.decided_by = me.full_name;
        merge.decided_at = new Date().toISOString();
        merge.decision_reason = str(body.decision_reason) || null;
        executeMerge(merge);
        break;
      case "reject":
        if (!str(body.decision_reason).trim())
          return ctx.errorResponse(400, "validation_error", ctx.message("validation", lang), {
            fields: { decision_reason: [ctx.message("required", lang)] },
          });
        if (isRequester) return rule("requester");
        merge.status = "rejected";
        merge.decided_by = me.full_name;
        merge.decision_reason = str(body.decision_reason);
        merge.version++;
        break;
      case "cancel":
        if (!isRequester)
          return ctx.errorResponse(403, "permission_denied", s1("permissionDenied", lang));
        merge.status = "cancelled";
        merge.version++;
        break;
      case "escalate": {
        if (!isRequester)
          return ctx.errorResponse(403, "permission_denied", s1("permissionDenied", lang));
        const approverHere = STAFF_USERS.some(
          (u) =>
            u.email !== me.email &&
            u.memberships.some(
              (m) =>
                m.facility.id === merge.facility_id &&
                m.roles.some((r) =>
                  (ROLE_PERMISSIONS[r] as string[]).includes("patients.merge_approve"),
                ),
            ),
        );
        if (approverHere) return rule("otherApprover");
        merge.is_escalated = true;
        merge.version++;
        break;
      }
      case "undo": {
        if (merge.status !== "executed") return rule("openRequest");
        if (!platform && merge.scope !== "facility") return rule("platformOnly");
        const merged = s.patients.get(merge.merged.patient_id)!;
        merged.merged_into = null;
        for (const r of s.records) {
          if (
            r.merged_into &&
            s.records.find((x) => x.id === r.merged_into)?.patient_id ===
              merge.surviving.patient_id &&
            r.patient_id === merged.id
          ) {
            r.is_active = true;
            r.merged_into = null;
          }
        }
        merge.status = "undone";
        merge.undone_at = new Date().toISOString();
        merge.version++;
        return HttpResponse.json({ merge: publicMerge(merge), skipped_rows: 0 });
      }
      default:
        return notFound(lang);
    }
    return HttpResponse.json(publicMerge(merge));
  }
};

function publicMerge(merge: PatientsStore["merges"][number]): MergeRequest {
  const { requested_by_email: _e, facility_id: _f, ...shown } = merge;
  return { ...shown, preview: merge.status === "requested" ? merge.preview : null };
}

// ---- shared with the patient mocks --------------------------------------------------------------

const INSURERS: Record<string, string> = {
  mutuelle: "Mutuelle de Santé",
  rssb: "RSSB (RAMA)",
  mmi: "MMI",
  radiant: "Radiant",
};

export function addInsurance(
  context: MockContext,
  lang: LanguageCode,
  patient: MockPatient,
  body: Record<string, unknown>,
) {
  const code = str(body.insurer_code);
  if (!INSURERS[code])
    return context.errorResponse(400, "validation_error", context.message("validation", lang), {
      fields: { insurer_code: [context.message("required", lang)] },
    });
  const number = str(body.member_number).trim().toUpperCase();
  if (
    patient.insurance.some(
      (p) => p.is_active && p.insurer_code === code && p.member_number === number,
    )
  )
    return context.errorResponse(409, "conflict", s1("conflict", lang), {
      fields: { member_number: [s1("conflict", lang)] },
    });
  const profile: InsuranceProfile = {
    id: crypto.randomUUID(),
    insurer_code: code,
    insurer_display: INSURERS[code],
    member_number: number,
    is_principal: body.is_principal !== false,
    principal_name: (body.principal_name as string | null) ?? null,
    principal_member_number: (body.principal_member_number as string | null) ?? null,
    relationship_to_principal:
      (body.relationship_to_principal as InsuranceProfile["relationship_to_principal"]) ?? null,
    valid_until: (body.valid_until as string | null) ?? null,
    is_expired: Boolean(
      body.valid_until && str(body.valid_until) < new Date().toISOString().slice(0, 10),
    ),
    status: "unverified",
    status_reason: null,
    last_verified: null,
    card_images: { front: null, back: null, can_upload: true },
    is_active: true,
    version: 1,
  };
  patient.insurance.unshift(profile);
  return HttpResponse.json(profile, { status: 201 });
}

export function updateInsurance(
  context: MockContext,
  lang: LanguageCode,
  profile: InsuranceProfile,
  body: Record<string, unknown>,
) {
  if (body.version !== profile.version)
    return context.errorResponse(409, "conflict", s1("conflict", lang));
  for (const [key, value] of Object.entries(body)) {
    if (key === "version") continue;
    (profile as unknown as Record<string, unknown>)[key] = value;
    profile.status = "unverified";
    profile.status_reason = null;
  }
  profile.version++;
  return HttpResponse.json(profile);
}

export function healthProfile(patient: MockPatient, full: boolean) {
  return {
    no_known_allergies: patient.no_known_allergies,
    allergies: patient.allergies,
    conditions: full ? patient.conditions : null,
    medications: full ? patient.medications : null,
  };
}

export function addHealthItem(
  patient: MockPatient,
  kind: HealthKind,
  body: Record<string, unknown>,
  source: "patient" | "clinician",
): HealthItem {
  const item = {
    ...(body as Partial<HealthItem>),
    id: crypto.randomUUID(),
    kind: HEALTH_KIND[kind],
    source,
    verification_status: source === "clinician" ? "verified" : "unverified",
    recorded_at: new Date().toISOString(),
    reviewed_at: null,
    review_note: null,
  } as HealthItem;
  patient[kind].unshift(item);
  if (kind === "allergies") patient.no_known_allergies = false;
  return item;
}
