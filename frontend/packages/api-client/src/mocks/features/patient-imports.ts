import { http, HttpResponse } from "msw";

import {
  PATIENT_IMPORT_FIELDS,
  PATIENT_IMPORT_PURPOSE,
  type PatientImportBatch,
  type PatientImportField,
  type PatientImportMapping,
  type PatientImportRow,
} from "../../features/patient-imports";
import type { LanguageCode } from "../../types";
import type { FeatureMockFactory } from "../features";
import { id, now, page } from "./s1-common";
import { uploadStore } from "./uploads";

/**
 * S6b legacy register import mocks (contract sprint-06 §3.3 L1), the backend's rules in memory:
 * the uploaded CSV is parsed for real; the suggested mapping, the row checks (required name and
 * sex, dates, phones), likely duplicates (a name already registered) and the 7-day rollback
 * follow `medilink/clinical/imports.py`. Members with `records.import` (facility admins).
 */
const MAX_ROWS = 5000;
const ROLLBACK_DAYS = 7;
/** Names already on the register: an imported row with one of these is a likely duplicate. */
const KNOWN = new Set(["mukamana jeanne", "habimana eric", "uwase aline", "niyonsaba claudine"]);

const HINTS: Record<PatientImportField, string[]> = {
  full_name: ["name", "full name", "names", "amazina", "nom", "patient"],
  sex: ["sex", "gender", "igitsina", "sexe"],
  date_of_birth: ["dob", "date of birth", "birth date", "born", "itariki", "naissance"],
  phone: ["phone", "telephone", "mobile", "tel", "telefone"],
  file_number: ["file", "file number", "file no", "dossier", "number", "no"],
  national_id: ["national id", "nid", "id number", "indangamuntu"],
};
const SEX: Record<string, string> = {
  m: "male",
  male: "male",
  gabo: "male",
  h: "male",
  homme: "male",
  f: "female",
  female: "female",
  gore: "female",
  femme: "female",
};

const MESSAGES = {
  notCsv: {
    en: "Upload a CSV file with a header row.",
    fr: "Envoyez un fichier CSV avec une ligne d’en-tête.",
    rw: "Ohereza dosiye ya CSV ifite umurongo w’imitwe.",
  },
  tooMany: {
    en: "A file can hold at most 5,000 rows. Split it and import each part.",
    fr: "Un fichier peut contenir au plus 5 000 lignes. Divisez-le et importez chaque partie.",
    rw: "Dosiye imwe ishobora kugira imirongo 5,000 gusa. Yigabanye winjize buri gice.",
  },
  empty: {
    en: "The file has no rows under the header.",
    fr: "Le fichier n’a aucune ligne sous l’en-tête.",
    rw: "Dosiye nta murongo ifite munsi y’imitwe.",
  },
  stale: {
    en: "This import was changed meanwhile. Reload and try again.",
    fr: "Cet import a changé entre-temps. Rechargez et réessayez.",
    rw: "Iyi nyandiko yahinduwe hagati aho. Ongera uyifungure ugerageze.",
  },
  wrongState: {
    en: "This import can't do that in its current state.",
    fr: "Cet import ne permet pas cette action dans son état actuel.",
    rw: "Iyi nyandiko ntiyemera ibyo ubu.",
  },
} satisfies Record<string, Record<LanguageCode, string>>;

/** One CSV line into cells: commas, double-quoted cells with "" escapes. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

export function suggestMapping(headers: string[]): PatientImportMapping {
  const mapping: PatientImportMapping = {};
  const used = new Set<string>();
  for (const field of PATIENT_IMPORT_FIELDS) {
    const hit = headers.find((h) => !used.has(h) && HINTS[field].includes(h.trim().toLowerCase()));
    if (hit) {
      mapping[field] = hit;
      used.add(hit);
    }
  }
  return mapping;
}

function parseDate(value: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  const [y, m, d] = iso
    ? [iso[1], iso[2], iso[3]]
    : dmy
      ? [dmy[3], dmy[2]!.padStart(2, "0"), dmy[1]!.padStart(2, "0")]
      : [];
  if (!y) return null;
  const date = new Date(`${y}-${m}-${d}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(5, 7) !== m
    ? null
    : `${y}-${m}-${d}`;
}

interface MockImport {
  batch: PatientImportBatch;
  raw: string[][];
  rows: PatientImportRow[];
}

export const patientImportsMocks: FeatureMockFactory = (context) => {
  const { api } = context;
  const uploads = uploadStore(context);
  let db: MockImport[] = [];
  const S = `${api}/staff/patient-imports`;

  const say = (lang: LanguageCode, key: keyof typeof MESSAGES, status = 422) =>
    context.errorResponse(
      status,
      status === 409 ? "conflict" : "business_rule_violation",
      MESSAGES[key][lang],
    );
  const staff = (request: Request) => {
    const lang = context.languageFrom(request);
    const auth = context.authenticatedStaff(lang);
    if ("error" in auth) return { error: auth.error };
    if (!auth.me.permissions.includes("records.import"))
      return {
        error: context.errorResponse(403, "permission_denied", context.message("notFound", lang)),
      };
    return { lang, name: auth.me.full_name };
  };
  const find = (batchId: unknown) => db.find((m) => m.batch.id === batchId);

  /** Check every row against the mapping (the preview); nothing is created. */
  function check(m: MockImport) {
    const at = (row: string[], field: PatientImportField) => {
      const header = m.batch.column_mapping[field];
      const index = header ? m.batch.headers.indexOf(header) : -1;
      return index >= 0 ? (row[index] ?? "").trim() : "";
    };
    const files = new Set<string>();
    m.rows = m.raw.map((row, i) => {
      const problems: PatientImportRow["problems"] = [];
      const name = at(row, "full_name").split(/\s+/).join(" ").slice(0, 200);
      if (!name) problems.push({ field: "full_name", code: "required" });
      const sex = SEX[at(row, "sex").toLowerCase()] ?? null;
      if (!sex) problems.push({ field: "sex", code: "invalid" });
      const dobText = at(row, "date_of_birth");
      const dob = dobText ? parseDate(dobText) : null;
      if (dobText && !dob) problems.push({ field: "date_of_birth", code: "invalid" });
      else if (dob && (dob > now().slice(0, 10) || dob < "1900-01-01"))
        problems.push({ field: "date_of_birth", code: "out_of_range" });
      const phone = at(row, "phone").replace(/[\s-]/g, "");
      if (phone && !/^(\+?250|0)?7\d{8}$/.test(phone))
        problems.push({ field: "phone", code: "invalid" });
      const nid = at(row, "national_id").replace(/\s/g, "");
      if (nid && !/^\d{16}$/.test(nid)) problems.push({ field: "national_id", code: "invalid" });
      const file = at(row, "file_number") || null;
      if (file && files.has(file)) problems.push({ field: "file_number", code: "taken" });
      if (file) files.add(file);
      const duplicate = !problems.length && KNOWN.has(name.toLowerCase());
      return {
        row_number: i + 2,
        status: problems.length ? "error" : duplicate ? "duplicate" : "valid",
        full_name: name,
        sex,
        date_of_birth: dob,
        file_number: file,
        has_national_id: Boolean(nid),
        problems,
        matched_patient_id: duplicate ? id() : null,
        created_facility_patient_id: null,
      };
    });
    const count = (s: string) => m.rows.filter((r) => r.status === s).length;
    Object.assign(m.batch, {
      status: "previewed",
      valid_count: count("valid"),
      error_count: count("error"),
      duplicate_count: count("duplicate"),
    });
  }

  const handlers = [
    http.get(`${S}/`, async ({ request }) => {
      await context.settle();
      const ok = staff(request);
      if ("error" in ok) return ok.error;
      const rows = [...db]
        .sort((a, b) => b.batch.created_at.localeCompare(a.batch.created_at))
        .map((m) => m.batch);
      return HttpResponse.json(page(rows, new URL(request.url)));
    }),
    http.post(`${S}/`, async ({ request }) => {
      await context.settle();
      const ok = staff(request);
      if ("error" in ok) return ok.error;
      const body = await context.readJson(request);
      const uploadId = typeof body.upload_id === "string" ? body.upload_id : "";
      const stored = uploads.get(uploadId);
      if (!stored || stored.upload.purpose !== PATIENT_IMPORT_PURPOSE)
        return context.validationError(ok.lang, { upload_id: ["Upload the CSV file first."] });
      uploads.settleScan(uploadId);
      const lines = new TextDecoder()
        .decode(stored.bytes)
        .replace(new RegExp(`^${String.fromCharCode(0xfeff)}`), "")
        .split(/\r?\n/)
        .filter((l) => l.trim());
      const headers = lines[0] ? cells(lines[0]) : [];
      if (headers.length < 2) return say(ok.lang, "notCsv");
      const raw = lines.slice(1).map(cells);
      if (!raw.length) return say(ok.lang, "empty");
      if (raw.length > MAX_ROWS) return say(ok.lang, "tooMany");
      const m: MockImport = {
        batch: {
          id: id(),
          status: "uploaded",
          file_name: stored.upload.original_filename,
          headers,
          column_mapping: suggestMapping(headers),
          row_count: raw.length,
          valid_count: 0,
          error_count: 0,
          duplicate_count: 0,
          created_count: 0,
          created_by_name: ok.name,
          created_at: now(),
          confirmed_at: null,
          rollback_until: null,
          can_roll_back: false,
          rolled_back_at: null,
          version: 1,
        },
        raw,
        rows: [],
      };
      db.push(m);
      return HttpResponse.json(m.batch, { status: 201 });
    }),
    http.get(`${S}/:id/`, async ({ request, params }) => {
      await context.settle();
      const ok = staff(request);
      if ("error" in ok) return ok.error;
      const m = find(params.id);
      return m
        ? HttpResponse.json(m.batch)
        : context.errorResponse(404, "not_found", context.message("notFound", ok.lang));
    }),
    http.put(`${S}/:id/mapping/`, async ({ request, params }) => {
      await context.settle();
      const ok = staff(request);
      if ("error" in ok) return ok.error;
      const m = find(params.id);
      if (!m) return context.errorResponse(404, "not_found", context.message("notFound", ok.lang));
      const body = await context.readJson(request);
      if (Number(body.version) !== m.batch.version) return say(ok.lang, "stale", 409);
      if (m.batch.status !== "uploaded" && m.batch.status !== "previewed")
        return say(ok.lang, "wrongState");
      const given = (body.mapping ?? {}) as Record<string, unknown>;
      const mapping: PatientImportMapping = {};
      for (const field of PATIENT_IMPORT_FIELDS) {
        const header = given[field];
        if (typeof header === "string" && header) {
          if (!m.batch.headers.includes(header))
            return context.validationError(ok.lang, { [`mapping.${field}`]: ["Not a column."] });
          mapping[field] = header;
        }
      }
      if (!mapping.full_name || !mapping.sex)
        return context.validationError(ok.lang, {
          mapping: ["Choose the columns for the name and the sex."],
        });
      m.batch.column_mapping = mapping;
      check(m);
      m.batch.version += 1;
      return HttpResponse.json(m.batch);
    }),
    http.get(`${S}/:id/rows/`, async ({ request, params }) => {
      await context.settle();
      const ok = staff(request);
      if ("error" in ok) return ok.error;
      const m = find(params.id);
      if (!m) return context.errorResponse(404, "not_found", context.message("notFound", ok.lang));
      const url = new URL(request.url);
      const status = url.searchParams.get("status");
      return HttpResponse.json(
        page(
          m.rows.filter((r) => !status || r.status === status),
          url,
        ),
      );
    }),
    ...(["confirm", "rollback"] as const).map((step) =>
      http.post(`${S}/:id/${step}/`, async ({ request, params }) => {
        await context.settle();
        const ok = staff(request);
        if ("error" in ok) return ok.error;
        const m = find(params.id);
        if (!m)
          return context.errorResponse(404, "not_found", context.message("notFound", ok.lang));
        const body = await context.readJson(request);
        if (Number(body.version) !== m.batch.version) return say(ok.lang, "stale", 409);
        if (step === "confirm") {
          if (m.batch.status !== "previewed" || !m.batch.valid_count)
            return say(ok.lang, "wrongState");
          for (const r of m.rows)
            if (r.status === "valid") {
              r.status = "created";
              r.created_facility_patient_id = id();
            }
          Object.assign(m.batch, {
            status: "confirmed",
            created_count: m.rows.filter((r) => r.status === "created").length,
            confirmed_at: now(),
            rollback_until: new Date(Date.now() + ROLLBACK_DAYS * 86_400_000).toISOString(),
            can_roll_back: true,
          });
        } else {
          if (!m.batch.can_roll_back) return say(ok.lang, "wrongState");
          for (const r of m.rows) if (r.status === "created") r.status = "rolled_back";
          Object.assign(m.batch, {
            status: "rolled_back",
            rolled_back_at: now(),
            can_roll_back: false,
          });
        }
        m.batch.version += 1;
        return HttpResponse.json(m.batch);
      }),
    ),
  ];

  return {
    handlers,
    reset: () => {
      db = [];
    },
  };
};
