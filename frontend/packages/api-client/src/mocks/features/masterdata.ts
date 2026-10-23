import { http, HttpResponse } from "msw";

import {
  ALL_LANGUAGE_KINDS,
  IMPORTABLE_KINDS,
  MASTER_DATA_KINDS,
  PUBLIC_MASTER_DATA_KINDS,
  type MasterDataChange,
  type MasterDataImport,
  type MasterDataKind,
} from "../../features/masterdata";
import type { LanguageCode } from "../../types";
import type { FeatureMockFactory } from "../features";
import {
  conflict,
  fieldError,
  id,
  now,
  page,
  platformAdmin,
  rule,
  s1,
  stepUpFailure,
  str,
} from "./s1-common";
import { uploadStore } from "./uploads";

/**
 * Master data mocks (sprint-01 §3.2, §3.3, §3.5). Small fictional-but-plausible seed; sectors,
 * cells and villages use `DEV-` codes like the backend's dev seed.
 */

type Row = Record<string, unknown> & {
  id: string;
  version: number;
  is_active: boolean;
  sort_order: number;
};
type I18n = Partial<Record<LanguageCode, string>>;

const tr = (rw: string, en: string, fr: string): I18n => ({ rw, en, fr });
const LANGS: LanguageCode[] = ["rw", "en", "fr"];

const DISTRICTS: [string, string, string][] = [
  ["11", "1", "Nyarugenge"],
  ["12", "1", "Gasabo"],
  ["13", "1", "Kicukiro"],
  ["21", "2", "Nyanza"],
  ["24", "2", "Huye"],
  ["27", "2", "Muhanga"],
  ["33", "3", "Rubavu"],
  ["36", "3", "Rusizi"],
  ["43", "4", "Musanze"],
  ["45", "4", "Gicumbi"],
  ["51", "5", "Rwamagana"],
  ["57", "5", "Bugesera"],
];

function seed(): Record<MasterDataKind, Row[]> {
  let order = 0;
  const row = (values: Record<string, unknown>): Row => ({
    id: id(),
    version: 1,
    is_active: true,
    sort_order: order++,
    created_at: now(),
    updated_at: now(),
    ...values,
  });
  const locations = [
    ...[
      ["1", "Umujyi wa Kigali"],
      ["2", "Amajyepfo"],
      ["3", "Iburengerazuba"],
      ["4", "Amajyaruguru"],
      ["5", "Iburasirazuba"],
    ].map(([code, name]) => row({ code, level: "province", parent_code: null, name })),
    ...DISTRICTS.map(([code, parent, name]) =>
      row({ code, level: "district", parent_code: parent, name }),
    ),
    row({ code: "DEV-1201", level: "sector", parent_code: "12", name: "Kimironko" }),
    row({ code: "DEV-120101", level: "cell", parent_code: "DEV-1201", name: "Bibare" }),
    row({
      code: "DEV-12010101",
      level: "village",
      parent_code: "DEV-120101",
      name: "Bibare 1 (sample)",
    }),
    row({
      code: "DEV-12010102",
      level: "village",
      parent_code: "DEV-120101",
      name: "Bibare 2 (sample)",
    }),
    row({ code: "DEV-1101", level: "sector", parent_code: "11", name: "Nyarugenge" }),
    row({ code: "DEV-110101", level: "cell", parent_code: "DEV-1101", name: "Kiyovu" }),
    row({
      code: "DEV-11010101",
      level: "village",
      parent_code: "DEV-110101",
      name: "Kiyovu 1 (sample)",
    }),
  ];
  return {
    locations,
    "facility-types": [
      ["health_center", "primary", tr("Ikigo nderabuzima", "Health center", "Centre de santé")],
      [
        "district_hospital",
        "secondary",
        tr("Ibitaro by'akarere", "District hospital", "Hôpital de district"),
      ],
      ["private_clinic", "primary", tr("Ivuriro ryigenga", "Private clinic", "Clinique privée")],
      ["polyclinic", "secondary", tr("Polikilinike", "Polyclinic", "Polyclinique")],
      ["dental_clinic", "primary", tr("Ivuriro ry'amenyo", "Dental clinic", "Cabinet dentaire")],
    ].map(([code, level, name]) => row({ code, level_of_care: level, name_i18n: name })),
    "service-catalogue-items": [
      [
        "general_consultation",
        tr("Isuzumwa rusange", "General consultation", "Consultation générale"),
      ],
      ["antenatal_care", tr("Kwipimisha utwite", "Antenatal care", "Consultation prénatale")],
      ["vaccination", tr("Gukingira", "Vaccination", "Vaccination")],
      [
        "laboratory_tests",
        tr("Ibizamini bya laboratwari", "Laboratory tests", "Analyses de laboratoire"),
      ],
    ].map(([code, name]) =>
      row({
        code,
        name_i18n: name,
        synonyms_i18n: {},
        min_age_months: null,
        max_age_months: null,
        sex_restriction: null,
      }),
    ),
    insurers: [
      ["mutuelle", "RSSB Community-Based Health Insurance (Mutuelle de santé)", "community", true],
      ["rama", "RSSB Medical Scheme (RAMA)", "social", true],
      ["mmi", "Military Medical Insurance (MMI)", "military", true],
      ["private_other", "Private insurer (other)", "private", false],
    ].map(([code, name, scheme, referral]) =>
      row({ code, name, scheme, follows_referral_pathway: referral }),
    ),
    drugs: [
      row({
        code: "AMOX500C",
        generic_name: "Amoxicillin",
        strength: "500 mg",
        form: "capsule",
        default_route: "oral",
        drug_class: "penicillin",
        is_controlled: false,
        is_essential_list: true,
        max_usual_quantity: 30,
      }),
      row({
        code: "PCM500T",
        generic_name: "Paracetamol",
        strength: "500 mg",
        form: "tablet",
        default_route: "oral",
        drug_class: "analgesic",
        is_controlled: false,
        is_essential_list: true,
        max_usual_quantity: 60,
      }),
    ],
    "diagnosis-codes": [
      row({
        code_system: "icd10",
        code: "B54",
        title_i18n: { en: "Unspecified malaria", fr: "Paludisme, sans précision" },
        plain_language_i18n: { en: "Malaria" },
        is_sensitive: false,
      }),
      row({
        code_system: "icd10",
        code: "I10",
        title_i18n: { en: "Essential (primary) hypertension" },
        plain_language_i18n: {},
        is_sensitive: false,
      }),
    ],
    symptoms: [
      row({
        code: "fever",
        name_i18n: tr("Umuriro", "Fever", "Fièvre"),
        body_system: "general",
        icd_code: "R50.9",
      }),
      row({
        code: "cough",
        name_i18n: tr("Inkorora", "Cough", "Toux"),
        body_system: "respiratory",
        icd_code: "R05",
      }),
    ],
    "public-holidays": [
      row({
        holiday_date: "2026-07-04",
        name_i18n: tr("Umunsi wo Kwibohora", "Liberation Day", "Fête de la libération"),
        is_provisional: false,
      }),
      row({
        holiday_date: "2026-12-25",
        name_i18n: tr("Noheli", "Christmas Day", "Noël"),
        is_provisional: false,
      }),
    ],
    "reason-codes": [
      [
        "application_rejection",
        "invalid_licence",
        tr(
          "Uruhushya rutemewe",
          "Licence invalid or not verifiable",
          "Licence invalide ou invérifiable",
        ),
        false,
      ],
      [
        "application_rejection",
        "duplicate",
        tr("Ubusabe busanzwe buhari", "Duplicate application", "Demande en double"),
        false,
      ],
      ["application_rejection", "other", tr("Indi mpamvu", "Other reason", "Autre raison"), true],
      [
        "facility_suspension",
        "licence_expired",
        tr("Uruhushya rwarangiye", "Licence expired", "Licence expirée"),
        false,
      ],
      ["facility_suspension", "other", tr("Indi mpamvu", "Other reason", "Autre raison"), true],
      [
        "facility_reactivation",
        "licence_renewed",
        tr("Uruhushya rwavuguruwe", "Licence renewed", "Licence renouvelée"),
        false,
      ],
      ["facility_reactivation", "other", tr("Indi mpamvu", "Other reason", "Autre raison"), true],
      [
        "facility_deactivation",
        "closed",
        tr("Ikigo cyafunze", "Facility closed", "Établissement fermé"),
        false,
      ],
      ["facility_deactivation", "other", tr("Indi mpamvu", "Other reason", "Autre raison"), true],
    ].map(([kind, code, label, text]) =>
      row({ kind, code, label_i18n: label, requires_text: text }),
    ),
  };
}

const IDENTITY: Partial<Record<MasterDataKind, string[]>> = {
  "public-holidays": ["holiday_date"],
  "reason-codes": ["kind", "code"],
  "diagnosis-codes": ["code_system", "code"],
};
const identity = (kind: MasterDataKind) => IDENTITY[kind] ?? ["code"];

function localise(value: unknown, lang: LanguageCode): string {
  const text = (value ?? {}) as I18n;
  return text[lang] || text.en || LANGS.map((l) => text[l]).find(Boolean) || "";
}

function localised(kind: MasterDataKind, row: Row, lang: LanguageCode, rows: Row[]) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (["sort_order", "created_at", "updated_at"].includes(key)) continue;
    if (key === "synonyms_i18n")
      out.synonyms = ((value ?? {}) as Record<string, string[]>)[lang] ?? [];
    else if (key.endsWith("_i18n")) out[key.slice(0, -5)] = localise(value, lang);
    else out[key] = value;
  }
  if (kind === "locations")
    out.has_children = rows.some((r) => r.parent_code === row.code && r.is_active);
  return out;
}

function missingLanguages(row: Row): LanguageCode[] {
  const missing = new Set<LanguageCode>();
  for (const [key, value] of Object.entries(row)) {
    if (!key.endsWith("_i18n") || key === "synonyms_i18n" || key === "plain_language_i18n")
      continue;
    for (const lang of LANGS) if (!((value ?? {}) as I18n)[lang]) missing.add(lang);
  }
  return LANGS.filter((l) => missing.has(l));
}

function matches(row: Row, q: string): boolean {
  const needle = q.toLowerCase();
  return Object.values(row).some((value) =>
    typeof value === "string"
      ? value.toLowerCase().includes(needle)
      : value && typeof value === "object"
        ? Object.values(value).some(
            (v) => typeof v === "string" && v.toLowerCase().includes(needle),
          )
        : false,
  );
}

export const masterDataMocks: FeatureMockFactory = (context) => {
  const { api } = context;
  let data = seed();
  const changes = new Map<string, MasterDataChange[]>();
  const imports = new Map<string, MasterDataImport & { polls: number; rowsCsv: string[] }>();
  const uploads = uploadStore(context);
  const isKind = (value: unknown): value is MasterDataKind =>
    MASTER_DATA_KINDS.includes(value as MasterDataKind);

  function filtered(kind: MasterDataKind, url: URL, includeRetired: boolean) {
    let rows = data[kind].filter((r) => includeRetired || r.is_active);
    const params = url.searchParams;
    if (kind === "locations") {
      if (params.get("parent")) rows = rows.filter((r) => r.parent_code === params.get("parent"));
      else if (!params.get("level") && !params.get("q") && !includeRetired)
        rows = rows.filter((r) => r.level === "province");
    }
    for (const [key, value] of params.entries()) {
      if (["q", "page", "page_size", "parent", "missing_language", "year"].includes(key)) continue;
      if (key === "is_active") rows = rows.filter((r) => str(r.is_active) === value);
      else rows = rows.filter((r) => (key in r ? str(r[key]) === value : true));
    }
    if (params.get("year"))
      rows = rows.filter((r) => str(r.holiday_date ?? "").startsWith(params.get("year")!));
    const missing = params.get("missing_language") as LanguageCode | null;
    if (missing) rows = rows.filter((r) => missingLanguages(r).includes(missing));
    const q = params.get("q");
    if (q) rows = rows.filter((r) => matches(r, q));
    return rows;
  }

  function record(
    kind: MasterDataKind,
    row: Row,
    action: MasterDataChange["action"],
    old: Row | null,
    actor: { id: string; full_name: string },
  ) {
    const list = changes.get(row.id) ?? [];
    list.unshift({
      id: id(),
      row_version: row.version,
      action,
      old,
      new: { ...row },
      actor,
      changed_at: now(),
    });
    changes.set(row.id, list);
    void kind;
  }

  function validate(
    kind: MasterDataKind,
    body: Record<string, unknown>,
    lang: LanguageCode,
    existing?: Row,
  ) {
    const fields: Record<string, string> = {};
    for (const key of Object.keys(body)) {
      if (!key.endsWith("_i18n") || key === "synonyms_i18n" || key === "plain_language_i18n")
        continue;
      const value = (body[key] ?? {}) as I18n;
      if (
        ALL_LANGUAGE_KINDS.includes(kind)
          ? LANGS.some((l) => !value[l])
          : !LANGS.some((l) => value[l])
      ) {
        fields[key] = s1("required", lang);
      }
    }
    if (existing) {
      for (const key of identity(kind))
        if (key in body && body[key] !== existing[key]) fields[key] = s1("notAllowed", lang);
    } else {
      for (const key of identity(kind)) if (!body[key]) fields[key] = s1("required", lang);
      const clash = data[kind].some((r) => identity(kind).every((k) => r[k] === body[k]));
      if (clash) fields[identity(kind).at(-1)!] = s1("conflict", lang);
    }
    return Object.keys(fields).length ? fieldError(context, lang, fields) : null;
  }

  const kindParam = (value: unknown, lang: LanguageCode) =>
    isKind(value)
      ? null
      : context.errorResponse(404, "not_found", context.message("notFound", lang));

  return {
    reset() {
      data = seed();
      changes.clear();
      imports.clear();
    },
    handlers: [
      http.get(`${api}/public/master-data/:kind/`, async ({ request, params }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const kind = params.kind as MasterDataKind;
        if (!PUBLIC_MASTER_DATA_KINDS.includes(kind)) return kindParam("", lang)!;
        const rows = filtered(kind, new URL(request.url), false);
        return HttpResponse.json(
          page(
            rows.map((r) => localised(kind, r, lang, data[kind])),
            new URL(request.url),
          ),
          {
            headers: { "Cache-Control": "public, max-age=3600" },
          },
        );
      }),

      http.get(`${api}/staff/master-data/:kind/`, async ({ request, params }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const bad = kindParam(params.kind, lang);
        if (bad) return bad;
        const auth = context.authenticatedStaff(lang);
        if ("error" in auth) return auth.error;
        const kind = params.kind as MasterDataKind;
        const rows = filtered(kind, new URL(request.url), false);
        return HttpResponse.json(
          page(
            rows.map((r) => localised(kind, r, lang, data[kind])),
            new URL(request.url),
          ),
        );
      }),

      http.get(`${api}/platform/master-data/:kind/`, async ({ request, params }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const bad = kindParam(params.kind, lang);
        if (bad) return bad;
        const admin = platformAdmin(context, lang);
        if ("error" in admin) return admin.error;
        const kind = params.kind as MasterDataKind;
        const rows = filtered(kind, new URL(request.url), true);
        return HttpResponse.json(
          page(
            rows.map((r) => ({ ...r, missing_languages: missingLanguages(r) })),
            new URL(request.url),
          ),
        );
      }),

      http.post(`${api}/platform/master-data/:kind/`, async ({ request, params }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const csrf = context.csrfFailure(request, lang);
        if (csrf) return csrf;
        const bad = kindParam(params.kind, lang);
        if (bad) return bad;
        const admin = platformAdmin(context, lang);
        if ("error" in admin) return admin.error;
        const stepUp = stepUpFailure(context, lang);
        if (stepUp) return stepUp;
        const kind = params.kind as MasterDataKind;
        const body = await context.readJson(request);
        const invalid = validate(kind, body, lang);
        if (invalid) return invalid;
        const row: Row = {
          is_active: true,
          sort_order: 0,
          ...body,
          id: id(),
          version: 1,
          created_at: now(),
          updated_at: now(),
        };
        data[kind].push(row);
        record(kind, row, "create", null, admin.me);
        return HttpResponse.json(
          { ...row, missing_languages: missingLanguages(row) },
          { status: 201 },
        );
      }),

      http.get(`${api}/platform/master-data/:kind/:id/`, async ({ request, params }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const admin = platformAdmin(context, lang);
        if ("error" in admin) return admin.error;
        if (!isKind(params.kind)) return kindParam("", lang)!;
        const row = data[params.kind].find((r) => r.id === params.id);
        if (!row) return context.errorResponse(404, "not_found", context.message("notFound", lang));
        return HttpResponse.json({ ...row, missing_languages: missingLanguages(row) });
      }),

      http.patch(`${api}/platform/master-data/:kind/:id/`, async ({ request, params }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const csrf = context.csrfFailure(request, lang);
        if (csrf) return csrf;
        const admin = platformAdmin(context, lang);
        if ("error" in admin) return admin.error;
        if (!isKind(params.kind)) return kindParam("", lang)!;
        const kind = params.kind;
        const stepUp = stepUpFailure(context, lang);
        if (stepUp) return stepUp;
        const row = data[kind].find((r) => r.id === params.id);
        if (!row) return context.errorResponse(404, "not_found", context.message("notFound", lang));
        const body = await context.readJson(request);
        if (body.version !== row.version) return conflict(context, lang);
        const invalid = validate(kind, body, lang, row);
        if (invalid) return invalid;
        const old = { ...row };
        const { version: _version, ...changesBody } = body;
        void _version;
        Object.assign(row, changesBody, { version: row.version + 1, updated_at: now() });
        const action =
          old.is_active && !row.is_active
            ? "retire"
            : !old.is_active && row.is_active
              ? "restore"
              : "update";
        record(kind, row, action, old, admin.me);
        return HttpResponse.json({ ...row, missing_languages: missingLanguages(row) });
      }),

      http.get(`${api}/platform/master-data/:kind/:id/changes/`, async ({ request, params }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const admin = platformAdmin(context, lang);
        if ("error" in admin) return admin.error;
        return HttpResponse.json(page(changes.get(str(params.id)) ?? [], new URL(request.url)));
      }),

      http.post(`${api}/platform/master-data/:kind/imports/`, async ({ request, params }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const csrf = context.csrfFailure(request, lang);
        if (csrf) return csrf;
        const admin = platformAdmin(context, lang);
        if ("error" in admin) return admin.error;
        const kind = params.kind as MasterDataKind;
        if (!IMPORTABLE_KINDS.includes(kind)) return kindParam("", lang)!;
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File))
          return fieldError(context, lang, { file: s1("required", lang) });
        const received = await uploads.receive(
          file,
          "masterdata_import",
          `platform:${admin.me.email}`,
          lang,
        );
        if ("error" in received) return received.error;
        const lines = (await file.text()).split(/\r?\n/).filter(Boolean);
        const job = {
          id: id(),
          kind,
          mode: str(form.get("mode") ?? "upsert") as MasterDataImport["mode"],
          status: "validating" as const,
          upload: received.upload,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          confirmed_at: null,
          applied_at: null,
          summary: { rows: 0, create: 0, update: 0, retire: 0, unchanged: 0, errors: 0 },
          errors: [],
          sample_changes: [],
          polls: 0,
          rowsCsv: lines,
        };
        imports.set(job.id, job);
        const { polls: _p, rowsCsv: _r, ...publicJob } = job;
        void _p;
        void _r;
        return HttpResponse.json(publicJob, { status: 202 });
      }),

      http.get(
        `${api}/platform/master-data/:kind/imports/:importId/`,
        async ({ request, params }) => {
          await context.settle();
          const lang = context.languageFrom(request);
          const admin = platformAdmin(context, lang);
          if ("error" in admin) return admin.error;
          const job = imports.get(str(params.importId));
          if (!job)
            return context.errorResponse(404, "not_found", context.message("notFound", lang));
          job.polls += 1;
          if (job.status === "validating" && job.polls >= 1) {
            const [header, ...rows] = job.rowsCsv;
            const errors = rows
              .map((line, index) => ({ line: index + 2, cells: line.split(",") }))
              .filter((r) => r.cells.length !== (header ?? "").split(",").length)
              .map((r) => ({ line: r.line, field: "", message: "Wrong number of columns." }));
            const valid = rows.length - errors.length;
            job.summary = {
              rows: rows.length,
              create: valid,
              update: 0,
              retire: 0,
              unchanged: 0,
              errors: errors.length,
            };
            job.errors = errors;
            job.sample_changes = rows
              .slice(0, 5)
              .map((line) => ({ code: line.split(",")[0] ?? "", action: "create", changes: {} }));
            job.status = errors.length ? "invalid" : "previewed";
          } else if (job.status === "applying") {
            job.status = "applied";
            job.applied_at = now();
          }
          const { polls: _p, rowsCsv: _r, ...publicJob } = job;
          void _p;
          void _r;
          return HttpResponse.json(publicJob);
        },
      ),

      http.post(
        `${api}/platform/master-data/:kind/imports/:importId/confirm/`,
        async ({ request, params }) => {
          await context.settle();
          const lang = context.languageFrom(request);
          const csrf = context.csrfFailure(request, lang);
          if (csrf) return csrf;
          const admin = platformAdmin(context, lang);
          if ("error" in admin) return admin.error;
          const stepUp = stepUpFailure(context, lang);
          if (stepUp) return stepUp;
          const job = imports.get(str(params.importId));
          if (!job)
            return context.errorResponse(404, "not_found", context.message("notFound", lang));
          if (job.status !== "previewed") return rule(context, lang, "importNotReady");
          job.status = "applying";
          job.confirmed_at = now();
          const { polls: _p, rowsCsv: _r, ...publicJob } = job;
          void _p;
          void _r;
          return HttpResponse.json(publicJob, { status: 202 });
        },
      ),
    ],
  };
};
