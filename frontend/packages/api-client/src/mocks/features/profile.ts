import { http, HttpResponse } from "msw";

import type { HealthKind, InsuranceProfile } from "../../features/patients";
import type { ConsentState, PatientProfileDetail, ProfileSummary } from "../../features/profile";
import type { LanguageCode, PatientMe } from "../../types";
import { MOCK_PASSWORD } from "../data";
import type { FeatureMockFactory } from "../features";
import {
  addHealthItem,
  addInsurance,
  healthProfile,
  patientsStore,
  updateInsurance,
} from "./patients";
import {
  mask,
  medilinkNumber,
  MOCK_CLAIM_CODE,
  normalizeMedilinkNumber,
  normalizePhone,
  type MockClaim,
  type MockLink,
  type MockPatient,
} from "./patients-store";
import { s1, str } from "./s1-common";

/**
 * S3 patient self-service mocks (sprint-03 §3.2). The mock account patient@medilink.test has its
 * own profile, a child (guardian) and a parent who delegated access. Delegation invites need the
 * S0 mock password; the claim code is always MOCK_CLAIM_CODE.
 */

const CONSENT_VERSION = "2026-10";
const RIGHTS = {
  edit_core: ["self", "guardian"],
  identifiers: ["self", "guardian"],
  history: ["self", "guardian"],
  invite: ["self", "guardian"],
} as const;

const MESSAGES = {
  invalidCode: {
    en: "This code isn't valid. Ask for a new one.",
    fr: "Ce code n'est pas valide. Demandez-en un nouveau.",
    rw: "Iyi kode ntikora. Saba indi.",
  },
  ownProfile: {
    en: "This is your own profile.",
    fr: "C'est votre propre profil.",
    rw: "Iyi ni porofile yawe.",
  },
  noMatch: {
    en: "We couldn't match these details to a record you can claim.",
    fr: "Nous n'avons trouvé aucun dossier correspondant que vous pouvez réclamer.",
    rw: "Ntitwabonye dosiye ihuye n'aya makuru.",
  },
  wrongCode: { en: "That code isn't right.", fr: "Ce code est incorrect.", rw: "Iyo kode si yo." },
  locked: {
    en: "A checked document can only be changed at reception.",
    fr: "Un document vérifié ne peut être modifié qu'à l'accueil.",
    rw: "Inyandiko yagenzuwe ihindurirwa ku iyakira gusa.",
  },
  taken: {
    en: "This document is on another MediLink record. You can claim it.",
    fr: "Ce document figure sur un autre dossier MediLink. Vous pouvez le réclamer.",
    rw: "Iyi nyandiko iri kuri indi dosiye ya MediLink. Ushobora kuyisaba.",
  },
  guardianAge: {
    en: "A dependent you are guardian of must be under 18.",
    fr: "Une personne à charge dont vous êtes tuteur doit avoir moins de 18 ans.",
    rw: "Umwana urera agomba kuba ari munsi y'imyaka 18.",
  },
  withdraw: {
    en: "Withdrawing this consent closes your account. Contact support.",
    fr: "Retirer ce consentement ferme votre compte. Contactez le support.",
    rw: "Gukuraho uru ruhushya bifunga konti yawe.",
  },
} as const;
type Key = keyof typeof MESSAGES;
const m = (key: Key, lang: LanguageCode) => MESSAGES[key][lang];

export const profileMocks: FeatureMockFactory = (context) => {
  const { api } = context;
  const p = `${api}/patient`;
  const store = () => patientsStore();

  type Fail = { lang: LanguageCode; error: Response };
  type Authed = { lang: LanguageCode; me: PatientMe; error?: undefined };
  const auth = async (request: Request, unsafe = false): Promise<Fail | Authed> => {
    await context.settle();
    const lang = context.languageFrom(request);
    const result = context.authenticatedPatient(lang);
    if ("error" in result) return { lang, error: result.error };
    if (unsafe) {
      const csrf = context.csrfFailure(request, lang);
      if (csrf) return { lang, error: csrf };
    }
    return { lang, me: result.me };
  };

  const links = (me: PatientMe) =>
    store()
      .links.filter((l) => l.account_email === me.email && !l.revoked)
      .sort((a, b) => Number(b.relationship === "self") - Number(a.relationship === "self"));

  const linkFor = (me: PatientMe, patientId: string) =>
    links(me).find((l) => l.patient_id === patientId);

  const notFound = (lang: LanguageCode) =>
    context.errorResponse(404, "not_found", context.message("notFound", lang));
  const denied = (lang: LanguageCode) =>
    context.errorResponse(403, "permission_denied", s1("permissionDenied", lang));
  const rule = (lang: LanguageCode, key: Key, field?: string) =>
    context.errorResponse(
      422,
      "business_rule_violation",
      m(key, lang),
      field ? { fields: { [field]: [m(key, lang)] } } : {},
    );

  const withLink = async (
    request: Request,
    patientId: string,
    right?: keyof typeof RIGHTS,
    unsafe = false,
  ): Promise<Fail | (Authed & { link: MockLink; patient: MockPatient })> => {
    const a = await auth(request, unsafe);
    if (a.error) return a;
    const link = linkFor(a.me, patientId);
    if (!link) return { lang: a.lang, error: notFound(a.lang) };
    if (right && !(RIGHTS[right] as readonly string[]).includes(link.relationship))
      return { lang: a.lang, error: denied(a.lang) };
    return { ...a, link, patient: store().patients.get(patientId)! };
  };

  return {
    handlers: [
      http.get(`${p}/profiles/`, async ({ request }) => {
        const a = await auth(request);
        if (a.error) return a.error;
        return HttpResponse.json({ results: links(a.me).map((l) => summaryOf(l)) });
      }),

      http.get(`${p}/profiles/:id/`, async ({ request, params }) => {
        const a = await withLink(request, str(params.id));
        if (a.error) return a.error;
        return HttpResponse.json(detailOf(a.link, a.patient));
      }),

      http.patch(`${p}/profiles/:id/`, async ({ request, params }) => {
        const a = await withLink(request, str(params.id), undefined, true);
        if (a.error) return a.error;
        const body = await context.readJson(request);
        if (body.version !== a.patient.version)
          return context.errorResponse(409, "conflict", s1("conflict", a.lang));
        const core = [
          "full_name",
          "preferred_name",
          "date_of_birth",
          "is_birth_date_estimated",
          "sex",
        ];
        if (
          core.some((f) => f in body) &&
          !(RIGHTS.edit_core as readonly string[]).includes(a.link.relationship)
        )
          return denied(a.lang);
        if ("phone_e164" in body) {
          const phone = normalizePhone(str(body.phone_e164) || null);
          if (phone === "invalid")
            return context.errorResponse(
              400,
              "validation_error",
              context.message("validation", a.lang),
              {
                fields: { phone_e164: [context.message("required", a.lang)] },
              },
            );
          body.phone_e164 = phone;
        }
        if (body.date_of_birth && str(body.date_of_birth) > new Date().toISOString().slice(0, 10))
          return context.errorResponse(
            400,
            "validation_error",
            context.message("validation", a.lang),
            {
              fields: { date_of_birth: [context.message("required", a.lang)] },
            },
          );
        for (const [k, v] of Object.entries(body))
          if (k !== "version") (a.patient as unknown as Record<string, unknown>)[k] = v;
        a.patient.version++;
        return HttpResponse.json(detailOf(a.link, a.patient));
      }),

      http.get(`${p}/profiles/:id/identifiers/`, async ({ request, params }) => {
        const a = await withLink(request, str(params.id));
        if (a.error) return a.error;
        return HttpResponse.json({
          results: a.patient.identifiers.map(({ value: _v, ...rest }) => rest),
        });
      }),

      http.post(`${p}/profiles/:id/identifiers/`, async ({ request, params }) => {
        const a = await withLink(request, str(params.id), "identifiers", true);
        if (a.error) return a.error;
        const body = await context.readJson(request);
        const kind = str(body.kind);
        const value = str(body.value)
          .replace(/[\s\-.]/g, "")
          .toUpperCase();
        if (kind === "national_id" && !/^\d{16}$/.test(value))
          return context.errorResponse(
            400,
            "validation_error",
            context.message("validation", a.lang),
            {
              fields: { value: [context.message("required", a.lang)] },
            },
          );
        for (const other of store().patients.values())
          if (
            other.id !== a.patient.id &&
            other.identifiers.some((i) => i.kind === kind && i.value === value)
          )
            return context.errorResponse(409, "conflict", m("taken", a.lang), {
              fields: { value: [m("taken", a.lang)] },
            });
        const current = a.patient.identifiers.find((i) => i.kind === kind);
        if (current?.is_verified) return rule(a.lang, "locked", "kind");
        a.patient.identifiers = a.patient.identifiers.filter((i) => i.kind !== kind);
        const identifier = {
          id: crypto.randomUUID(),
          kind: kind as MockPatient["identifiers"][number]["kind"],
          issuing_country: kind === "national_id" ? "RW" : str(body.issuing_country).toUpperCase(),
          masked_value: mask(value.slice(-4)),
          is_verified: false,
          verified_at: null,
          value,
        };
        a.patient.identifiers.push(identifier);
        const { value: _v, ...shown } = identifier;
        return HttpResponse.json(shown, { status: 201 });
      }),

      http.post(
        `${p}/profiles/:id/identifiers/:identifier/reveal/`,
        async ({ request, params }) => {
          const a = await withLink(request, str(params.id), "identifiers", true);
          if (a.error) return a.error;
          const item = a.patient.identifiers.find((i) => i.id === params.identifier);
          if (!item) return notFound(a.lang);
          return HttpResponse.json(
            { value: item.value },
            { headers: { "Cache-Control": "no-store" } },
          );
        },
      ),

      http.get(`${p}/profiles/:id/insurance-profiles/`, async ({ request, params }) => {
        const a = await withLink(request, str(params.id));
        if (a.error) return a.error;
        return HttpResponse.json({
          results: [...a.patient.insurance].sort(
            (x, y) => Number(y.is_active) - Number(x.is_active),
          ),
        });
      }),

      http.post(`${p}/profiles/:id/insurance-profiles/`, async ({ request, params }) => {
        const a = await withLink(request, str(params.id), undefined, true);
        if (a.error) return a.error;
        return addInsurance(context, a.lang, a.patient, await context.readJson(request));
      }),

      http.patch(`${p}/insurance-profiles/:profile/`, async ({ request, params }) => {
        const found = await insuranceFor(request, str(params.profile));
        if (found.error) return found.error;
        return updateInsurance(context, found.lang, found.profile, await context.readJson(request));
      }),

      http.post(`${p}/insurance-profiles/:profile/deactivate/`, async ({ request, params }) => {
        const found = await insuranceFor(request, str(params.profile));
        if (found.error) return found.error;
        found.profile.is_active = false;
        found.profile.version++;
        return HttpResponse.json(found.profile);
      }),

      http.get(`${p}/profiles/:id/health-profile/`, async ({ request, params }) => {
        const a = await withLink(request, str(params.id));
        if (a.error) return a.error;
        return HttpResponse.json(healthProfile(a.patient, true));
      }),

      http.get(`${p}/profiles/:id/access-history/`, async ({ request, params }) => {
        const a = await withLink(request, str(params.id), "history");
        if (a.error) return a.error;
        const items = a.patient.history;
        return HttpResponse.json({
          count: items.length,
          next: null,
          previous: null,
          results: items,
        });
      }),

      http.post(`${p}/profiles/:id/:kind/:item/entered-in-error/`, async ({ request, params }) => {
        const a = await withLink(request, str(params.id), undefined, true);
        if (a.error) return a.error;
        const kind = str(params.kind) as HealthKind;
        const list = a.patient[kind];
        const item = list?.find((i) => i.id === params.item);
        if (!item) return notFound(a.lang);
        if (item.source !== "patient" || item.verification_status !== "unverified")
          return context.errorResponse(422, "business_rule_violation", s1("notAllowed", a.lang));
        a.patient[kind] = list.filter((i) => i !== item);
        return HttpResponse.json(item);
      }),

      http.post(`${p}/profiles/:id/:kind/`, async ({ request, params }) => {
        const a = await withLink(request, str(params.id), undefined, true);
        if (a.error) return a.error;
        const kind = str(params.kind) as HealthKind;
        if (!["allergies", "conditions", "medications"].includes(kind)) return notFound(a.lang);
        return HttpResponse.json(
          addHealthItem(a.patient, kind, await context.readJson(request), "patient"),
          { status: 201 },
        );
      }),

      http.post(`${p}/dependents/`, async ({ request }) => {
        const a = await auth(request, true);
        if (a.error) return a.error;
        const body = await context.readJson(request);
        const s = store();
        const born = body.date_of_birth
          ? str(body.date_of_birth)
          : typeof body.estimated_age_years === "number"
            ? `${new Date().getFullYear() - body.estimated_age_years}-01-01`
            : "";
        const age = born ? new Date().getFullYear() - Number(born.slice(0, 4)) : 99;
        if (body.relationship === "guardian" && age >= 18) return rule(a.lang, "guardianAge");
        if (body.relationship === "delegate" && (age < 18 || !body.consent_attested))
          return context.errorResponse(422, "business_rule_violation", s1("notAllowed", a.lang));
        const patient: MockPatient = {
          ...emptyPatient(s.nextSeed++),
          full_name: str(body.full_name),
          sex: body.sex as MockPatient["sex"],
          date_of_birth: born || null,
          is_birth_date_estimated: !body.date_of_birth,
        };
        s.patients.set(patient.id, patient);
        const link: MockLink = {
          id: crypto.randomUUID(),
          account_email: a.me.email,
          holder_name: a.me.full_name,
          patient_id: patient.id,
          relationship: body.relationship as MockLink["relationship"],
          granted_by: a.me.email,
          granted_at: new Date().toISOString(),
          revoked: false,
        };
        s.links.push(link);
        return HttpResponse.json(summaryOf(link), { status: 201 });
      }),

      http.get(`${p}/delegations/`, async ({ request }) => {
        const a = await auth(request);
        if (a.error) return a.error;
        const s = store();
        const mine = links(a.me);
        const managed = mine.filter((l) => l.relationship !== "delegate").map((l) => l.patient_id);
        const name = (id: string) => s.patients.get(id)?.full_name ?? "";
        const short = (full: string) => {
          const [first, second] = full.split(" ");
          return second ? `${first} ${second[0]}.` : full;
        };
        return HttpResponse.json({
          granted: s.links
            .filter(
              (l) => !l.revoked && managed.includes(l.patient_id) && l.account_email !== a.me.email,
            )
            .map((l) => ({
              id: l.id,
              patient_id: l.patient_id,
              profile_name: name(l.patient_id),
              holder_name: short(l.holder_name),
              relationship: l.relationship,
              granted_at: l.granted_at,
              can_revoke: true,
            })),
          received: mine
            .filter((l) => l.relationship !== "self")
            .map((l) => ({
              id: l.id,
              patient_id: l.patient_id,
              profile_name: name(l.patient_id),
              holder_name: l.granted_by,
              relationship: l.relationship,
              granted_at: l.granted_at,
              can_revoke: true,
            })),
          pending_invites: s.invites
            .filter((i) => i.created_by === a.me.email && !i.used)
            .map((i) => ({
              id: i.id,
              patient_id: i.patient_id,
              profile_name: name(i.patient_id),
              relationship: i.relationship,
              expires_at: i.expires_at,
            })),
        });
      }),

      http.post(`${p}/delegations/`, async ({ request }) => {
        const a = await auth(request, true);
        if (a.error) return a.error;
        const body = await context.readJson(request);
        if (body.current_password !== MOCK_PASSWORD)
          return context.errorResponse(
            400,
            "validation_error",
            context.message("validation", a.lang),
            {
              fields: { current_password: [s1("wrongPassword", a.lang)] },
            },
          );
        const link = linkFor(a.me, str(body.patient_id));
        if (!link) return notFound(a.lang);
        if (link.relationship === "delegate") return denied(a.lang);
        const code = Array.from(
          { length: 8 },
          () => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[Math.floor(Math.random() * 32)],
        ).join("");
        const invite = {
          id: crypto.randomUUID(),
          code: `${code.slice(0, 4)}-${code.slice(4)}`,
          patient_id: link.patient_id,
          relationship: (link.relationship === "self"
            ? "delegate"
            : "guardian") as MockLink["relationship"],
          created_by: a.me.email,
          expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
          used: false,
        };
        store().invites.push(invite);
        return HttpResponse.json(
          {
            id: invite.id,
            code: invite.code,
            relationship: invite.relationship,
            expires_at: invite.expires_at,
          },
          { status: 201, headers: { "Cache-Control": "no-store" } },
        );
      }),

      http.post(`${p}/delegations/accept/`, async ({ request }) => {
        const a = await auth(request, true);
        if (a.error) return a.error;
        const body = await context.readJson(request);
        const code = str(body.code).toUpperCase().replace(/\s/g, "");
        const invite = store().invites.find((i) => !i.used && i.code === code);
        if (!invite)
          return context.errorResponse(
            400,
            "validation_error",
            context.message("validation", a.lang),
            {
              fields: { code: [m("invalidCode", a.lang)] },
            },
          );
        const existing = linkFor(a.me, invite.patient_id);
        if (existing?.relationship === "self") return rule(a.lang, "ownProfile");
        if (existing) return context.errorResponse(409, "conflict", s1("conflict", a.lang));
        invite.used = true;
        const link: MockLink = {
          id: crypto.randomUUID(),
          account_email: a.me.email,
          holder_name: a.me.full_name,
          patient_id: invite.patient_id,
          relationship: invite.relationship,
          granted_by: invite.created_by,
          granted_at: new Date().toISOString(),
          revoked: false,
        };
        store().links.push(link);
        return HttpResponse.json(summaryOf(link), { status: 201 });
      }),

      http.post(`${p}/delegations/:id/revoke/`, async ({ request, params }) => {
        const a = await auth(request, true);
        if (a.error) return a.error;
        const s = store();
        const invite = s.invites.find((i) => i.id === params.id && i.created_by === a.me.email);
        if (invite) {
          invite.used = true;
          return new HttpResponse(null, { status: 204 });
        }
        const link = s.links.find((l) => l.id === params.id && !l.revoked);
        if (!link) return notFound(a.lang);
        if (link.account_email === a.me.email && link.relationship === "self")
          return context.errorResponse(422, "business_rule_violation", s1("notAllowed", a.lang));
        const manages = linkFor(a.me, link.patient_id);
        if (link.account_email !== a.me.email && (!manages || manages.relationship === "delegate"))
          return notFound(a.lang);
        link.revoked = true;
        return new HttpResponse(null, { status: 204 });
      }),

      http.post(`${p}/record-claims/`, async ({ request }) => {
        const a = await auth(request, true);
        if (a.error) return a.error;
        const body = await context.readJson(request);
        const s = store();
        const lookup = (body.lookup ?? {}) as Record<string, unknown>;
        const dob = str(body.date_of_birth);
        let target: MockPatient | undefined;
        const all = [...s.patients.values()].filter((x) => !x.merged_into);
        if (lookup.medilink_number) {
          const n = normalizeMedilinkNumber(str(lookup.medilink_number));
          target = all.find((x) => x.medilink_number === n);
        } else if (lookup.identifier) {
          const ident = lookup.identifier as Record<string, unknown>;
          const value = str(ident.value)
            .replace(/[\s\-.]/g, "")
            .toUpperCase();
          target = all.find((x) =>
            x.identifiers.some((i) => i.kind === ident.kind && i.value === value),
          );
        } else if (lookup.phone_e164) {
          target = all.find((x) => x.phone_e164 === normalizePhone(str(lookup.phone_e164)));
        }
        const claimed =
          target &&
          s.links.some(
            (l) => l.patient_id === target.id && l.relationship === "self" && !l.revoked,
          );
        if (!target || target.date_of_birth !== dob || claimed) return rule(a.lang, "noMatch");
        const byCode = Boolean(target.email);
        const claim: MockClaim = {
          id: crypto.randomUUID(),
          account_email: a.me.email,
          patient_id: target.id,
          status: byCode ? "code_sent" : "awaiting_reception",
          method: byCode ? "contact_code" : "reception_check",
          contact_hint: byCode ? `${target.email![0]}•••@e•••.test` : null,
          reference: byCode
            ? null
            : Array.from(
                { length: 8 },
                (_, i) => "K7Q4PX2MABCDEFGH"[i + (s.claims.length % 8)],
              ).join(""),
          expires_at: new Date(Date.now() + (byCode ? 15 * 60_000 : 7 * 86400_000)).toISOString(),
          code: byCode ? MOCK_CLAIM_CODE : null,
          attempts: 0,
        };
        s.claims.push(claim);
        return HttpResponse.json(publicClaim(claim), { status: 201 });
      }),

      http.get(`${p}/record-claims/:id/`, async ({ request, params }) => {
        const a = await auth(request);
        if (a.error) return a.error;
        const claim = store().claims.find(
          (c) => c.id === params.id && c.account_email === a.me.email,
        );
        return claim ? HttpResponse.json(publicClaim(claim)) : notFound(a.lang);
      }),

      http.post(`${p}/record-claims/:id/verify/`, async ({ request, params }) => {
        const a = await auth(request, true);
        if (a.error) return a.error;
        const s = store();
        const claim = s.claims.find((c) => c.id === params.id && c.account_email === a.me.email);
        if (!claim) return notFound(a.lang);
        const body = await context.readJson(request);
        if (claim.status !== "code_sent") return rule(a.lang, "noMatch");
        if (str(body.code) !== claim.code) {
          claim.attempts++;
          if (claim.attempts >= 5) {
            claim.status = "failed";
            return rule(a.lang, "noMatch");
          }
          return context.errorResponse(400, "validation_error", m("wrongCode", a.lang), {
            fields: { code: [m("wrongCode", a.lang)] },
          });
        }
        claim.status = "completed";
        const own = links(a.me).find((l) => l.relationship === "self")!;
        own.revoked = true;
        const link: MockLink = {
          ...own,
          id: crypto.randomUUID(),
          patient_id: claim.patient_id,
          revoked: false,
        };
        s.links.push(link);
        return HttpResponse.json({ claim: publicClaim(claim), profile: summaryOf(link) });
      }),

      http.get(`${p}/consents/`, async ({ request }) => {
        const a = await auth(request);
        if (a.error) return a.error;
        return HttpResponse.json(consentState(a.me));
      }),

      http.post(`${p}/consents/`, async ({ request }) => {
        const a = await auth(request, true);
        if (a.error) return a.error;
        const body = await context.readJson(request);
        const kind = str(body.kind);
        if ((kind === "terms" || kind === "privacy") && !body.granted)
          return rule(a.lang, "withdraw");
        let patient: MockPatient | undefined;
        if (body.patient_id) {
          const link = linkFor(a.me, str(body.patient_id));
          if (!link) return notFound(a.lang);
          if (link.relationship === "delegate") return denied(a.lang);
          patient = store().patients.get(link.patient_id);
        } else
          patient = store().patients.get(
            links(a.me).find((l) => l.relationship === "self")!.patient_id,
          );
        const record = {
          id: crypto.randomUUID(),
          kind,
          patient_id: body.patient_id ? str(body.patient_id) : null,
          granted: Boolean(body.granted),
          version: str(body.version),
          granted_at: new Date().toISOString(),
          channel: "web",
        };
        patient?.consents.unshift(record);
        return HttpResponse.json(record, { status: 201 });
      }),
    ],
  };

  async function insuranceFor(
    request: Request,
    profileId: string,
  ): Promise<Fail | { lang: LanguageCode; profile: InsuranceProfile; error?: undefined }> {
    const a = await auth(request, true);
    if (a.error) return a;
    for (const link of links(a.me)) {
      const profile = store()
        .patients.get(link.patient_id)
        ?.insurance.find((x) => x.id === profileId);
      if (profile) return { lang: a.lang, profile };
    }
    return { lang: a.lang, error: notFound(a.lang) };
  }

  function summaryOf(link: MockLink): ProfileSummary {
    const patient = store().patients.get(link.patient_id)!;
    const done = Object.values(completion(patient));
    return {
      patient_id: patient.id,
      display_name: patient.preferred_name ?? patient.full_name,
      relationship: link.relationship,
      medilink_number: patient.medilink_number,
      date_of_birth: patient.date_of_birth,
      completion_percent: Math.round((100 * done.filter(Boolean).length) / done.length),
    };
  }

  function detailOf(link: MockLink, patient: MockPatient): PatientProfileDetail {
    return {
      patient_id: patient.id,
      relationship: link.relationship,
      medilink_number: patient.medilink_number,
      full_name: patient.full_name,
      preferred_name: patient.preferred_name,
      date_of_birth: patient.date_of_birth,
      is_birth_date_estimated: patient.is_birth_date_estimated,
      sex: patient.sex,
      phone_e164: patient.phone_e164,
      email: patient.email,
      address: patient.address,
      emergency_contact: patient.emergency_contact,
      no_known_allergies: patient.no_known_allergies,
      has_care_consent: patient.consents.some((c) => c.kind === "care" && c.granted),
      completion: completion(patient),
      version: patient.version,
    };
  }

  function consentState(me: PatientMe): ConsentState {
    const own = links(me);
    const all = own.flatMap((l) => store().patients.get(l.patient_id)?.consents ?? []);
    const latest = new Map<string, (typeof all)[number]>();
    for (const c of all)
      if (!latest.has(`${c.kind}:${c.patient_id}`)) latest.set(`${c.kind}:${c.patient_id}`, c);
    return {
      current_versions: {
        terms: CONSENT_VERSION,
        privacy: CONSENT_VERSION,
        care: CONSENT_VERSION,
        research: CONSENT_VERSION,
      },
      consents: [...latest.values()],
      history: all,
    };
  }
};

function completion(patient: MockPatient) {
  return {
    details: Boolean(patient.full_name && patient.date_of_birth && patient.sex),
    identifier: patient.identifiers.length > 0,
    emergency_contact: Boolean(patient.emergency_contact),
    care_consent: patient.consents.some((c) => c.kind === "care" && c.granted),
    insurance: patient.insurance.some((i) => i.is_active),
    allergies_reviewed: patient.no_known_allergies !== null,
  };
}

function publicClaim(claim: ReturnType<typeof patientsStore>["claims"][number]) {
  const { account_email: _a, patient_id: _p, code: _c, attempts: _t, ...shown } = claim;
  return shown;
}

function emptyPatient(seed: number): MockPatient {
  return {
    id: crypto.randomUUID(),
    medilink_number: medilinkNumber(seed),
    full_name: "",
    preferred_name: null,
    sex: null,
    date_of_birth: null,
    is_birth_date_estimated: false,
    phone_e164: null,
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
    consents: [],
    history: [],
  };
}
