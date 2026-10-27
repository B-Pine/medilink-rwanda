import { http, HttpResponse } from "msw";

import type {
  ApplicantApplication,
  ApplicationDocument,
  ApplicationEvent,
  ApplicationStatus,
  FacilityStatus,
  Licence,
  PlatformApplication,
  PlatformFacility,
  StatusEvent,
} from "../../features/onboarding";
import type { LanguageCode } from "../../types";
import type { FeatureMockFactory } from "../features";
import type { MockContext } from "../handlers";
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
 * Facility onboarding mocks (sprint-01 §3.2, §3.5, §6.3): in-memory applications and one applicant
 * session (the browser's). Resume token `mock-resume-token` opens the latest open application.
 */
export const MOCK_RESUME_TOKEN = "mock-resume-token";

const EDITABLE: ApplicationStatus[] = ["draft", "changes_requested"];
const TRANSITIONS: Record<string, [FacilityStatus[], FacilityStatus]> = {
  "start-setup": [["approved"], "setup"],
  "go-live": [["setup"], "live"],
  suspend: [["live"], "suspended"],
  reactivate: [["suspended"], "live"],
  deactivate: [["approved", "setup", "live", "suspended"], "deactivated"],
};
const STEP_UP_ACTIONS = new Set(["go-live", "suspend", "reactivate", "deactivate"]);
const REASON_ACTIONS = new Set(["suspend", "reactivate", "deactivate"]);

interface MockApplication {
  app: PlatformApplication;
  events: ApplicationEvent[];
  keys: Set<string>;
}

interface MockFacility {
  facility: PlatformFacility;
  licences: Licence[];
  events: StatusEvent[];
  keys: Set<string>;
}

function missingFor(app: ApplicantApplication): string[] {
  const missing: string[] = [];
  const checks: [string, unknown][] = [
    ["facility.name", app.facility.name],
    ["facility.facility_type", app.facility.facility_type],
    ["facility.ownership", app.facility.ownership],
    ["facility.phone", app.facility.phone],
    ["facility.email", app.facility.email],
    ["location.village_code", app.location.village_code],
    ["location.address", app.location.address],
    ["applicant.name", app.applicant.name],
    ["applicant.phone", app.applicant.phone],
    ["proposed_admin.name", app.proposed_admin.name],
    ["proposed_admin.email", app.proposed_admin.email],
    ["proposed_admin.phone", app.proposed_admin.phone],
  ];
  for (const [name, value] of checks) if (!value) missing.push(name);
  const kinds =
    app.facility.ownership === "public"
      ? ["moh_licence"]
      : ["moh_licence", "rdb_registration", "tin_certificate"];
  for (const kind of kinds) {
    const docs = app.documents.filter((d) => d.kind === kind);
    if (!docs.length || (kind === "moh_licence" && !docs.some((d) => d.number && d.expires_on))) {
      missing.push(`documents.${kind}`);
    }
  }
  return missing;
}

function blankApplication(
  applicant: ApplicantApplication["applicant"],
  facilityName: string,
  language: LanguageCode,
): PlatformApplication {
  return {
    id: id(),
    status: "draft",
    version: 1,
    facility: {
      name: facilityName,
      facility_type: "",
      level_of_care: "",
      ownership: "",
      organization_name: "",
      phone: "",
      email: "",
    },
    location: { village_code: null, address: "", latitude: null, longitude: null, path: [] },
    applicant,
    proposed_admin: { name: "", email: "", phone: "" },
    claimed_insurer_codes: [],
    documents: [],
    agreements: {
      accepted_terms_version: null,
      accepted_dpa_version: null,
      ncsa_registration_confirmed: false,
    },
    feedback: { general_comment: "", items: [], rejection: null },
    missing_for_submit: [],
    preferred_language: language,
    submitted_at: null,
    updated_at: now(),
    created_by_platform: false,
    reviewer: null,
    facility_id: null,
    suggested_slug: facilityName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
    last_activity_at: now(),
    duplicate_hints: [],
  };
}

function applicantView(app: PlatformApplication): ApplicantApplication {
  const {
    created_by_platform: _a,
    reviewer: _b,
    facility_id: _c,
    suggested_slug: _d,
    last_activity_at: _e,
    duplicate_hints: _f,
    ...rest
  } = app;
  void [_a, _b, _c, _d, _e, _f];
  return { ...rest, missing_for_submit: EDITABLE.includes(app.status) ? missingFor(app) : [] };
}

export const onboardingMocks: FeatureMockFactory = (context: MockContext) => {
  const { api } = context;
  const uploads = uploadStore(context);
  const applications = new Map<string, MockApplication>();
  const facilities = new Map<string, MockFacility>();
  let applicantSession: string | null = null;

  const lang = (request: Request) => context.languageFrom(request);
  const notFound = (l: LanguageCode) =>
    context.errorResponse(404, "not_found", context.message("notFound", l));

  function touch(entry: MockApplication) {
    entry.app.version += 1;
    entry.app.updated_at = now();
    entry.app.last_activity_at = now();
    entry.app.missing_for_submit = EDITABLE.includes(entry.app.status) ? missingFor(entry.app) : [];
  }

  function event(
    entry: MockApplication,
    kind: ApplicationEvent["kind"],
    fields: Partial<ApplicationEvent> = {},
  ) {
    entry.events.push({
      id: id(),
      kind,
      from_status: "",
      to_status: "",
      actor_kind: "applicant",
      actor: null,
      note_kind: "",
      note: "",
      reason_code: "",
      item_comments: [],
      metadata: {},
      occurred_at: now(),
      occurred_on: null,
      ...fields,
    });
  }

  function transition(
    entry: MockApplication,
    to: ApplicationStatus,
    actor: { id: string; full_name: string } | null,
    extra: Partial<ApplicationEvent> = {},
  ) {
    const from = entry.app.status;
    entry.app.status = to;
    touch(entry);
    event(entry, "status_change", {
      from_status: from,
      to_status: to,
      actor_kind: actor ? "platform_admin" : "applicant",
      actor,
      ...extra,
    });
  }

  function applyPatch(entry: MockApplication, body: Record<string, unknown>) {
    const app = entry.app;
    const group = <K extends "facility" | "applicant" | "proposed_admin">(key: K) => {
      if (body[key] && typeof body[key] === "object") Object.assign(app[key], body[key]);
    };
    group("facility");
    group("applicant");
    group("proposed_admin");
    const location = body.location as Record<string, unknown> | undefined;
    if (location) {
      if ("village_code" in location) {
        const code = location.village_code ? str(location.village_code) : null;
        app.location.village_code = code;
        app.location.path = code ? [{ level: "village", code, name: code }] : [];
      }
      for (const key of ["address", "latitude", "longitude"] as const) {
        if (key in location) (app.location as Record<string, unknown>)[key] = location[key];
      }
    }
    if (Array.isArray(body.claimed_insurer_codes))
      app.claimed_insurer_codes = body.claimed_insurer_codes.map(String);
  }

  async function addDocument(
    entry: MockApplication,
    request: Request,
    owner: string,
    l: LanguageCode,
  ) {
    if (!EDITABLE.includes(entry.app.status)) return rule(context, l, "notEditable");
    const key = request.headers.get("Idempotency-Key");
    if (key && entry.keys.has(`doc:${key}`)) {
      return HttpResponse.json(entry.app.documents.at(-1), { status: 201 });
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fieldError(context, l, { file: s1("required", l) });
    const received = await uploads.receive(file, "facility_application_document", owner, l);
    if ("error" in received) return received.error;
    const document: ApplicationDocument = {
      id: id(),
      kind: str(form.get("kind") ?? "other") as ApplicationDocument["kind"],
      insurer_code: form.get("insurer_code") ? str(form.get("insurer_code")) : null,
      number: str(form.get("number") ?? ""),
      issued_on: form.get("issued_on") ? str(form.get("issued_on")) : null,
      expires_on: form.get("expires_on") ? str(form.get("expires_on")) : null,
      review_status: "pending",
      review_comment: "",
      upload: received.upload,
    };
    entry.app.documents.push(document);
    if (key) entry.keys.add(`doc:${key}`);
    touch(entry);
    return HttpResponse.json(document, { status: 201 });
  }

  /** Documents scan on read (two polls, like /uploads/). */
  function refreshDocuments(entry: MockApplication) {
    for (const document of entry.app.documents)
      document.upload = uploads.poll(document.upload.id) ?? document.upload;
  }

  function applicantEntry(_request: Request, appId: string) {
    const entry = applications.get(appId);
    return entry && applicantSession === appId ? entry : null;
  }

  function facilityView(entry: MockFacility): PlatformFacility {
    const today = new Date().toISOString().slice(0, 10);
    const current = entry.licences
      .filter((l) => !l.superseded_at)
      .sort((a, b) => a.expires_on.localeCompare(b.expires_on));
    const moh = current.find((l) => l.kind === "moh_operating");
    const days = moh ? (Date.parse(moh.expires_on) - Date.parse(today)) / 86_400_000 : null;
    return {
      ...entry.facility,
      version: entry.events.length,
      next_licence_expiry: current[0]?.expires_on ?? null,
      licence_state:
        days === null ? "missing" : days < 0 ? "expired" : days <= 60 ? "expiring" : "valid",
    };
  }

  function seedDemo() {
    const entry: MockApplication = {
      app: blankApplication(
        {
          name: "Mukamana Jeanne",
          email: "jeanne@ubuzima.example",
          phone: "+250788000111",
          position: "Director",
        },
        "Clinique Ubuzima",
        "rw",
      ),
      events: [],
      keys: new Set(),
    };
    Object.assign(entry.app.facility, {
      facility_type: "private_clinic",
      ownership: "private",
      organization_name: "Ubuzima Ltd",
      phone: "+250788123456",
      email: "info@ubuzima.example",
    });
    Object.assign(entry.app.location, {
      village_code: "DEV-12010101",
      address: "KG 11 Ave 5",
      path: [{ level: "village", code: "DEV-12010101", name: "Bibare 1 (sample)" }],
    });
    Object.assign(entry.app.proposed_admin, {
      name: "Habimana Eric",
      email: "eric@ubuzima.example",
      phone: "+250788000222",
    });
    entry.app.status = "submitted";
    entry.app.submitted_at = now();
    event(entry, "status_change", { to_status: "draft" });
    event(entry, "status_change", { from_status: "draft", to_status: "submitted" });
    applications.set(entry.app.id, entry);

    const facility: MockFacility = {
      facility: {
        id: "4f0c1d2e-5b6a-4c7d-8e9f-0a1b2c3d4e01",
        name: "Kigali Clinic",
        slug: "kigali-clinic",
        facility_type: "private_clinic",
        level_of_care: "primary",
        ownership: "private",
        status: "live",
        district: { code: "12", name: "Gasabo" },
        application_id: null,
        licence_state: "valid",
        next_licence_expiry: null,
        created_at: now(),
        version: 0,
      },
      licences: [
        {
          id: id(),
          kind: "moh_operating",
          number: "MOH/FL/2024/0101",
          issued_on: "2024-01-15",
          expires_on: "2027-01-14",
          state: "valid",
          upload_id: null,
          verified_by: null,
          verified_at: now(),
          superseded_at: null,
          version: 1,
        },
      ],
      events: [
        {
          id: id(),
          from_status: "",
          to_status: "approved",
          reason_code: "",
          reason_label: "",
          reason_text: "",
          actor: null,
          occurred_at: now(),
        },
        {
          id: id(),
          from_status: "approved",
          to_status: "setup",
          reason_code: "",
          reason_label: "",
          reason_text: "",
          actor: null,
          occurred_at: now(),
        },
        {
          id: id(),
          from_status: "setup",
          to_status: "live",
          reason_code: "",
          reason_label: "",
          reason_text: "",
          actor: null,
          occurred_at: now(),
        },
      ],
      keys: new Set(),
    };
    facilities.set(facility.facility.id, facility);
  }
  seedDemo();

  // ---------------------------------------------------------------- applicant (public)
  const handlers = [
    http.post(`${api}/public/facility-applications/`, async ({ request }) => {
      await context.settle();
      const l = lang(request);
      const csrf = context.csrfFailure(request, l);
      if (csrf) return csrf;
      const body = await context.readJson(request);
      const applicant = (body.applicant ?? {}) as Record<string, string>;
      const fields: Record<string, string> = {};
      if (!applicant.name) fields["applicant.name"] = s1("required", l);
      if (!applicant.email) fields["applicant.email"] = s1("required", l);
      if (!body.facility_name) fields.facility_name = s1("required", l);
      if (body.website) fields.website = s1("notAllowed", l);
      if (Object.keys(fields).length) return fieldError(context, l, fields);
      const entry: MockApplication = {
        app: blankApplication(
          {
            name: applicant.name!,
            email: applicant.email!.toLowerCase(),
            phone: applicant.phone ?? "",
            position: applicant.position ?? "",
          },
          str(body.facility_name),
          (body.preferred_language as LanguageCode) ?? "rw",
        ),
        events: [],
        keys: new Set(),
      };
      event(entry, "status_change", { to_status: "draft" });
      entry.app.missing_for_submit = missingFor(entry.app);
      applications.set(entry.app.id, entry);
      applicantSession = entry.app.id;
      return HttpResponse.json(applicantView(entry.app), { status: 201 });
    }),

    http.post(`${api}/public/facility-applications/resume-links/`, async ({ request }) => {
      await context.settle();
      const l = lang(request);
      const csrf = context.csrfFailure(request, l);
      if (csrf) return csrf;
      return new HttpResponse(null, { status: 202 });
    }),

    http.post(`${api}/public/facility-applications/resume/`, async ({ request }) => {
      await context.settle();
      const l = lang(request);
      const csrf = context.csrfFailure(request, l);
      if (csrf) return csrf;
      const body = await context.readJson(request);
      const open = [...applications.values()].filter((e) => EDITABLE.includes(e.app.status)).at(-1);
      if (body.token !== MOCK_RESUME_TOKEN || !open)
        return fieldError(context, l, { token: s1("invalidLink", l) });
      applicantSession = open.app.id;
      return HttpResponse.json(applicantView(open.app));
    }),

    http.get(`${api}/public/facility-applications/:id/`, async ({ request, params }) => {
      await context.settle();
      const entry = applicantEntry(request, str(params.id));
      if (!entry) return notFound(lang(request));
      refreshDocuments(entry);
      return HttpResponse.json(applicantView(entry.app));
    }),

    http.patch(`${api}/public/facility-applications/:id/`, async ({ request, params }) => {
      await context.settle();
      const l = lang(request);
      const csrf = context.csrfFailure(request, l);
      if (csrf) return csrf;
      const entry = applicantEntry(request, str(params.id));
      if (!entry) return notFound(l);
      const body = await context.readJson(request);
      if (!EDITABLE.includes(entry.app.status)) return rule(context, l, "notEditable");
      if (body.version !== entry.app.version) return conflict(context, l);
      applyPatch(entry, body);
      touch(entry);
      return HttpResponse.json(applicantView(entry.app));
    }),

    http.post(`${api}/public/facility-applications/:id/documents/`, async ({ request, params }) => {
      await context.settle();
      const l = lang(request);
      const csrf = context.csrfFailure(request, l);
      if (csrf) return csrf;
      const entry = applicantEntry(request, str(params.id));
      if (!entry) return notFound(l);
      return addDocument(entry, request, `application:${entry.app.id}`, l);
    }),

    http.patch(
      `${api}/public/facility-applications/:id/documents/:doc/`,
      async ({ request, params }) => {
        await context.settle();
        const l = lang(request);
        const csrf = context.csrfFailure(request, l);
        if (csrf) return csrf;
        const entry = applicantEntry(request, str(params.id));
        const document = entry?.app.documents.find((d) => d.id === params.doc);
        if (!entry || !document) return notFound(l);
        if (!EDITABLE.includes(entry.app.status)) return rule(context, l, "notEditable");
        Object.assign(document, await context.readJson(request), { review_status: "pending" });
        touch(entry);
        return HttpResponse.json(document);
      },
    ),

    http.delete(
      `${api}/public/facility-applications/:id/documents/:doc/`,
      async ({ request, params }) => {
        await context.settle();
        const l = lang(request);
        const csrf = context.csrfFailure(request, l);
        if (csrf) return csrf;
        const entry = applicantEntry(request, str(params.id));
        if (!entry) return notFound(l);
        if (!EDITABLE.includes(entry.app.status)) return rule(context, l, "notEditable");
        entry.app.documents = entry.app.documents.filter((d) => d.id !== params.doc);
        touch(entry);
        return new HttpResponse(null, { status: 204 });
      },
    ),

    http.post(`${api}/public/facility-applications/:id/submit/`, async ({ request, params }) => {
      await context.settle();
      const l = lang(request);
      const csrf = context.csrfFailure(request, l);
      if (csrf) return csrf;
      const entry = applicantEntry(request, str(params.id));
      if (!entry) return notFound(l);
      const key = request.headers.get("Idempotency-Key");
      if (key && entry.keys.has(`submit:${key}`))
        return HttpResponse.json(applicantView(entry.app));
      const body = await context.readJson(request);
      if (!EDITABLE.includes(entry.app.status)) return rule(context, l);
      if (body.version !== entry.app.version) return conflict(context, l);
      refreshDocuments(entry);
      const fields = Object.fromEntries(
        missingFor(entry.app).map((name) => [name, s1("required", l)]),
      );
      if (!body.accepted_terms_version) fields.accepted_terms_version = s1("required", l);
      if (!body.ncsa_registration_confirmed) fields.ncsa_registration_confirmed = s1("required", l);
      if (Object.keys(fields).length) return fieldError(context, l, fields);
      if (entry.app.documents.some((d) => d.upload.status === "pending"))
        return rule(context, l, "notScanned");
      entry.app.agreements = {
        accepted_terms_version: str(body.accepted_terms_version),
        accepted_dpa_version: str(body.accepted_dpa_version),
        ncsa_registration_confirmed: true,
      };
      entry.app.submitted_at = now();
      entry.app.feedback = { general_comment: "", items: [], rejection: null };
      transition(entry, "submitted", null);
      if (key) entry.keys.add(`submit:${key}`);
      return HttpResponse.json(applicantView(entry.app));
    }),

    http.post(`${api}/public/facility-applications/:id/end-session/`, async ({ request }) => {
      await context.settle();
      const csrf = context.csrfFailure(request, lang(request));
      if (csrf) return csrf;
      applicantSession = null;
      return new HttpResponse(null, { status: 204 });
    }),

    // ---------------------------------------------------------------- platform: applications
    http.get(`${api}/platform/overview/`, async ({ request }) => {
      await context.settle();
      const admin = platformAdmin(context, lang(request));
      if ("error" in admin) return admin.error;
      const apps = [...applications.values()].map((e) => e.app);
      const count = (s: ApplicationStatus) => apps.filter((a) => a.status === s).length;
      const facs = [...facilities.values()].map(facilityView);
      const fcount = (s: FacilityStatus) => facs.filter((f) => f.status === s).length;
      const waiting = apps
        .filter((a) => a.status === "submitted")
        .sort((a, b) => (a.submitted_at ?? "").localeCompare(b.submitted_at ?? ""))[0];
      return HttpResponse.json({
        applications: {
          submitted: count("submitted"),
          under_review: count("under_review"),
          changes_requested: count("changes_requested"),
          approved: count("approved"),
        },
        licences: {
          expiring_60: facs.filter((f) => f.licence_state === "expiring").length,
          expiring_30: 0,
          expired: facs.filter((f) => f.licence_state === "expired").length,
        },
        facilities: {
          approved: fcount("approved"),
          setup: fcount("setup"),
          live: fcount("live"),
          suspended: fcount("suspended"),
          deactivated: fcount("deactivated"),
        },
        oldest_waiting_application: waiting
          ? { id: waiting.id, submitted_at: waiting.submitted_at }
          : null,
        // Synthetic network (the mock facilities carry no location)
        facilities_by_district: [
          { district_code: "11", district: "Nyarugenge", province: "Kigali City", facilities: 3 },
          { district_code: "12", district: "Gasabo", province: "Kigali City", facilities: 2 },
          {
            district_code: "43",
            district: "Musanze",
            province: "Northern Province",
            facilities: 1,
          },
        ],
      });
    }),

    http.get(`${api}/platform/facility-applications/`, async ({ request }) => {
      await context.settle();
      const admin = platformAdmin(context, lang(request));
      if ("error" in admin) return admin.error;
      const url = new URL(request.url);
      const statuses = url.searchParams.getAll("status");
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const rows = [...applications.values()]
        .map((e) => e.app)
        .filter((a) => (statuses.length ? statuses.includes(a.status) : a.status !== "draft"))
        .filter(
          (a) =>
            !q ||
            a.facility.name.toLowerCase().includes(q) ||
            a.applicant.name.toLowerCase().includes(q),
        )
        .map((a) => ({
          id: a.id,
          status: a.status,
          facility_name: a.facility.name,
          facility_type: a.facility.facility_type,
          district_code: a.location.village_code ? "12" : "",
          applicant_name: a.applicant.name,
          created_by_platform: a.created_by_platform,
          submitted_at: a.submitted_at,
          last_activity_at: a.last_activity_at,
          reviewer: a.reviewer,
        }));
      const ordering = url.searchParams.get("ordering") ?? "submitted_at";
      const field = ordering.replace("-", "") as "submitted_at" | "last_activity_at";
      rows.sort(
        (a, b) =>
          str(a[field] ?? "").localeCompare(str(b[field] ?? "")) *
          (ordering.startsWith("-") ? -1 : 1),
      );
      return HttpResponse.json(page(rows, url));
    }),

    http.post(`${api}/platform/facility-applications/`, async ({ request }) => {
      await context.settle();
      const l = lang(request);
      const csrf = context.csrfFailure(request, l);
      if (csrf) return csrf;
      const admin = platformAdmin(context, l);
      if ("error" in admin) return admin.error;
      const body = await context.readJson(request);
      const applicant = (body.applicant ?? {}) as Record<string, string>;
      const facility = (body.facility ?? {}) as Record<string, string>;
      if (!applicant.name || !applicant.email || !facility.name) {
        return fieldError(context, l, { "applicant.email": s1("required", l) });
      }
      const entry: MockApplication = {
        app: blankApplication(
          {
            name: applicant.name,
            email: applicant.email,
            phone: applicant.phone ?? "",
            position: "",
          },
          facility.name,
          "rw",
        ),
        events: [],
        keys: new Set(),
      };
      entry.app.created_by_platform = true;
      event(entry, "status_change", {
        to_status: "draft",
        actor_kind: "platform_admin",
        actor: admin.me,
      });
      if (body.send_link)
        event(entry, "link_sent", { actor_kind: "platform_admin", actor: admin.me });
      applications.set(entry.app.id, entry);
      return HttpResponse.json(entry.app, { status: 201 });
    }),

    http.get(`${api}/platform/facility-applications/:id/`, async ({ request, params }) => {
      await context.settle();
      const l = lang(request);
      const admin = platformAdmin(context, l);
      if ("error" in admin) return admin.error;
      const entry = applications.get(str(params.id));
      if (!entry) return notFound(l);
      refreshDocuments(entry);
      return HttpResponse.json({
        ...entry.app,
        missing_for_submit: applicantView(entry.app).missing_for_submit,
      });
    }),

    http.patch(`${api}/platform/facility-applications/:id/`, async ({ request, params }) => {
      await context.settle();
      const l = lang(request);
      const csrf = context.csrfFailure(request, l);
      if (csrf) return csrf;
      const admin = platformAdmin(context, l);
      if ("error" in admin) return admin.error;
      const entry = applications.get(str(params.id));
      if (!entry) return notFound(l);
      const body = await context.readJson(request);
      if (!EDITABLE.includes(entry.app.status)) return rule(context, l, "notEditable");
      if (body.version !== entry.app.version) return conflict(context, l);
      applyPatch(entry, body);
      touch(entry);
      event(entry, "platform_edit", { actor_kind: "platform_admin", actor: admin.me });
      return HttpResponse.json(entry.app);
    }),

    http.post(
      `${api}/platform/facility-applications/:id/documents/`,
      async ({ request, params }) => {
        await context.settle();
        const l = lang(request);
        const csrf = context.csrfFailure(request, l);
        if (csrf) return csrf;
        const admin = platformAdmin(context, l);
        if ("error" in admin) return admin.error;
        const entry = applications.get(str(params.id));
        if (!entry) return notFound(l);
        return addDocument(entry, request, `application:${entry.app.id}`, l);
      },
    ),

    http.post(
      `${api}/platform/facility-applications/:id/documents/:doc/review/`,
      async ({ request, params }) => {
        await context.settle();
        const l = lang(request);
        const csrf = context.csrfFailure(request, l);
        if (csrf) return csrf;
        const admin = platformAdmin(context, l);
        if ("error" in admin) return admin.error;
        const entry = applications.get(str(params.id));
        const document = entry?.app.documents.find((d) => d.id === params.doc);
        if (!entry || !document) return notFound(l);
        if (entry.app.status !== "under_review") return rule(context, l);
        const body = await context.readJson(request);
        document.review_status = body.review_status as ApplicationDocument["review_status"];
        document.review_comment = str(body.comment ?? "");
        event(entry, "document_review", {
          actor_kind: "platform_admin",
          actor: admin.me,
          metadata: { document_id: document.id, review_status: document.review_status },
        });
        return HttpResponse.json(document);
      },
    ),

    http.post(
      `${api}/platform/facility-applications/:id/documents/:doc/download-links/`,
      async ({ request, params }) => {
        await context.settle();
        const l = lang(request);
        const csrf = context.csrfFailure(request, l);
        if (csrf) return csrf;
        const admin = platformAdmin(context, l);
        if ("error" in admin) return admin.error;
        const entry = applications.get(str(params.id));
        const document = entry?.app.documents.find((d) => d.id === params.doc);
        if (!entry || !document) return notFound(l);
        const upload = uploads.settleScan(document.upload.id);
        if (upload?.status !== "clean") return rule(context, l, "notClean");
        const body = await context.readJson(request);
        return HttpResponse.json(
          uploads.link(document.upload.id, str(body.disposition ?? "inline")),
        );
      },
    ),

    http.post(`${api}/platform/facility-applications/:id/:action/`, async ({ request, params }) => {
      await context.settle();
      const l = lang(request);
      const csrf = context.csrfFailure(request, l);
      if (csrf) return csrf;
      const admin = platformAdmin(context, l);
      if ("error" in admin) return admin.error;
      const action = str(params.action);
      const entry = applications.get(str(params.id));
      if (!entry) return notFound(l);
      if (action === "approve" || action === "reject") {
        const stepUp = stepUpFailure(context, l);
        if (stepUp) return stepUp;
      }
      const body = await context.readJson(request);
      const key = request.headers.get("Idempotency-Key");
      if (key && entry.keys.has(`${action}:${key}`)) {
        if (action === "approve") {
          return HttpResponse.json({
            application: entry.app,
            facility: facilityView(facilities.get(entry.app.facility_id!)!),
          });
        }
        return HttpResponse.json(entry.app);
      }
      const remember = () => key && entry.keys.add(`${action}:${key}`);
      switch (action) {
        case "send-resume-link":
          if (!EDITABLE.includes(entry.app.status)) return rule(context, l);
          event(entry, "link_sent", { actor_kind: "platform_admin", actor: admin.me });
          return new HttpResponse(null, { status: 202 });
        case "notes": {
          if (!body.text) return fieldError(context, l, { text: s1("required", l) });
          event(entry, "note", {
            actor_kind: "platform_admin",
            actor: admin.me,
            note_kind: str(body.note_kind ?? "other"),
            note: str(body.text),
            occurred_on: body.occurred_on ? str(body.occurred_on) : null,
          });
          return HttpResponse.json(entry.events.at(-1), { status: 201 });
        }
        case "start-review":
          if (entry.app.status !== "submitted") return rule(context, l);
          if (body.version !== entry.app.version) return conflict(context, l);
          entry.app.reviewer = { id: admin.me.id, full_name: admin.me.full_name };
          transition(entry, "under_review", admin.me);
          return HttpResponse.json(entry.app);
        case "request-changes": {
          if (entry.app.status !== "under_review") return rule(context, l);
          if (body.version !== entry.app.version) return conflict(context, l);
          const items = Array.isArray(body.items)
            ? (body.items as { target: string; comment: string }[])
            : [];
          if (!items.length) return fieldError(context, l, { items: s1("required", l) });
          entry.app.feedback = {
            general_comment: str(body.general_comment ?? ""),
            items,
            rejection: null,
          };
          transition(entry, "changes_requested", admin.me, {
            item_comments: items,
            note: str(body.general_comment ?? ""),
          });
          remember();
          return HttpResponse.json(entry.app);
        }
        case "reject": {
          if (entry.app.status !== "under_review") return rule(context, l);
          if (body.version !== entry.app.version) return conflict(context, l);
          if (!body.reason_code) return fieldError(context, l, { reason_code: s1("required", l) });
          if (body.reason_code === "other" && !body.reason_text)
            return fieldError(context, l, { reason_text: s1("required", l) });
          entry.app.feedback.rejection = {
            reason_code: str(body.reason_code),
            reason_label: str(body.reason_code),
            reason_text: str(body.reason_text ?? ""),
          };
          transition(entry, "rejected", admin.me, {
            reason_code: str(body.reason_code),
            note: str(body.reason_text ?? ""),
          });
          remember();
          return HttpResponse.json(entry.app);
        }
        case "approve": {
          if (entry.app.status !== "under_review") return rule(context, l);
          if (body.version !== entry.app.version) return conflict(context, l);
          if (entry.app.documents.some((d) => d.review_status !== "accepted"))
            return rule(context, l);
          const licences = (Array.isArray(body.licences) ? body.licences : []) as Licence[];
          if (!licences.some((lic) => lic.kind === "moh_operating")) return rule(context, l);
          const slug = str(body.slug ?? "");
          if ([...facilities.values()].some((f) => f.facility.slug === slug)) {
            return fieldError(context, l, { slug: s1("conflict", l) });
          }
          const facility: MockFacility = {
            facility: {
              id: id(),
              name: entry.app.facility.name,
              slug,
              facility_type: str(body.facility_type),
              level_of_care: entry.app.facility.level_of_care,
              ownership: str(body.ownership),
              status: "approved",
              district: { code: "12", name: "Gasabo" },
              application_id: entry.app.id,
              licence_state: "valid",
              next_licence_expiry: null,
              created_at: now(),
              version: 1,
            },
            licences: licences.map((lic) => ({
              ...lic,
              id: id(),
              state: "valid",
              upload_id: null,
              verified_by: admin.me,
              verified_at: now(),
              superseded_at: null,
              version: 1,
              issued_on: lic.issued_on ?? null,
            })),
            events: [
              {
                id: id(),
                from_status: "",
                to_status: "approved",
                reason_code: "",
                reason_label: "",
                reason_text: "",
                actor: admin.me,
                occurred_at: now(),
              },
            ],
            keys: new Set(),
          };
          facilities.set(facility.facility.id, facility);
          entry.app.facility_id = facility.facility.id;
          transition(entry, "approved", admin.me);
          remember();
          return HttpResponse.json({ application: entry.app, facility: facilityView(facility) });
        }
        default:
          return notFound(l);
      }
    }),

    http.get(`${api}/platform/facility-applications/:id/:list/`, async ({ request, params }) => {
      await context.settle();
      const l = lang(request);
      const admin = platformAdmin(context, l);
      if ("error" in admin) return admin.error;
      const entry = applications.get(str(params.id));
      if (!entry) return notFound(l);
      if (params.list === "events") return HttpResponse.json(entry.events);
      if (params.list === "notes")
        return HttpResponse.json(entry.events.filter((e) => e.kind === "note"));
      return notFound(l);
    }),

    // ---------------------------------------------------------------- platform: facilities and flags
    http.get(`${api}/platform/facilities/`, async ({ request }) => {
      await context.settle();
      const admin = platformAdmin(context, lang(request));
      if ("error" in admin) return admin.error;
      const url = new URL(request.url);
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const status = url.searchParams.get("status");
      const licenceState = url.searchParams.get("licence_state");
      const rows = [...facilities.values()]
        .map(facilityView)
        .filter(
          (f) =>
            (!status || f.status === status) && (!licenceState || f.licence_state === licenceState),
        )
        .filter((f) => !q || f.name.toLowerCase().includes(q));
      return HttpResponse.json(page(rows, url));
    }),

    http.get(`${api}/platform/facilities/:id/`, async ({ request, params }) => {
      await context.settle();
      const l = lang(request);
      const admin = platformAdmin(context, l);
      if ("error" in admin) return admin.error;
      const entry = facilities.get(str(params.id));
      if (!entry) return notFound(l);
      const app = entry.facility.application_id
        ? applications.get(entry.facility.application_id)?.app
        : undefined;
      return HttpResponse.json({
        ...facilityView(entry),
        application: app
          ? {
              id: app.id,
              status: app.status,
              facility_name: app.facility.name,
              facility_type: app.facility.facility_type,
              district_code: "12",
              applicant_name: app.applicant.name,
              created_by_platform: app.created_by_platform,
              submitted_at: app.submitted_at,
              last_activity_at: app.last_activity_at,
              reviewer: app.reviewer,
            }
          : null,
        licences: entry.licences.filter((lic) => !lic.superseded_at),
      });
    }),

    http.get(`${api}/platform/facilities/:id/:list/`, async ({ request, params }) => {
      await context.settle();
      const l = lang(request);
      const admin = platformAdmin(context, l);
      if ("error" in admin) return admin.error;
      const entry = facilities.get(str(params.id));
      if (!entry) return notFound(l);
      if (params.list === "status-events") return HttpResponse.json(entry.events);
      if (params.list === "licences") return HttpResponse.json([...entry.licences].reverse());
      if (params.list === "feature-flags") {
        const overrides =
          context.featureFlags.overrides.get(entry.facility.id) ?? new Map<string, boolean>();
        return HttpResponse.json(
          [...context.featureFlags.defaults.entries()].map(([code, on]) => ({
            code,
            is_enabled: overrides.get(code) ?? on,
            source: overrides.has(code) ? "override" : "default",
            note: "",
            set_by: null,
            updated_at: null,
          })),
        );
      }
      return notFound(l);
    }),

    http.post(`${api}/platform/facilities/:id/:action/`, async ({ request, params }) => {
      await context.settle();
      const l = lang(request);
      const csrf = context.csrfFailure(request, l);
      if (csrf) return csrf;
      const admin = platformAdmin(context, l);
      if ("error" in admin) return admin.error;
      const entry = facilities.get(str(params.id));
      if (!entry) return notFound(l);
      const action = str(params.action);
      const body = await context.readJson(request);
      if (action === "licences") {
        const stepUp = stepUpFailure(context, l);
        if (stepUp) return stepUp;
        if (!body.number || !body.expires_on)
          return fieldError(context, l, { number: s1("required", l) });
        const renews = body.renews_licence_id
          ? entry.licences.find((lic) => lic.id === body.renews_licence_id)
          : undefined;
        if (renews?.superseded_at) return rule(context, l);
        const licence: Licence = {
          id: id(),
          kind: body.kind as Licence["kind"],
          number: str(body.number),
          issued_on: body.issued_on ? str(body.issued_on) : null,
          expires_on: str(body.expires_on),
          state: "valid",
          upload_id: null,
          verified_by: admin.me,
          verified_at: now(),
          superseded_at: null,
          version: 1,
        };
        if (renews) renews.superseded_at = now();
        entry.licences.push(licence);
        return HttpResponse.json(licence, { status: 201 });
      }
      const transitionRule = TRANSITIONS[action];
      if (!transitionRule) return notFound(l);
      if (STEP_UP_ACTIONS.has(action)) {
        const stepUp = stepUpFailure(context, l);
        if (stepUp) return stepUp;
      }
      const key = request.headers.get("Idempotency-Key");
      if (key && entry.keys.has(key)) return HttpResponse.json(facilityView(entry));
      if (REASON_ACTIONS.has(action) && !body.reason_code)
        return fieldError(context, l, { reason_code: s1("required", l) });
      if (action === "deactivate" && body.confirm_slug !== entry.facility.slug) {
        return fieldError(context, l, { confirm_slug: s1("required", l) });
      }
      const [from, to] = transitionRule;
      if (!from.includes(entry.facility.status)) return rule(context, l);
      if (body.version !== entry.events.length) return conflict(context, l);
      if (action === "go-live" && facilityView(entry).licence_state === "missing") {
        return context.errorResponse(422, "business_rule_violation", s1("goLiveFailed", l), {
          fields: { "checks.licence.moh_operating_valid": [s1("mohLicenceCheck", l)] },
        });
      }
      entry.events.push({
        id: id(),
        from_status: entry.facility.status,
        to_status: to,
        reason_code: str(body.reason_code ?? ""),
        reason_label: str(body.reason_code ?? ""),
        reason_text: str(body.reason_text ?? ""),
        actor: admin.me,
        occurred_at: now(),
      });
      entry.facility.status = to;
      if (key) entry.keys.add(key);
      return HttpResponse.json(facilityView(entry));
    }),

    http.patch(`${api}/platform/facilities/:id/licences/:licence/`, async ({ request, params }) => {
      await context.settle();
      const l = lang(request);
      const csrf = context.csrfFailure(request, l);
      if (csrf) return csrf;
      const admin = platformAdmin(context, l);
      if ("error" in admin) return admin.error;
      const stepUp = stepUpFailure(context, l);
      if (stepUp) return stepUp;
      const licence = facilities
        .get(str(params.id))
        ?.licences.find((lic) => lic.id === params.licence);
      if (!licence) return notFound(l);
      if (licence.superseded_at) return rule(context, l);
      const body = await context.readJson(request);
      if (body.version !== licence.version) return conflict(context, l);
      const { version: _v, ...rest } = body;
      void _v;
      Object.assign(licence, rest, { version: licence.version + 1 });
      return HttpResponse.json(licence);
    }),

    http.put(`${api}/platform/facilities/:id/feature-flags/:code/`, async ({ request, params }) => {
      await context.settle();
      const l = lang(request);
      const csrf = context.csrfFailure(request, l);
      if (csrf) return csrf;
      const admin = platformAdmin(context, l);
      if ("error" in admin) return admin.error;
      const stepUp = stepUpFailure(context, l);
      if (stepUp) return stepUp;
      const code = str(params.code);
      if (!context.featureFlags.defaults.has(code) || !facilities.has(str(params.id)))
        return notFound(l);
      const body = await context.readJson(request);
      const overrides =
        context.featureFlags.overrides.get(str(params.id)) ?? new Map<string, boolean>();
      overrides.set(code, Boolean(body.is_enabled));
      context.featureFlags.overrides.set(str(params.id), overrides);
      return HttpResponse.json({
        code,
        is_enabled: Boolean(body.is_enabled),
        source: "override",
        note: str(body.note ?? ""),
        set_by: { id: admin.me.id, full_name: admin.me.full_name },
        updated_at: now(),
      });
    }),

    http.delete(
      `${api}/platform/facilities/:id/feature-flags/:code/`,
      async ({ request, params }) => {
        await context.settle();
        const l = lang(request);
        const csrf = context.csrfFailure(request, l);
        if (csrf) return csrf;
        const admin = platformAdmin(context, l);
        if ("error" in admin) return admin.error;
        const stepUp = stepUpFailure(context, l);
        if (stepUp) return stepUp;
        context.featureFlags.overrides.get(str(params.id))?.delete(str(params.code));
        return new HttpResponse(null, { status: 204 });
      },
    ),

    http.get(`${api}/platform/feature-flags/`, async ({ request }) => {
      await context.settle();
      const admin = platformAdmin(context, lang(request));
      if ("error" in admin) return admin.error;
      return HttpResponse.json(
        [...context.featureFlags.defaults.entries()].map(([code, on]) => ({
          code,
          description: "Unlock an idle-locked session with a PIN",
          default_enabled: on,
          is_active: true,
          override_count: [...context.featureFlags.overrides.values()].filter((m) => m.has(code))
            .length,
          version: 1,
        })),
      );
    }),

    http.patch(`${api}/platform/feature-flags/:code/`, async ({ request, params }) => {
      await context.settle();
      const l = lang(request);
      const csrf = context.csrfFailure(request, l);
      if (csrf) return csrf;
      const admin = platformAdmin(context, l);
      if ("error" in admin) return admin.error;
      const stepUp = stepUpFailure(context, l);
      if (stepUp) return stepUp;
      const code = str(params.code);
      if (!context.featureFlags.defaults.has(code)) return notFound(l);
      const body = await context.readJson(request);
      if (typeof body.default_enabled === "boolean")
        context.featureFlags.defaults.set(code, body.default_enabled);
      return HttpResponse.json({
        code,
        description: "Unlock an idle-locked session with a PIN",
        default_enabled: context.featureFlags.defaults.get(code),
        is_active: true,
        override_count: 0,
        version: 2,
      });
    }),
  ];

  return {
    handlers,
    reset() {
      applications.clear();
      facilities.clear();
      applicantSession = null;
      seedDemo();
    },
  };
};
