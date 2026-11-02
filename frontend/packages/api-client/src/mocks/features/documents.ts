import { http, HttpResponse } from "msw";

import type { Consultation } from "../../features/clinical";
import type {
  DocumentDetail,
  ClinicalDocumentKind,
  DocumentRow,
  LabRequest,
  LabRequestInput,
  NewShareLink,
  PatientDocument,
  Referral,
  ReferralInput,
  ShareLink,
  SickNote,
  SickNoteInput,
  DocumentVerification,
  DocumentVerificationDetails,
} from "../../features/documents";
import type { LanguageCode } from "../../types";
import { extendMockRoleGrants } from "../data";
import type { FeatureMockFactory } from "../features";
import {
  MOCK_CLINICAL_FP,
  MOCK_PRESSURE_CONSULTATION,
  mockConsultation,
  setConsultationSignHook,
} from "./clinical";
import { SELF_PATIENT_ID } from "./patients-store";
import { id, now, page, s1, stepUpFailure } from "./s1-common";

/**
 * S7b mocks (sprint-07 §3.3). Kigali Clinic: Mukamana's signed blood-pressure consultation
 * (`MOCK_PRESSURE_CONSULTATION`) has a prescription and a sick note; letters written in a draft
 * consultation are signed with it. The patient account sees two documents; the prescription
 * verifies publicly with `MOCK_VERIFY_CODE` and the date of birth `MOCK_VERIFY_DOB`.
 */

extendMockRoleGrants({
  receptionist: ["documents.print"],
  pharmacist: ["documents.print"],
});

export const MOCK_DOCUMENT_RX = "9d000000-0000-4000-8000-000000000001";
export const MOCK_DOCUMENT_SICK = "9d000000-0000-4000-8000-000000000002";
export const MOCK_VERIFY_CODE = "7KQ3MZ8HPA";
export const MOCK_VERIFY_DOB = "1990-05-01";
export const MOCK_SHARE_TOKEN = "mock-share-token-0001";

const FACILITY = "Kigali Clinic";
const DOCTOR = "Uwimana Keza";
const FILES = "https://files.medilink.test/mock";

interface MockDocument extends DocumentRow {
  facility_patient_id: string;
  consultation_id: string | null;
  verification_code: string;
  versions: DocumentDetail["versions"];
  details: DocumentVerificationDetails["sections"];
  patient_name: string;
  valid_until: string | null;
}

interface Letters {
  referrals: Referral[];
  labRequests: LabRequest[];
  sickNotes: SickNote[];
}

interface Store {
  documents: MockDocument[];
  letters: Map<string, Letters>;
  links: (ShareLink & { document_id: string; token: string })[];
  counters: Record<string, number>;
}

const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

function doc(
  docId: string,
  kind: ClinicalDocumentKind,
  number: string,
  days: number,
  extra: Partial<MockDocument> = {},
): MockDocument {
  const created = daysFromNow(days);
  return {
    id: docId,
    kind,
    number,
    document_date: created.slice(0, 10),
    patient_id: SELF_PATIENT_ID,
    facility_name: FACILITY,
    author_name: DOCTOR,
    status: "active",
    version_no: 1,
    released_at: created,
    facility_patient_id: MOCK_CLINICAL_FP,
    consultation_id: MOCK_PRESSURE_CONSULTATION,
    verification_code: id()
      .replace(/[^A-Z0-9]/gi, "")
      .slice(0, 10)
      .toUpperCase(),
    versions: [{ version_no: 1, created_at: created, superseded_at: null, size_bytes: 3965 }],
    details: [],
    patient_name: "Mukamana Jeanne",
    valid_until: null,
    ...extra,
  };
}

function seed(): Store {
  return {
    documents: [
      doc(MOCK_DOCUMENT_RX, "prescription", "RX-2026-000106", -20, {
        verification_code: MOCK_VERIFY_CODE,
        valid_until: daysFromNow(10),
        versions: [
          {
            version_no: 2,
            created_at: daysFromNow(-18),
            superseded_at: null,
            size_bytes: 4012,
          },
          {
            version_no: 1,
            created_at: daysFromNow(-20),
            superseded_at: daysFromNow(-18),
            size_bytes: 3965,
          },
        ],
        version_no: 2,
        details: [
          {
            heading: "Medicines",
            lines: [
              "1. Amlodipine 5 mg tablet: 1 tablet, once a day, by mouth, 30 days. Quantity 30.",
            ],
          },
        ],
      }),
      doc(MOCK_DOCUMENT_SICK, "sick_note", "SN-2026-000004", -20, {
        details: [{ heading: "", lines: ["Unfit for work or school for 2 days."] }],
      }),
    ],
    letters: new Map([
      [
        MOCK_PRESSURE_CONSULTATION,
        {
          referrals: [],
          labRequests: [],
          sickNotes: [
            {
              id: id(),
              author_name: DOCTOR,
              signed_at: daysFromNow(-20),
              document_id: MOCK_DOCUMENT_SICK,
              rest_from: daysFromNow(-20).slice(0, 10),
              rest_to: daysFromNow(-19).slice(0, 10),
              show_diagnosis: false,
            },
          ],
        },
      ],
    ]),
    links: [
      {
        id: id(),
        document_id: MOCK_DOCUMENT_RX,
        token: MOCK_SHARE_TOKEN,
        expires_at: daysFromNow(5),
        revoked_at: null,
        access_count: 1,
        last_accessed_at: daysFromNow(-1),
      },
    ],
    counters: { REF: 0, LAB: 0, SN: 4 },
  };
}

const PREFIX: Record<Exclude<ClinicalDocumentKind, "prescription">, string> = {
  referral: "REF",
  lab_request: "LAB",
  sick_note: "SN",
};

const MESSAGES = {
  author: {
    en: "Only the consultation's author writes its letters and requests.",
    fr: "Seul l'auteur de la consultation rédige ses lettres et demandes.",
    rw: "Uwanditse isuzuma wenyine ni we wandika amabaruwa n'ibisabwa byaryo.",
  },
  dob: {
    en: "That date of birth doesn't match this document.",
    fr: "Cette date de naissance ne correspond pas à ce document.",
    rw: "Iyo tariki y'amavuko ntihuye n'iyi nyandiko.",
  },
} as const;

const row = ({
  facility_patient_id: _f,
  consultation_id: _c,
  verification_code: _v,
  versions: _vs,
  details: _d,
  patient_name: _p,
  valid_until: _u,
  ...out
}: MockDocument): DocumentRow => out;

const detail = (d: MockDocument): DocumentDetail => ({
  ...row(d),
  verification_code: d.verification_code,
  versions: d.versions,
});

const projection = (d: MockDocument): DocumentVerification => ({
  code: d.verification_code,
  kind: d.kind,
  number: d.number,
  status: d.status,
  issued_at: d.released_at ?? now(),
  valid_until: d.valid_until,
  facility_name: d.facility_name,
  author_name: d.author_name,
  author_licence: "RMDC 12345",
  version_no: d.version_no,
});

const link = (number: string) => ({
  url: `${FILES}/${number}.pdf`,
  expires_at: daysFromNow(300 / 86_400),
});

export const documentsMocks: FeatureMockFactory = (context) => {
  const { api } = context;
  let db = seed();
  const S = `${api}/staff`;
  const P = `${api}/patient/documents`;
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
  const lettersOf = (consultationId: string): Letters => {
    let found = db.letters.get(consultationId);
    if (!found) {
      found = { referrals: [], labRequests: [], sickNotes: [] };
      db.letters.set(consultationId, found);
    }
    return found;
  };

  const generate = (c: Consultation, kind: Exclude<ClinicalDocumentKind, "prescription">) => {
    db.counters[PREFIX[kind]] = (db.counters[PREFIX[kind]] ?? 0) + 1;
    const number = `${PREFIX[kind]}-2026-${String(db.counters[PREFIX[kind]]).padStart(6, "0")}`;
    const created = doc(id(), kind, number, 0, {
      facility_patient_id: c.facility_patient_id,
      consultation_id: c.id,
      patient_name: c.patient.display_name,
      author_name: c.author.full_name,
    });
    db.documents.unshift(created);
    return created.id;
  };

  const signLetter = (
    c: Consultation,
    letter: Referral | LabRequest | SickNote,
    kind: Exclude<ClinicalDocumentKind, "prescription">,
  ) => {
    letter.signed_at = now();
    letter.document_id = generate(c, kind);
  };

  // D-1 in S7a; S7b signs the draft letters and requests with the consultation
  setConsultationSignHook((c) => {
    const letters = lettersOf(c.id);
    for (const r of letters.referrals) if (!r.signed_at) signLetter(c, r, "referral");
    for (const r of letters.labRequests) if (!r.signed_at) signLetter(c, r, "lab_request");
    for (const r of letters.sickNotes) if (!r.signed_at) signLetter(c, r, "sick_note");
    return null;
  }, "documents");

  const sourceHandlers = <T extends Referral | LabRequest | SickNote, I>(
    path: string,
    list: (l: Letters) => T[],
    kind: Exclude<ClinicalDocumentKind, "prescription">,
    make: (
      body: Partial<I>,
      lang: LanguageCode,
    ) => { fields: Record<string, unknown> } | { error: Response },
  ) => [
    http.get(`${S}/consultations/:id/${path}/`, async ({ request, params }) => {
      await context.settle();
      const ok = staff(request, ["clinical.view"]);
      if ("error" in ok) return ok.error;
      const c = mockConsultation(String(params.id));
      if (!c) return notFound(ok.lang);
      return HttpResponse.json(list(lettersOf(c.id)));
    }),
    http.post(`${S}/consultations/:id/${path}/`, async ({ request, params }) => {
      await context.settle();
      const ok = staff(request, ["clinical.write"]);
      if ("error" in ok) return ok.error;
      const c = mockConsultation(String(params.id));
      if (!c) return notFound(ok.lang);
      if (c.author.full_name !== ok.me.full_name)
        return context.errorResponse(422, "business_rule_violation", msg("author", ok.lang));
      const signed = c.status === "signed";
      if (signed) {
        const step = stepUpFailure(context, ok.lang);
        if (step) return step;
      }
      const made = make(((await context.readJson(request)) ?? {}) as Partial<I>, ok.lang);
      if ("error" in made) return made.error;
      const letter = {
        id: id(),
        author_name: ok.me.full_name,
        signed_at: null,
        document_id: null,
        ...made.fields,
      } as unknown as T;
      list(lettersOf(c.id)).push(letter);
      if (signed) signLetter(c, letter, kind);
      return HttpResponse.json(letter, { status: 201 });
    }),
  ];

  const required = (lang: LanguageCode, fields: Record<string, string>) =>
    context.validationError(
      lang,
      Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, [v]])),
    );

  const patientDocs = (request: Request) => {
    const lang = context.languageFrom(request);
    const auth = context.authenticatedPatient(lang);
    if ("error" in auth) return { error: auth.error };
    const profiles = new Set(auth.me.profiles.map((p) => p.patient_id));
    return { lang, docs: db.documents.filter((d) => profiles.has(d.patient_id)) };
  };

  return {
    reset: () => {
      db = seed();
    },
    handlers: [
      ...sourceHandlers<Referral, ReferralInput>(
        "referrals",
        (l) => l.referrals,
        "referral",
        (b, lang) => {
          if (!b.to_facility_name?.trim() || !b.specialty?.trim() || !b.reason?.trim())
            return {
              error: required(lang, {
                ...(!b.to_facility_name?.trim() ? { to_facility_name: "Say where to." } : {}),
                ...(!b.specialty?.trim() ? { specialty: "Give the specialty." } : {}),
                ...(!b.reason?.trim() ? { reason: "Give the reason." } : {}),
              }),
            };
          return {
            fields: {
              to_facility_name: b.to_facility_name.trim(),
              specialty: b.specialty.trim(),
              reason: b.reason.trim(),
              urgency: b.urgency ?? "routine",
            },
          };
        },
      ),
      ...sourceHandlers<LabRequest, LabRequestInput>(
        "lab-requests",
        (l) => l.labRequests,
        "lab_request",
        (b, lang) => {
          const tests = (b.tests ?? []).filter((t) => t.name?.trim());
          if (!tests.length || !b.reason?.trim())
            return {
              error: required(lang, {
                ...(!tests.length ? { tests: "Add at least one test." } : {}),
                ...(!b.reason?.trim() ? { reason: "Give the reason." } : {}),
              }),
            };
          return { fields: { tests, reason: b.reason.trim() } };
        },
      ),
      ...sourceHandlers<SickNote, SickNoteInput>(
        "sick-notes",
        (l) => l.sickNotes,
        "sick_note",
        (b, lang) => {
          if (!b.rest_from || !b.rest_to)
            return { error: required(lang, { rest_from: "Give both days." }) };
          if (b.rest_to < b.rest_from)
            return { error: required(lang, { rest_to: "The last day is before the first." }) };
          return {
            fields: {
              rest_from: b.rest_from,
              rest_to: b.rest_to,
              show_diagnosis: Boolean(b.show_diagnosis),
            },
          };
        },
      ),

      // ---- D1-D3 staff
      http.get(`${S}/documents/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["clinical.view", "documents.print"]);
        if ("error" in ok) return ok.error;
        const url = new URL(request.url);
        const fp = url.searchParams.get("facility_patient_id");
        const visit = url.searchParams.get("visit_id");
        const kind = url.searchParams.get("kind");
        if (!fp && !visit)
          return required(ok.lang, {
            facility_patient_id: "Give facility_patient_id or visit_id.",
          });
        const rows = db.documents
          .filter((d) => !fp || d.facility_patient_id === fp)
          .filter((d) => !visit || mockConsultation(d.consultation_id ?? "")?.visit_id === visit)
          .filter((d) => !kind || d.kind === kind)
          .map(row);
        return HttpResponse.json(page(rows, url));
      }),
      http.get(`${S}/documents/:id/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["clinical.view", "documents.print"]);
        if ("error" in ok) return ok.error;
        const d = db.documents.find((x) => x.id === params.id);
        return d ? HttpResponse.json(detail(d)) : notFound(ok.lang);
      }),
      http.post(`${S}/documents/:id/download-link/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["clinical.view", "documents.print"]);
        if ("error" in ok) return ok.error;
        const d = db.documents.find((x) => x.id === params.id);
        return d ? HttpResponse.json(link(d.number)) : notFound(ok.lang);
      }),
      http.post(`${S}/documents/:id/print/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["documents.print"]);
        if ("error" in ok) return ok.error;
        const d = db.documents.find((x) => x.id === params.id && x.released_at);
        return d ? HttpResponse.json(link(d.number)) : notFound(ok.lang);
      }),

      // ---- D4, D5 patient
      http.get(`${P}/`, async ({ request }) => {
        await context.settle();
        const ok = patientDocs(request);
        if ("error" in ok) return ok.error;
        const url = new URL(request.url);
        const wanted = url.searchParams.get("patient_id");
        const kind = url.searchParams.get("kind");
        const rows = ok.docs
          .filter((d) => !wanted || d.patient_id === wanted)
          .filter((d) => !kind || d.kind === kind)
          .map(row);
        return HttpResponse.json(page(rows, url));
      }),
      http.post(`${P}/archive/`, async ({ request }) => {
        await context.settle();
        const ok = patientDocs(request);
        if ("error" in ok) return ok.error;
        return HttpResponse.json(link("medilink-documents"));
      }),
      http.get(`${P}/:id/`, async ({ request, params }) => {
        await context.settle();
        const ok = patientDocs(request);
        if ("error" in ok) return ok.error;
        const d = ok.docs.find((x) => x.id === params.id);
        if (!d) return notFound(ok.lang);
        const out: PatientDocument = {
          ...detail(d),
          share_links: db.links
            .filter((l) => l.document_id === d.id)
            .map(({ document_id: _d, token: _t, ...l }) => l),
        };
        return HttpResponse.json(out);
      }),
      http.post(`${P}/:id/download-link/`, async ({ request, params }) => {
        await context.settle();
        const ok = patientDocs(request);
        if ("error" in ok) return ok.error;
        const d = ok.docs.find((x) => x.id === params.id);
        return d ? HttpResponse.json(link(d.number)) : notFound(ok.lang);
      }),
      http.post(`${P}/:id/share-links/`, async ({ request, params }) => {
        await context.settle();
        const ok = patientDocs(request);
        if ("error" in ok) return ok.error;
        const d = ok.docs.find((x) => x.id === params.id);
        if (!d) return notFound(ok.lang);
        const body = ((await context.readJson(request)) ?? {}) as { expires_in_days?: number };
        const days = Number(body.expires_in_days);
        if (!Number.isInteger(days) || days < 1 || days > 30)
          return required(ok.lang, { expires_in_days: "Choose 1 to 30 days." });
        const token = `tok-${id()}`;
        const made = {
          id: id(),
          document_id: d.id,
          token,
          expires_at: daysFromNow(days),
          revoked_at: null,
          access_count: 0,
          last_accessed_at: null,
        };
        db.links.unshift(made);
        const { document_id: _d, ...out } = made;
        const created: NewShareLink = {
          ...out,
          url: `${globalThis.location?.origin ?? "http://localhost"}/shared/${token}`,
        };
        return HttpResponse.json(created, { status: 201 });
      }),
      http.delete(`${P}/:id/share-links/:linkId/`, async ({ request, params }) => {
        await context.settle();
        const ok = patientDocs(request);
        if ("error" in ok) return ok.error;
        const found = db.links.find((l) => l.id === params.linkId && l.document_id === params.id);
        if (!found) return notFound(ok.lang);
        found.revoked_at ??= now();
        return new HttpResponse(null, { status: 204 });
      }),

      // ---- V1 and shared links (public)
      http.get(`${api}/public/verify/:code/`, async ({ request, params }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const code = String(params.code)
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "");
        const d = db.documents.find((x) => x.verification_code === code);
        return d ? HttpResponse.json(projection(d)) : notFound(lang);
      }),
      http.post(`${api}/public/verify/:code/details/`, async ({ request, params }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const code = String(params.code)
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "");
        const d = db.documents.find((x) => x.verification_code === code);
        if (!d) return notFound(lang);
        const body = ((await context.readJson(request)) ?? {}) as { date_of_birth?: string };
        if (!body.date_of_birth)
          return required(lang, { date_of_birth: "Give the date of birth." });
        if (body.date_of_birth !== MOCK_VERIFY_DOB)
          return context.errorResponse(422, "business_rule_violation", msg("dob", lang));
        const out: DocumentVerificationDetails = {
          ...projection(d),
          patient_name: d.patient_name,
          sections: d.details,
        };
        return HttpResponse.json(out);
      }),
      http.get(`${api}/public/shared-documents/:token/`, async ({ request, params }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const found = db.links.find(
          (l) => l.token === params.token && !l.revoked_at && Date.parse(l.expires_at) > Date.now(),
        );
        const d = found && db.documents.find((x) => x.id === found.document_id);
        if (!found || !d) return notFound(lang);
        found.access_count += 1;
        found.last_accessed_at = now();
        return HttpResponse.json({
          kind: d.kind,
          number: d.number,
          document_date: d.document_date,
          facility_name: d.facility_name,
          expires_at: found.expires_at,
          download: link(d.number),
        });
      }),
    ],
  };
};
