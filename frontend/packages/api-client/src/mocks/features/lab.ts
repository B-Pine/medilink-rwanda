import { http, HttpResponse } from "msw";

import type {
  LabFlag,
  LabOrder,
  LabOrderState,
  LabPatient,
  LabResultItem,
  LabSpecimen,
  LabCatalogueItem,
  LabCatalogueTest,
  LabVisit,
  PatientLabResult,
} from "../../features/clinical";
import type { LanguageCode } from "../../types";
import { FACILITIES } from "../data";
import type { FeatureMockFactory } from "../features";
import { mockConsultation } from "./clinical";
import { SELF_PATIENT_ID } from "./patients-store";
import { MOCK_LAB_VISITS, mockLabQueue, onMockLabOrders } from "./queue";
import { fieldError, id, now, rule, s1, str } from "./s1-common";
import { MEMBERSHIP_BY_EMAIL, SETUP_IDS } from "./setup";

/**
 * Upgrade 06 §3 (#201) mocks: the laboratory loop at Kigali Clinic.
 * - Uwimana Grace was sent to the lab by Dr Keza: malaria test and full blood count to sample
 * - Nkurunziza Jean gave his samples (urinalysis, blood glucose): results to enter
 * - patient@medilink.test (Mukamana) has one released result with the doctor's note
 * The lab technician is lab@medilink.test (Habyarimana Theogene).
 */

type I18n = Record<LanguageCode, string>;
const n = (en: string, fr: string, rw: string): I18n => ({ en, fr, rw });
const POS_NEG = ["negative", "positive", "invalid"];
const DIPSTICK = ["negative", "trace", "positive"];

interface MockItem extends Omit<LabCatalogueItem, "label"> {
  label: I18n;
}
interface MockTest {
  code: string;
  name: I18n;
  specimen: LabSpecimen;
  items: MockItem[];
}
const choice = (code: string, label: I18n, choices: string[], normal: string | null): MockItem => ({
  code,
  label,
  kind: "choice",
  unit: "",
  low: null,
  high: null,
  choices,
  normal,
});
const num = (code: string, label: I18n, unit: string, low: string, high: string): MockItem => ({
  code,
  label,
  kind: "number",
  unit,
  low,
  high,
  choices: [],
  normal: null,
});
const RESULT = n("Result", "Résultat", "Igisubizo");

/** As backend `clinical/lab_catalogue.py`. */
const TESTS: MockTest[] = [
  {
    code: "MAL-RDT",
    name: n(
      "Malaria rapid test (RDT)",
      "Test rapide du paludisme (TDR)",
      "Isuzuma ryihuse rya malariya",
    ),
    specimen: "blood",
    items: [choice("result", RESULT, POS_NEG, "negative")],
  },
  {
    code: "FBC",
    name: n("Full blood count", "Numération formule sanguine", "Isuzuma ryuzuye ry'amaraso"),
    specimen: "blood",
    items: [
      num("hb", n("Haemoglobin", "Hémoglobine", "Hemoglobine"), "g/dL", "12.00", "17.50"),
      num("wbc", n("White cells", "Globules blancs", "Insoro zera"), "×10⁹/L", "4.00", "11.00"),
      num("plt", n("Platelets", "Plaquettes", "Plakete"), "×10⁹/L", "150.00", "450.00"),
    ],
  },
  {
    code: "URINE",
    name: n("Urinalysis (dipstick)", "Analyse d'urine (bandelette)", "Isuzuma ry'inkari"),
    specimen: "urine",
    items: [
      choice("protein", n("Protein", "Protéines", "Poroteyine"), DIPSTICK, "negative"),
      choice("glucose", n("Glucose", "Glucose", "Isukari"), DIPSTICK, "negative"),
      choice("leukocytes", n("Leukocytes", "Leucocytes", "Insoro zera"), DIPSTICK, "negative"),
      choice("nitrite", n("Nitrite", "Nitrites", "Nitirite"), ["negative", "positive"], "negative"),
      choice("blood", n("Blood", "Sang", "Amaraso"), DIPSTICK, "negative"),
    ],
  },
  {
    code: "GLU",
    name: n("Blood glucose (random)", "Glycémie (aléatoire)", "Isukari mu maraso"),
    specimen: "blood",
    items: [num("glucose", n("Glucose", "Glucose", "Isukari"), "mmol/L", "3.90", "7.80")],
  },
  {
    code: "HIV-RT",
    name: n("HIV rapid test", "Test rapide du VIH", "Isuzuma ryihuse rya SIDA"),
    specimen: "blood",
    items: [choice("result", RESULT, POS_NEG, "negative")],
  },
  {
    code: "PREG",
    name: n("Pregnancy test (urine)", "Test de grossesse (urine)", "Isuzuma ry'inda"),
    specimen: "urine",
    items: [choice("result", RESULT, POS_NEG, null)],
  },
  {
    code: "STOOL",
    name: n("Stool examination", "Examen des selles", "Isuzuma ry'umwanda"),
    specimen: "stool",
    items: [
      choice(
        "parasites",
        n("Ova and parasites", "Œufs et parasites", "Amagi n'inzoka"),
        ["none_seen", "seen"],
        "none_seen",
      ),
    ],
  },
  {
    code: "TYPHOID",
    name: n("Typhoid rapid test", "Test rapide de la typhoïde", "Isuzuma ryihuse rya tifoyide"),
    specimen: "blood",
    items: [choice("result", RESULT, POS_NEG, "negative")],
  },
];
const BY_CODE = new Map(TESTS.map((t) => [t.code, t]));

const catalogueRow = (t: MockTest, lang: LanguageCode): LabCatalogueTest => ({
  code: t.code,
  name: t.name[lang],
  specimen: t.specimen,
  items: t.items.map((i) => ({ ...i, label: i.label[lang] })),
});

function flagOf(item: MockItem, value: string): LabFlag | null {
  if (!value) return null;
  if (item.kind === "number") {
    const v = Number(value);
    if (item.low !== null && v < Number(item.low)) return "low";
    if (item.high !== null && v > Number(item.high)) return "high";
    return null;
  }
  return item.normal !== null && value !== item.normal ? "abnormal" : null;
}

/** A mock order: the API row plus who it belongs to (never sent). */
interface MockOrder {
  order: Omit<LabOrder, "test_name" | "result"> & {
    values: Record<string, string> | null;
    comment: string;
  };
  patient: LabPatient;
  patient_id: string;
  facility_patient_id: string;
  ordered_by: string;
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function seed(): MockOrder[] {
  const make = (
    visitId: string,
    code: string,
    patient: LabPatient,
    extra: Partial<MockOrder["order"]> = {},
    patientId: string = id(),
  ): MockOrder => ({
    order: {
      id: id(),
      visit_id: visitId,
      consultation_id: id(),
      test_code: code,
      specimen: BY_CODE.get(code)!.specimen,
      state: "ordered",
      reason: "",
      ordered_at: minutesAgo(10),
      ordered_by_name: "Uwimana Keza",
      sample_taken_at: null,
      sample_taken_by_name: null,
      resulted_at: null,
      resulted_by_name: null,
      is_abnormal: false,
      reviewed_at: null,
      reviewed_by_name: null,
      review_note: "",
      released_at: null,
      version: 1,
      values: null,
      comment: "",
      ...extra,
    },
    patient,
    patient_id: patientId,
    facility_patient_id: id(),
    ordered_by: SETUP_IDS.mKeza,
  });
  const grace: LabPatient = {
    full_name: "Uwimana Grace",
    display_name: "Uwimana Grace",
    date_of_birth: "1995-02-14",
    age_years: 31,
    sex: "female",
    medilink_number: "ML-4K7Q-2P",
  };
  const jean: LabPatient = {
    full_name: "Nkurunziza Jean",
    display_name: "Nkurunziza Jean",
    date_of_birth: "1981-07-03",
    age_years: 45,
    sex: "male",
    medilink_number: "ML-9D2M-6T",
  };
  const jeanne: LabPatient = {
    full_name: "Mukamana Jeanne",
    display_name: "Mukamana Jeanne",
    date_of_birth: "1984-05-01",
    age_years: 42,
    sex: "female",
    medilink_number: "ML-7H3K-9C",
  };
  const fever = "Fever for 3 days, headache. Rule out malaria.";
  const sampled = { state: "sample_taken" as const, sample_taken_at: minutesAgo(20) };
  return [
    make(MOCK_LAB_VISITS.waiting, "MAL-RDT", grace, { reason: fever }),
    make(MOCK_LAB_VISITS.waiting, "FBC", grace, { reason: fever }),
    make(MOCK_LAB_VISITS.inProgress, "URINE", jean, {
      reason: "Burning on passing urine.",
      ...sampled,
      sample_taken_by_name: "Habyarimana Theogene",
    }),
    make(MOCK_LAB_VISITS.inProgress, "GLU", jean, {
      reason: "Thirst and weight loss.",
      ...sampled,
      sample_taken_by_name: "Habyarimana Theogene",
    }),
    make(
      id(),
      "FBC",
      jeanne,
      {
        state: "released",
        ordered_at: minutesAgo(60 * 24 * 3 + 90),
        sample_taken_at: minutesAgo(60 * 24 * 3 + 80),
        resulted_at: minutesAgo(60 * 24 * 3 + 30),
        resulted_by_name: "Habyarimana Theogene",
        reviewed_at: minutesAgo(60 * 24 * 3),
        reviewed_by_name: "Uwimana Keza",
        released_at: minutesAgo(60 * 24 * 3),
        is_abnormal: true,
        values: { hb: "10.9", wbc: "7.2", plt: "260" },
        review_note:
          "Slightly low haemoglobin. Eat beans and green vegetables; we check again in a month.",
      },
      SELF_PATIENT_ID,
    ),
  ];
}

export const labMocks: FeatureMockFactory = (context) => {
  const { api } = context;
  const S = `${api}/staff`;
  let db = seed();
  onMockLabOrders((visitId) =>
    db.some((o) => o.order.visit_id === visitId && o.order.state === "ordered"),
  );

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

  const rows = (o: MockOrder, lang: LanguageCode): LabResultItem[] => {
    const test = BY_CODE.get(o.order.test_code)!;
    return test.items.map((i) => {
      const value = o.order.values?.[i.code] ?? "";
      return {
        code: i.code,
        label: i.label[lang],
        kind: i.kind,
        value,
        unit: i.unit,
        low: i.low,
        high: i.high,
        flag: flagOf(i, value),
      };
    });
  };
  const view = (o: MockOrder, lang: LanguageCode, clinician: boolean): LabOrder => {
    const { values, comment, ...rest } = o.order;
    return {
      ...rest,
      test_name: BY_CODE.get(o.order.test_code)!.name[lang],
      result: values ? { items: rows(o, lang), comment } : null,
      review_note: clinician ? rest.review_note : "",
    };
  };
  const OPEN: LabOrderState[] = ["ordered", "sample_taken"];
  const visitOrders = (visitId: string) =>
    db.filter((o) => o.order.visit_id === visitId && o.order.state !== "cancelled");
  const lab = (visitId: string, lang: LanguageCode): LabVisit => {
    const mine = visitOrders(visitId);
    const ticket = mockLabQueue.ticket(visitId);
    return {
      visit_id: visitId,
      ticket,
      patient: mine[0]!.patient,
      unpaid: ticket?.flags.includes("unpaid") ?? false,
      orders: mine.map((o) => view(o, lang, false)),
    };
  };
  const stale = (lang: LanguageCode) =>
    context.errorResponse(409, "conflict", s1("conflict", lang));
  const backIfDone = (o: MockOrder) => {
    if (!visitOrders(o.order.visit_id).some((x) => OPEN.includes(x.order.state)))
      mockLabQueue.back(o.order.visit_id, o.ordered_by);
  };

  return {
    reset() {
      db = seed();
    },
    handlers: [
      http.get(`${S}/lab/tests/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["clinical.write", "lab.operate", "lab.result.enter"]);
        if ("error" in ok) return ok.error;
        return HttpResponse.json(TESTS.map((t) => catalogueRow(t, ok.lang)));
      }),
      http.get(`${S}/consultations/:id/lab-orders/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["clinical.view"]);
        if ("error" in ok) return ok.error;
        const c = mockConsultation(str(params.id));
        if (!c) return notFound(ok.lang);
        return HttpResponse.json(visitOrders(c.visit_id).map((o) => view(o, ok.lang, true)));
      }),
      http.post(`${S}/consultations/:id/lab-orders/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request, ["clinical.write"]);
        if ("error" in ok) return ok.error;
        const c = mockConsultation(str(params.id));
        if (!c) return notFound(ok.lang);
        if (c.status !== "draft" || c.author.full_name !== ok.me.full_name)
          return rule(context, ok.lang);
        const body = (await context.readJson(request)) ?? {};
        const codes = Array.isArray(body.tests) ? [...new Set(body.tests.map(str))] : [];
        if (!codes.length || codes.some((code) => !BY_CODE.has(code)))
          return context.errorResponse(
            422,
            "business_rule_violation",
            "Choose tests from the list.",
            {
              fields: { tests: ["Choose tests from the list."] },
            },
          );
        const open = new Set(
          visitOrders(c.visit_id)
            .filter((o) => OPEN.includes(o.order.state))
            .map((o) => o.order.test_code),
        );
        if (codes.some((code) => open.has(code)))
          return context.errorResponse(
            422,
            "business_rule_violation",
            "This test is already ordered for this visit.",
            { fields: { tests: ["This test is already ordered for this visit."] } },
          );
        const patient: LabPatient = {
          full_name: c.patient.display_name,
          display_name: c.patient.display_name,
          date_of_birth: null,
          age_years: c.patient.age_years,
          sex: c.patient.sex,
          medilink_number: null,
        };
        for (const code of codes)
          db.push({
            order: {
              id: id(),
              visit_id: c.visit_id,
              consultation_id: c.id,
              test_code: code,
              specimen: BY_CODE.get(code)!.specimen,
              state: "ordered",
              reason: str(body.reason).trim(),
              ordered_at: now(),
              ordered_by_name: ok.me.full_name,
              sample_taken_at: null,
              sample_taken_by_name: null,
              resulted_at: null,
              resulted_by_name: null,
              is_abnormal: false,
              reviewed_at: null,
              reviewed_by_name: null,
              review_note: "",
              released_at: null,
              version: 1,
              values: null,
              comment: "",
            },
            patient,
            patient_id: c.patient.id,
            facility_patient_id: c.facility_patient_id,
            ordered_by: MEMBERSHIP_BY_EMAIL[ok.me.email] ?? SETUP_IDS.mKeza,
          });
        return HttpResponse.json(
          visitOrders(c.visit_id).map((o) => view(o, ok.lang, true)),
          { status: 201 },
        );
      }),
      http.get(`${S}/lab/queue/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["lab.operate", "lab.result.enter"]);
        if ("error" in ok) return ok.error;
        const today = now().slice(0, 10);
        const visits = [
          ...new Set(
            db
              .filter(
                (o) =>
                  OPEN.includes(o.order.state) ||
                  (o.order.state !== "cancelled" && o.order.resulted_at?.slice(0, 10) === today),
              )
              .map((o) => o.order.visit_id),
          ),
        ].map((v) => lab(v, ok.lang));
        const has = (v: LabVisit, state: LabOrderState) => v.orders.some((o) => o.state === state);
        return HttpResponse.json({
          waiting: visits.filter((v) => has(v, "ordered")),
          in_progress: visits.filter((v) => !has(v, "ordered") && has(v, "sample_taken")),
          done_today: visits.filter((v) => !has(v, "ordered") && !has(v, "sample_taken")),
        });
      }),
      http.get(`${S}/lab/results/`, async ({ request }) => {
        await context.settle();
        const ok = staff(request, ["clinical.write"]);
        if ("error" in ok) return ok.error;
        const me = MEMBERSHIP_BY_EMAIL[ok.me.email] ?? "unknown";
        return HttpResponse.json(
          db
            .filter((o) => o.ordered_by === me && ["resulted", "reviewed"].includes(o.order.state))
            .map((o) => ({
              order: view(o, ok.lang, true),
              patient: o.patient,
              facility_patient_id: o.facility_patient_id,
            })),
        );
      }),
      http.post(`${S}/lab-orders/:id/:step/`, async ({ request, params }) => {
        await context.settle();
        const step = str(params.step);
        const needs: Record<string, string> = {
          sample: "lab.operate",
          result: "lab.result.enter",
          review: "clinical.write",
          release: "clinical.write",
          cancel: "clinical.write",
        };
        if (!needs[step]) return new HttpResponse(null, { status: 404 });
        const ok = staff(request, [needs[step]]);
        if ("error" in ok) return ok.error;
        const o = db.find((x) => x.order.id === params.id);
        if (!o) return notFound(ok.lang);
        const body = (await context.readJson(request)) ?? {};
        if (Number(body.version) !== o.order.version) return stale(ok.lang);
        const at = now();
        const clinician = step !== "sample" && step !== "result";
        switch (step) {
          case "sample":
            if (o.order.state !== "ordered") return rule(context, ok.lang);
            Object.assign(o.order, {
              state: "sample_taken",
              sample_taken_at: at,
              sample_taken_by_name: ok.me.full_name,
            });
            if (!visitOrders(o.order.visit_id).some((x) => x.order.state === "ordered"))
              mockLabQueue.sampled(o.order.visit_id);
            break;
          case "result": {
            if (o.order.state !== "sample_taken") return rule(context, ok.lang);
            const test = BY_CODE.get(o.order.test_code)!;
            const given = (body.values ?? {}) as Record<string, unknown>;
            const errors: Record<string, string> = {};
            const values: Record<string, string> = {};
            for (const item of test.items) {
              const raw = str(given[item.code]).trim();
              if (!raw) errors[`values.${item.code}`] = "Enter this result.";
              else if (item.kind === "number" && !Number.isFinite(Number(raw.replace(",", "."))))
                errors[`values.${item.code}`] = "Enter a number.";
              else if (item.kind === "choice" && !item.choices.includes(raw))
                errors[`values.${item.code}`] = "Choose one of the answers.";
              else values[item.code] = item.kind === "number" ? raw.replace(",", ".") : raw;
            }
            if (Object.keys(errors).length) return fieldError(context, ok.lang, errors);
            Object.assign(o.order, {
              state: "resulted",
              values,
              comment: str(body.comment).trim(),
              resulted_at: at,
              resulted_by_name: ok.me.full_name,
              is_abnormal: test.items.some((i) => flagOf(i, values[i.code] ?? "")),
            });
            backIfDone(o);
            break;
          }
          case "review":
            if (o.order.state !== "resulted") return rule(context, ok.lang);
            Object.assign(o.order, {
              state: "reviewed",
              review_note: str(body.note).trim(),
              reviewed_at: at,
              reviewed_by_name: ok.me.full_name,
            });
            break;
          case "release":
            if (o.order.state !== "reviewed") return rule(context, ok.lang);
            Object.assign(o.order, { state: "released", released_at: at });
            break;
          case "cancel":
            if (o.order.state !== "ordered" || o.order.ordered_by_name !== ok.me.full_name)
              return rule(context, ok.lang);
            o.order.state = "cancelled";
            backIfDone(o);
            break;
        }
        o.order.version += 1;
        return HttpResponse.json(view(o, ok.lang, clinician));
      }),

      // ---- patient: released results only
      http.get(`${api}/patient/results/`, async ({ request }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const auth = context.authenticatedPatient(lang);
        if ("error" in auth) return auth.error;
        const profiles = new Set(auth.me.profiles.map((p) => p.patient_id));
        const wanted = new URL(request.url).searchParams.get("patient_id");
        const out: PatientLabResult[] = db
          .filter(
            (o) =>
              o.order.state === "released" &&
              profiles.has(o.patient_id) &&
              (!wanted || o.patient_id === wanted),
          )
          .sort((a, b) => (b.order.released_at ?? "").localeCompare(a.order.released_at ?? ""))
          .map((o) => ({
            id: o.order.id,
            patient_id: o.patient_id,
            facility_name: FACILITIES.kigaliClinic.name,
            test_code: o.order.test_code,
            test_name: BY_CODE.get(o.order.test_code)!.name[lang],
            ordered_at: o.order.ordered_at,
            released_at: o.order.released_at!,
            doctor_name: o.order.reviewed_by_name ?? o.order.ordered_by_name ?? "",
            items: rows(o, lang),
            is_abnormal: o.order.is_abnormal,
            note: o.order.review_note,
          }));
        return HttpResponse.json(out);
      }),
    ],
  };
};
