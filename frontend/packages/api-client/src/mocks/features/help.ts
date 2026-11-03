import { http, HttpResponse } from "msw";

import type {
  HelpArticleStatus,
  HelpAudience,
  HelpCategory,
  PersonRef,
  ContactMessageRow,
  PlatformHelpArticle,
  PlatformSupportRequest,
  SupportCloseReason,
  SupportMessage,
  SupportPriority,
  SupportStatus,
  SupportTopic,
} from "../../features/help";
import type { I18nText } from "../../features/masterdata";
import { HELP_CATEGORIES, SUPPORT_CLOSE_REASONS, SUPPORT_TOPICS } from "../../features/help";
import type { LanguageCode, StaffMe } from "../../types";
import { extendMockRoleGrants, FACILITIES, PATIENTS, STAFF_USERS } from "../data";
import type { FeatureMockFactory } from "../features";
import type { MockContext } from "../handlers";
import {
  conflict,
  fieldError,
  id,
  now,
  page,
  platformAdmin,
  s1,
  stepUpFailure,
  str,
} from "./s1-common";
import { SETUP_FACILITY } from "./setup";

/**
 * S10 part 1 mocks (contract sprint-10 §6.3): seeded help articles for patients and staff in
 * rw/en/fr (one staff draft and one article without French), a patient request answered by
 * support and a receptionist's open request at Kigali Clinic. Every §3.2 endpoint with the
 * backend's rules: sessions, CSRF, `support.view_facility`, the open limit, a short clinical-words
 * check, the state machine, `409` on a stale `version` and step-up on publish.
 */

// Mirrors backend `support.permissions.ROLE_GRANTS`.
extendMockRoleGrants({ facility_admin: ["support.view_facility"] });

const SUPPORT_NAME = "MediLink support";
const OPEN_LIMIT = 5;
/** A short stand-in for S9's clinical-terms list (the backend checks the full list). */
const CLINICAL = ["hiv", "vih", "sida", "aids", "igituntu", "tuberculosis", "diagnosis", "cancer"];
const LANGS: LanguageCode[] = ["rw", "en", "fr"];

const MSG = {
  invalid: {
    en: "Choose a valid value.",
    fr: "Choisissez une valeur valide.",
    rw: "Hitamo agaciro kemewe.",
  },
  clinical: {
    en: "Please don't include health details here. For questions about your care, contact your facility.",
    fr: "N'indiquez pas d'informations de santé ici. Pour vos soins, contactez votre établissement.",
    rw: "Ntushyiremo amakuru ajyanye n'ubuzima bwawe hano. Ku bijyanye no kuvurwa, vugana n'ivuriro ryawe.",
  },
  limit: {
    en: "You already have 5 open requests. Close one, or wait for an answer, before opening another.",
    fr: "Vous avez déjà 5 demandes ouvertes. Fermez-en une ou attendez une réponse avant d'en ouvrir une autre.",
    rw: "Usanzwe ufite ibibazo 5 bitarasubizwa. Funga kimwe cyangwa utegereze igisubizo mbere yo kubaza ikindi.",
  },
  closed: {
    en: "This request is closed. Open a new one if you still need help.",
    fr: "Cette demande est fermée. Ouvrez-en une nouvelle si vous avez encore besoin d'aide.",
    rw: "Iki kibazo cyafunzwe. Fungura ikindi niba ugikeneye ubufasha.",
  },
  missing: {
    en: "Write the title, summary and text in every language first.",
    fr: "Rédigez d'abord le titre, le résumé et le texte dans toutes les langues.",
    rw: "Banza wandike umutwe, incamake n'inyandiko mu ndimi zose.",
  },
  slug: {
    en: "Use lowercase letters, numbers and single hyphens.",
    fr: "Utilisez des minuscules, des chiffres et des tirets simples.",
    rw: "Koresha inyuguti nto, imibare n'akamenyetso kamwe hagati.",
  },
  slugTaken: {
    en: "Another article already uses this address.",
    fr: "Un autre article utilise déjà cette adresse.",
    rw: "Indi nyandiko isanzwe ikoresha iyi aderesi.",
  },
  length: {
    en: "Check the length of this text.",
    fr: "Vérifiez la longueur de ce texte.",
    rw: "Reba uburebure bw'iyi nyandiko.",
  },
  query: {
    en: "Search with 2 to 100 characters.",
    fr: "Recherchez avec 2 à 100 caractères.",
    rw: "Shakisha ukoresheje inyuguti 2 kugeza ku 100.",
  },
  assignee: {
    en: "Assign the request to a platform admin.",
    fr: "Attribuez la demande à un administrateur de la plateforme.",
    rw: "Ha icyo kibazo umuyobozi wa platform.",
  },
} as const;
const msg = (key: keyof typeof MSG, lang: LanguageCode) => MSG[key][lang];

interface MockArticle extends PlatformHelpArticle {
  body_i18n: I18nText;
}

interface MockRequest extends Omit<PlatformSupportRequest, "message_count"> {
  requester_id: string;
  facility_id: string | null;
}

const text = (en: string, fr?: string, rw?: string): I18nText => ({
  en,
  ...(fr ? { fr } : {}),
  ...(rw ? { rw } : {}),
});

const ADMIN = STAFF_USERS.find((u) => u.is_platform_admin)!;
const RECEPTION = STAFF_USERS.find((u) => u.email === "reception@medilink.test")!;
const PATIENT = PATIENTS[0]!.me;
/** A receptionist at Gasabo Family Clinic (the facility admin's facility); no login needed. */
const COLLEAGUE: PersonRef = {
  id: "7a1e0b2c-0000-4000-8000-000000000031",
  full_name: "Kamanzi Jean",
};
const person = (u: { id: string; full_name: string }): PersonRef => ({
  id: u.id,
  full_name: u.full_name,
});

function seedArticles(): MockArticle[] {
  const at = "2026-10-20T08:00:00Z";
  const base = {
    status: "published" as HelpArticleStatus,
    published_at: at,
    missing_languages: [] as LanguageCode[],
    created_by: person(ADMIN),
    updated_by: person(ADMIN),
    version: 1,
    created_at: at,
    updated_at: at,
  };
  const articles: MockArticle[] = [
    {
      ...base,
      id: "5e100000-0000-4000-8000-000000000001",
      slug: "add-a-child",
      audience: "patient",
      category: "family_profile",
      sort_order: 10,
      title_i18n: text("Add your child", "Ajouter votre enfant", "Ongeramo umwana wawe"),
      summary_i18n: text(
        "Book and follow visits for your children from your own account.",
        "Réservez et suivez les visites de vos enfants depuis votre compte.",
        "Fata kandi ukurikirane gahunda z'abana bawe ukoresheje konti yawe.",
      ),
      body_i18n: text(
        "You can add a child under 16 to your account.\n\n- Open Profile\n- Choose Add a family member\n- Enter the child's name and date of birth\n\nAt reception, show the child's birth certificate once.",
        "Vous pouvez ajouter un enfant de moins de 16 ans à votre compte.\n\n- Ouvrez Profil\n- Choisissez Ajouter un membre de la famille\n- Saisissez le nom et la date de naissance\n\nÀ l'accueil, montrez une fois l'acte de naissance.",
        "Ushobora kongera umwana uri munsi y'imyaka 16 kuri konti yawe.\n\n- Fungura Umwirondoro\n- Hitamo Ongeramo umuntu wo mu muryango\n- Andika izina n'itariki y'amavuko\n\nKu kwakira, erekana rimwe icyemezo cy'amavuko.",
      ),
    },
    {
      ...base,
      id: "5e100000-0000-4000-8000-000000000002",
      slug: "cancel-a-booking",
      audience: "patient",
      category: "booking_visits",
      sort_order: 20,
      title_i18n: text(
        "Cancel or move a booking",
        "Annuler ou déplacer un rendez-vous",
        "Hagarika cyangwa wimure gahunda",
      ),
      summary_i18n: text(
        "Free up your time so someone else can come.",
        "Libérez votre créneau pour quelqu'un d'autre.",
        "Rekura umwanya wawe kugira ngo undi aze.",
      ),
      body_i18n: text(
        "Open My visits and choose the booking. Cancel before the facility's deadline so it is not counted as a late cancellation.",
        "Ouvrez Mes visites et choisissez le rendez-vous. Annulez avant le délai de l'établissement.",
        "Fungura Gahunda zanjye uhitemo gahunda. Hagarika mbere y'igihe ntarengwa cy'ivuriro.",
      ),
    },
    {
      ...base,
      id: "5e100000-0000-4000-8000-000000000003",
      slug: "turn-on-notifications",
      audience: "patient",
      category: "notifications",
      sort_order: 30,
      missing_languages: ["fr"],
      title_i18n: text("Turn on notifications", undefined, "Fungura kumenyeshwa"),
      summary_i18n: text("Know when it's your turn.", undefined, "Menya igihe cyawe kigeze."),
      body_i18n: text(
        "Open Notification settings and turn on alerts on this device.",
        undefined,
        "Fungura igenamiterere ryo kumenyeshwa ufungure ubutumwa kuri iki gikoresho.",
      ),
    },
    {
      ...base,
      id: "5e100000-0000-4000-8000-000000000011",
      slug: "check-in-a-walk-in",
      audience: "staff",
      category: "facility_work",
      sort_order: 10,
      title_i18n: text(
        "Check in a walk-in patient",
        "Enregistrer un patient sans rendez-vous",
        "Kwakira umurwayi utafashe gahunda",
      ),
      summary_i18n: text(
        "Find or register the patient, then give a ticket.",
        "Trouvez ou enregistrez le patient, puis donnez un ticket.",
        "Shaka cyangwa wandike umurwayi, hanyuma umuhe itike.",
      ),
      body_i18n: text(
        "On the board, press N or choose Check in.\n\n- Search by phone or name\n- Register the patient if you can't find them\n- Choose the service and print the ticket",
        "Sur le tableau, appuyez sur N ou choisissez Enregistrer.\n\n- Cherchez par téléphone ou nom\n- Enregistrez le patient s'il est introuvable\n- Choisissez le service et imprimez le ticket",
        "Ku kibaho, kanda N cyangwa uhitemo Kwakira.\n\n- Shakisha ukoresheje telefoni cyangwa izina\n- Andika umurwayi niba atabonetse\n- Hitamo serivisi ucape itike",
      ),
    },
    {
      ...base,
      id: "5e100000-0000-4000-8000-000000000012",
      slug: "draft-closing-checklist",
      audience: "staff",
      category: "facility_work",
      sort_order: 50,
      status: "draft",
      published_at: null,
      missing_languages: ["rw", "fr"],
      title_i18n: text("End-of-day checklist"),
      summary_i18n: text("What to check before closing."),
      body_i18n: text("Close the queue, count the cash and sign every record."),
    },
  ];
  return articles;
}

function seedRequests(): MockRequest[] {
  const kc = FACILITIES.kigaliClinic;
  return [
    {
      id: "5e200000-0000-4000-8000-000000000001",
      reference: "SR-7K3QXM",
      topic: "booking_visits",
      subject: "I can't cancel my booking",
      status: "answered",
      close_reason: null,
      facility: null,
      facility_id: null,
      requester: person(PATIENT),
      requester_id: PATIENT.id,
      requester_audience: "patient",
      priority: "normal",
      assigned_to: person(ADMIN),
      language: "en",
      client_label: "Chrome on Android",
      client_path: "/visits",
      closed_by: null,
      last_message_at: "2026-10-30T09:30:00Z",
      closed_at: null,
      created_at: "2026-10-30T08:00:00Z",
      version: 2,
      messages: [
        {
          id: "5e300000-0000-4000-8000-000000000001",
          author_kind: "requester",
          author_name: PATIENT.full_name,
          body: "The Cancel button does nothing on my phone.",
          created_at: "2026-10-30T08:00:00Z",
        },
        {
          id: "5e300000-0000-4000-8000-000000000002",
          author_kind: "support",
          author_name: ADMIN.full_name,
          body: "Thank you. Please update the app and try again; tell us if it still fails.",
          created_at: "2026-10-30T09:30:00Z",
        },
      ],
    },
    {
      id: "5e200000-0000-4000-8000-000000000002",
      reference: "SR-4HQ2NP",
      topic: "technical",
      subject: "The ticket printer prints blank tickets",
      status: "open",
      close_reason: null,
      facility: { id: kc.id, name: kc.name },
      facility_id: kc.id,
      requester: person(RECEPTION),
      requester_id: RECEPTION.id,
      requester_audience: "staff",
      priority: "high",
      assigned_to: null,
      language: "en",
      client_label: "Firefox on Windows",
      client_path: "/queue",
      closed_by: null,
      last_message_at: "2026-10-31T07:45:00Z",
      closed_at: null,
      created_at: "2026-10-31T07:45:00Z",
      version: 1,
      messages: [
        {
          id: "5e300000-0000-4000-8000-000000000003",
          author_kind: "requester",
          author_name: RECEPTION.full_name,
          body: "Since this morning every ticket comes out blank.",
          created_at: "2026-10-31T07:45:00Z",
        },
      ],
    },
    {
      id: "5e200000-0000-4000-8000-000000000003",
      reference: "SR-9PZ6RD",
      topic: "facility_setup",
      subject: "How do I add a second room?",
      status: "open",
      close_reason: null,
      facility: { id: SETUP_FACILITY.id, name: SETUP_FACILITY.name },
      facility_id: SETUP_FACILITY.id,
      requester: COLLEAGUE,
      requester_id: COLLEAGUE.id,
      requester_audience: "staff",
      priority: "normal",
      assigned_to: null,
      language: "en",
      client_label: "Chrome on Windows",
      client_path: "/settings",
      closed_by: null,
      last_message_at: "2026-10-31T10:00:00Z",
      closed_at: null,
      created_at: "2026-10-31T10:00:00Z",
      version: 1,
      messages: [
        {
          id: "5e300000-0000-4000-8000-000000000004",
          author_kind: "requester",
          author_name: COLLEAGUE.full_name,
          body: "We opened a second consultation room and can't find where to add it.",
          created_at: "2026-10-31T10:00:00Z",
        },
      ],
    },
  ];
}

const REF_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const reference = () =>
  "SR-" +
  Array.from({ length: 6 }, () => REF_CHARS[Math.floor(Math.random() * REF_CHARS.length)]).join("");

const hasClinical = (value: string) => {
  const folded = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return CLINICAL.some((term) => new RegExp(`\\b${term}\\b`).test(folded));
};
// eslint-disable-next-line no-control-regex -- refusing control characters is the rule
const hasControl = (value: string) => /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);

export const helpMocks: FeatureMockFactory = (context: MockContext) => {
  let articles = seedArticles();
  let requests = seedRequests();
  const api = context.api;

  const missingOf = (a: Pick<MockArticle, "title_i18n" | "summary_i18n" | "body_i18n">) =>
    LANGS.filter(
      (l) => !a.title_i18n[l]?.trim() || !a.summary_i18n[l]?.trim() || !a.body_i18n[l]?.trim(),
    );

  const summary = (a: MockArticle) => ({
    id: a.id,
    slug: a.slug,
    audience: a.audience,
    category: a.category,
    title_i18n: a.title_i18n,
    summary_i18n: a.summary_i18n,
    sort_order: a.sort_order,
    updated_at: a.updated_at,
  });
  const platformSummary = (a: MockArticle) => {
    const { body_i18n: _body, ...rest } = a;
    return { ...rest, missing_languages: missingOf(a) };
  };

  const row = (r: MockRequest) => ({
    id: r.id,
    reference: r.reference,
    topic: r.topic,
    subject: r.subject,
    status: r.status,
    close_reason: r.close_reason,
    facility: r.facility,
    requester: r.requester,
    message_count: r.messages.length,
    last_message_at: r.last_message_at,
    closed_at: r.closed_at,
    created_at: r.created_at,
    version: r.version,
  });
  /** Requester view: support shown as "MediLink support". */
  const requesterView = (r: MockRequest) => ({
    ...row(r),
    messages: r.messages.map((m) =>
      m.author_kind === "support" ? { ...m, author_name: SUPPORT_NAME } : m,
    ),
  });
  const platformRow = (r: MockRequest) => ({
    ...row(r),
    requester_audience: r.requester_audience,
    priority: r.priority,
    assigned_to: r.assigned_to,
    language: r.language,
    client_label: r.client_label,
    client_path: r.client_path,
    closed_by: r.closed_by,
  });
  const platformView = (r: MockRequest) => ({ ...platformRow(r), messages: r.messages });

  const listArticles = (audience: HelpAudience, url: URL, lang: LanguageCode) => {
    const q = (url.searchParams.get("q") ?? "").trim();
    const category = url.searchParams.get("category");
    if (url.searchParams.has("q") && (q.length < 2 || q.length > 100))
      return fieldError(context, lang, { q: msg("query", lang) });
    if (category && !(HELP_CATEGORIES as readonly string[]).includes(category))
      return fieldError(context, lang, { category: msg("invalid", lang) });
    const needle = q.toLowerCase();
    const inText = (t: I18nText) => Object.values(t).some((v) => v?.toLowerCase().includes(needle));
    const rows = articles
      .filter((a) => a.audience === audience && a.status === "published")
      .filter((a) => !category || a.category === category)
      .filter(
        (a) => !needle || inText(a.title_i18n) || inText(a.summary_i18n) || inText(a.body_i18n),
      )
      .sort((a, b) => {
        const ta = needle && inText(a.title_i18n) ? 0 : 1;
        const tb = needle && inText(b.title_i18n) ? 0 : 1;
        return ta - tb || a.sort_order - b.sort_order;
      });
    return HttpResponse.json(page(rows.map(summary), url));
  };
  const oneArticle = (audience: HelpAudience, slug: string, lang: LanguageCode) => {
    const a = articles.find(
      (x) => x.slug === slug && x.audience === audience && x.status === "published",
    );
    if (!a) return context.errorResponse(404, "not_found", context.message("notFound", lang));
    return HttpResponse.json({ ...summary(a), body_i18n: a.body_i18n });
  };

  const notFound = (lang: LanguageCode) =>
    context.errorResponse(404, "not_found", context.message("notFound", lang));

  /** Validate a requester's create body; a Response on error. */
  const checkCreate = (body: Record<string, unknown>, lang: LanguageCode) => {
    const topic = str(body.topic);
    const subject = str(body.subject).trim();
    const message = str(body.body).trim();
    const fields: Record<string, string> = {};
    if (!(SUPPORT_TOPICS as readonly string[]).includes(topic)) fields.topic = msg("invalid", lang);
    if (subject.length < 3 || subject.length > 120 || hasControl(subject))
      fields.subject = msg("length", lang);
    else if (hasClinical(subject)) fields.subject = msg("clinical", lang);
    if (message.length < 10 || message.length > 4000 || hasControl(message))
      fields.body = msg("length", lang);
    else if (hasClinical(message)) fields.body = msg("clinical", lang);
    const path = str(body.client_path);
    if (path && !/^\/[A-Za-z0-9/_-]*$/.test(path)) fields.client_path = msg("invalid", lang);
    return Object.keys(fields).length ? fieldError(context, lang, fields) : null;
  };
  const checkReply = (body: Record<string, unknown>, lang: LanguageCode) => {
    const message = str(body.body).trim();
    if (!message || message.length > 4000 || hasControl(message))
      return fieldError(context, lang, { body: msg("length", lang) });
    if (hasClinical(message)) return fieldError(context, lang, { body: msg("clinical", lang) });
    return null;
  };

  const create = (
    body: Record<string, unknown>,
    who: { id: string; full_name: string },
    audience: HelpAudience,
    facility: { id: string; name: string } | null,
    lang: LanguageCode,
  ) => {
    const invalid = checkCreate(body, lang);
    if (invalid) return invalid;
    const open = requests.filter(
      (r) =>
        r.requester_id === who.id && r.requester_audience === audience && r.status !== "closed",
    );
    if (open.length >= OPEN_LIMIT)
      return context.errorResponse(422, "business_rule_violation", msg("limit", lang));
    const at = now();
    const r: MockRequest = {
      id: id(),
      reference: reference(),
      topic: str(body.topic) as SupportTopic,
      subject: str(body.subject).trim(),
      status: "open",
      close_reason: null,
      facility,
      facility_id: facility?.id ?? null,
      requester: person(who),
      requester_id: who.id,
      requester_audience: audience,
      priority: "normal",
      assigned_to: null,
      language: lang,
      client_label: "Browser",
      client_path: str(body.client_path) || "/",
      closed_by: null,
      last_message_at: at,
      closed_at: null,
      created_at: at,
      version: 1,
      messages: [
        {
          id: id(),
          author_kind: "requester",
          author_name: who.full_name,
          body: str(body.body).trim(),
          created_at: at,
        },
      ],
    };
    requests.unshift(r);
    return HttpResponse.json(requesterView(r), { status: 201 });
  };

  const addMessage = (
    r: MockRequest,
    kind: SupportMessage["author_kind"],
    author: PersonRef,
    body: string,
  ) => {
    const at = now();
    r.messages.push({
      id: id(),
      author_kind: kind,
      author_name: author.full_name,
      body: body.trim(),
      created_at: at,
    });
    r.last_message_at = at;
    r.status = kind === "support" ? "answered" : "open";
    r.version += 1;
  };
  const close = (r: MockRequest, reason: SupportCloseReason, by: PersonRef) => {
    r.status = "closed";
    r.close_reason = reason;
    r.closed_at = now();
    r.closed_by = by;
    r.version += 1;
  };

  const listOf = (rows: MockRequest[], url: URL) => {
    const status = url.searchParams.get("status");
    const filtered = rows
      .filter((r) =>
        status === "active" ? r.status !== "closed" : status ? r.status === status : true,
      )
      .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
    return HttpResponse.json(page(filtered.map(row), url));
  };

  const staffContext = (lang: LanguageCode) => {
    const result = context.authenticatedStaff(lang);
    if ("error" in result) return result;
    const me: StaffMe = result.me;
    const membership = me.memberships.find((m) => m.facility.id === me.active_facility_id);
    if (!membership)
      return {
        error: context.errorResponse(403, "permission_denied", s1("permissionDenied", lang)),
      };
    return { me, facility: { id: membership.facility.id, name: membership.facility.name } };
  };

  // the Contact page inbox (upgrade 11 §13)
  const contactMessages: ContactMessageRow[] = [
    {
      id: id(),
      reference: "CM-7KQ2MA",
      name: "Aline Uwase",
      reach: "aline@example.test",
      subject: "Our clinic is not listed",
      message: "We run a clinic in Huye and would like to join MediLink. Who do we talk to?",
      language: "en",
      status: "new",
      created_at: now(),
      handled_by: null,
      handled_at: null,
      note: "",
    },
  ];

  const handlers = [
    // ---- public
    http.post(`${api}/public/contact/`, async ({ request }) => {
      await context.settle();
      const body = await context.readJson(request);
      const message: ContactMessageRow = {
        id: id(),
        reference: `CM-${String(contactMessages.length + 1).padStart(6, "0")}`,
        name: str(body.name),
        reach: str(body.reach),
        subject: str(body.subject),
        message: str(body.message),
        language: context.languageFrom(request),
        status: "new",
        created_at: now(),
        handled_by: null,
        handled_at: null,
        note: "",
      };
      contactMessages.unshift(message);
      return HttpResponse.json({ reference: message.reference }, { status: 201 });
    }),
    http.get(`${api}/platform/contact-messages/`, ({ request }) => {
      const admin = platformAdmin(context, context.languageFrom(request));
      if ("error" in admin) return admin.error;
      const url = new URL(request.url);
      const status = url.searchParams.get("status");
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const rows = contactMessages.filter(
        (m) =>
          (!status || m.status === status) &&
          (!q ||
            m.reference.toLowerCase() === q ||
            m.name.toLowerCase().includes(q) ||
            m.subject.toLowerCase().includes(q)),
      );
      return HttpResponse.json(page(rows, url));
    }),
    http.post(`${api}/platform/contact-messages/:id/handled/`, async ({ request, params }) => {
      const lang = context.languageFrom(request);
      const admin = platformAdmin(context, lang);
      if ("error" in admin) return admin.error;
      const message = contactMessages.find((m) => m.id === str(params.id));
      if (!message)
        return context.errorResponse(404, "not_found", context.message("notFound", lang));
      if (message.status === "handled")
        return context.errorResponse(409, "conflict", "This message is already handled.");
      const body = await context.readJson(request);
      Object.assign(message, {
        status: "handled",
        handled_by: { id: admin.me.id, full_name: admin.me.full_name },
        handled_at: now(),
        note: str(body.note ?? ""),
      });
      return HttpResponse.json(message);
    }),
    http.get(`${api}/public/help-articles/`, ({ request }) =>
      listArticles("patient", new URL(request.url), context.languageFrom(request)),
    ),
    http.get(`${api}/public/help-articles/:slug/`, ({ request, params }) =>
      oneArticle("patient", str(params.slug), context.languageFrom(request)),
    ),

    // ---- patient
    http.get(`${api}/patient/support-requests/`, ({ request }) => {
      const lang = context.languageFrom(request);
      const auth = context.authenticatedPatient(lang);
      if ("error" in auth) return auth.error;
      const mine = requests.filter(
        (r) => r.requester_id === auth.me.id && r.requester_audience === "patient",
      );
      return listOf(mine, new URL(request.url));
    }),
    http.post(`${api}/patient/support-requests/`, async ({ request }) => {
      const lang = context.languageFrom(request);
      const auth = context.authenticatedPatient(lang);
      if ("error" in auth) return auth.error;
      const csrf = context.csrfFailure(request, lang);
      if (csrf) return csrf;
      const body = await context.readJson(request);
      return create(body, auth.me, "patient", null, lang);
    }),
    http.get(`${api}/patient/support-requests/:id/`, ({ request, params }) => {
      const lang = context.languageFrom(request);
      const auth = context.authenticatedPatient(lang);
      if ("error" in auth) return auth.error;
      const r = requests.find(
        (x) =>
          x.id === params.id && x.requester_id === auth.me.id && x.requester_audience === "patient",
      );
      return r ? HttpResponse.json(requesterView(r)) : notFound(lang);
    }),
    http.post(`${api}/patient/support-requests/:id/messages/`, async ({ request, params }) => {
      const lang = context.languageFrom(request);
      const auth = context.authenticatedPatient(lang);
      if ("error" in auth) return auth.error;
      const csrf = context.csrfFailure(request, lang);
      if (csrf) return csrf;
      const r = requests.find(
        (x) =>
          x.id === params.id && x.requester_id === auth.me.id && x.requester_audience === "patient",
      );
      if (!r) return notFound(lang);
      if (r.status === "closed")
        return context.errorResponse(422, "business_rule_violation", msg("closed", lang));
      const body = await context.readJson(request);
      const invalid = checkReply(body, lang);
      if (invalid) return invalid;
      addMessage(r, "requester", person(auth.me), str(body.body));
      return HttpResponse.json(requesterView(r), { status: 201 });
    }),
    http.post(`${api}/patient/support-requests/:id/close/`, ({ request, params }) => {
      const lang = context.languageFrom(request);
      const auth = context.authenticatedPatient(lang);
      if ("error" in auth) return auth.error;
      const csrf = context.csrfFailure(request, lang);
      if (csrf) return csrf;
      const r = requests.find(
        (x) =>
          x.id === params.id && x.requester_id === auth.me.id && x.requester_audience === "patient",
      );
      if (!r) return notFound(lang);
      if (r.status === "closed") return conflict(context, lang);
      close(r, "withdrawn", person(auth.me));
      return HttpResponse.json(requesterView(r));
    }),

    // ---- staff
    http.get(`${api}/staff/help-articles/`, ({ request }) => {
      const lang = context.languageFrom(request);
      const s = staffContext(lang);
      if ("error" in s) return s.error;
      return listArticles("staff", new URL(request.url), lang);
    }),
    http.get(`${api}/staff/help-articles/:slug/`, ({ request, params }) => {
      const lang = context.languageFrom(request);
      const s = staffContext(lang);
      if ("error" in s) return s.error;
      return oneArticle("staff", str(params.slug), lang);
    }),
    http.get(`${api}/staff/support-requests/`, ({ request }) => {
      const lang = context.languageFrom(request);
      const s = staffContext(lang);
      if ("error" in s) return s.error;
      const url = new URL(request.url);
      const scope = url.searchParams.get("scope") ?? "mine";
      if (scope !== "mine" && scope !== "facility")
        return fieldError(context, lang, { scope: msg("invalid", lang) });
      if (scope === "facility") {
        if (!s.me.permissions.includes("support.view_facility"))
          return context.errorResponse(403, "permission_denied", s1("permissionDenied", lang));
        return listOf(
          requests.filter(
            (r) => r.requester_audience === "staff" && r.facility_id === s.facility.id,
          ),
          url,
        );
      }
      return listOf(
        requests.filter((r) => r.requester_audience === "staff" && r.requester_id === s.me.id),
        url,
      );
    }),
    http.post(`${api}/staff/support-requests/`, async ({ request }) => {
      const lang = context.languageFrom(request);
      const s = staffContext(lang);
      if ("error" in s) return s.error;
      const csrf = context.csrfFailure(request, lang);
      if (csrf) return csrf;
      const body = await context.readJson(request);
      return create(body, s.me, "staff", s.facility, lang);
    }),
    http.get(`${api}/staff/support-requests/:id/`, ({ request, params }) => {
      const lang = context.languageFrom(request);
      const s = staffContext(lang);
      if ("error" in s) return s.error;
      const r = requests.find((x) => x.id === params.id && x.requester_audience === "staff");
      if (!r) return notFound(lang);
      const own = r.requester_id === s.me.id;
      const facilityView =
        s.me.permissions.includes("support.view_facility") && r.facility_id === s.facility.id;
      return own || facilityView ? HttpResponse.json(requesterView(r)) : notFound(lang);
    }),
    ...(["messages", "close"] as const).map((action) =>
      http.post(`${api}/staff/support-requests/:id/${action}/`, async ({ request, params }) => {
        const lang = context.languageFrom(request);
        const s = staffContext(lang);
        if ("error" in s) return s.error;
        const csrf = context.csrfFailure(request, lang);
        if (csrf) return csrf;
        const r = requests.find((x) => x.id === params.id && x.requester_audience === "staff");
        if (!r) return notFound(lang);
        if (r.requester_id !== s.me.id) {
          const facilityView =
            s.me.permissions.includes("support.view_facility") && r.facility_id === s.facility.id;
          return facilityView
            ? context.errorResponse(403, "permission_denied", s1("permissionDenied", lang))
            : notFound(lang);
        }
        if (action === "close") {
          if (r.status === "closed") return conflict(context, lang);
          close(r, "withdrawn", person(s.me));
          return HttpResponse.json(requesterView(r));
        }
        if (r.status === "closed")
          return context.errorResponse(422, "business_rule_violation", msg("closed", lang));
        const body = await context.readJson(request);
        const invalid = checkReply(body, lang);
        if (invalid) return invalid;
        addMessage(r, "requester", person(s.me), str(body.body));
        return HttpResponse.json(requesterView(r), { status: 201 });
      }),
    ),

    // ---- platform: support queue
    http.get(`${api}/platform/support-requests/`, ({ request }) => {
      const lang = context.languageFrom(request);
      const admin = platformAdmin(context, lang);
      if ("error" in admin) return admin.error;
      const url = new URL(request.url);
      const sp = url.searchParams;
      const status = sp.get("status");
      const q = (sp.get("q") ?? "").trim().toLowerCase();
      const rows = requests
        .filter((r) =>
          status === "active" ? r.status !== "closed" : status ? r.status === status : true,
        )
        .filter((r) => !sp.get("topic") || r.topic === sp.get("topic"))
        .filter((r) => !sp.get("audience") || r.requester_audience === sp.get("audience"))
        .filter((r) => !sp.get("priority") || r.priority === sp.get("priority"))
        .filter((r) => !sp.get("facility_id") || r.facility_id === sp.get("facility_id"))
        .filter((r) =>
          sp.get("assigned") === "me"
            ? r.assigned_to?.id === admin.me.id
            : sp.get("assigned") === "none"
              ? r.assigned_to === null
              : true,
        )
        .filter(
          (r) => !q || r.reference.toLowerCase().includes(q) || r.subject.toLowerCase().includes(q),
        )
        .sort(
          (a, b) =>
            (a.priority === "high" ? 0 : 1) - (b.priority === "high" ? 0 : 1) ||
            a.last_message_at.localeCompare(b.last_message_at),
        );
      return HttpResponse.json(page(rows.map(platformRow), url));
    }),
    http.get(`${api}/platform/support-requests/:id/`, ({ request, params }) => {
      const lang = context.languageFrom(request);
      const admin = platformAdmin(context, lang);
      if ("error" in admin) return admin.error;
      const r = requests.find((x) => x.id === params.id);
      return r ? HttpResponse.json(platformView(r)) : notFound(lang);
    }),
    http.patch(`${api}/platform/support-requests/:id/`, async ({ request, params }) => {
      const lang = context.languageFrom(request);
      const admin = platformAdmin(context, lang);
      if ("error" in admin) return admin.error;
      const csrf = context.csrfFailure(request, lang);
      if (csrf) return csrf;
      const r = requests.find((x) => x.id === params.id);
      if (!r) return notFound(lang);
      const body = await context.readJson(request);
      if (body.version !== r.version) return conflict(context, lang);
      if (r.status === "closed")
        return context.errorResponse(422, "business_rule_violation", msg("closed", lang));
      if ("priority" in body) r.priority = str(body.priority) as SupportPriority;
      if ("topic" in body) r.topic = str(body.topic) as SupportTopic;
      if ("assigned_to_id" in body) {
        if (body.assigned_to_id === null) r.assigned_to = null;
        else {
          const user = STAFF_USERS.find((u) => u.id === body.assigned_to_id && u.is_platform_admin);
          if (!user) return fieldError(context, lang, { assigned_to_id: msg("assignee", lang) });
          r.assigned_to = person(user);
        }
      }
      r.version += 1;
      return HttpResponse.json(platformView(r));
    }),
    http.post(`${api}/platform/support-requests/:id/replies/`, async ({ request, params }) => {
      const lang = context.languageFrom(request);
      const admin = platformAdmin(context, lang);
      if ("error" in admin) return admin.error;
      const csrf = context.csrfFailure(request, lang);
      if (csrf) return csrf;
      const r = requests.find((x) => x.id === params.id);
      if (!r) return notFound(lang);
      if (r.status === "closed")
        return context.errorResponse(422, "business_rule_violation", msg("closed", lang));
      const body = await context.readJson(request);
      const invalid = checkReply(body, lang);
      if (invalid) return invalid;
      addMessage(r, "support", person(admin.me), str(body.body));
      return HttpResponse.json(platformView(r), { status: 201 });
    }),
    http.post(`${api}/platform/support-requests/:id/close/`, async ({ request, params }) => {
      const lang = context.languageFrom(request);
      const admin = platformAdmin(context, lang);
      if ("error" in admin) return admin.error;
      const csrf = context.csrfFailure(request, lang);
      if (csrf) return csrf;
      const r = requests.find((x) => x.id === params.id);
      if (!r) return notFound(lang);
      const body = await context.readJson(request);
      const reason = str(body.reason);
      if (!(SUPPORT_CLOSE_REASONS as readonly string[]).includes(reason))
        return fieldError(context, lang, { reason: msg("invalid", lang) });
      if (r.status === "closed") return conflict(context, lang);
      if (str(body.body).trim()) addMessage(r, "support", person(admin.me), str(body.body));
      close(r, reason as SupportCloseReason, person(admin.me));
      return HttpResponse.json(platformView(r));
    }),

    // ---- platform: help articles
    http.get(`${api}/platform/help-articles/`, ({ request }) => {
      const lang = context.languageFrom(request);
      const admin = platformAdmin(context, lang);
      if ("error" in admin) return admin.error;
      const url = new URL(request.url);
      const sp = url.searchParams;
      const q = (sp.get("q") ?? "").trim().toLowerCase();
      const rows = articles
        .filter((a) => !sp.get("audience") || a.audience === sp.get("audience"))
        .filter((a) => !sp.get("status") || a.status === sp.get("status"))
        .filter((a) => !sp.get("category") || a.category === sp.get("category"))
        .filter(
          (a) =>
            !q ||
            a.slug.includes(q) ||
            Object.values(a.title_i18n).some((v) => v?.toLowerCase().includes(q)),
        )
        .sort((a, b) => a.audience.localeCompare(b.audience) || a.sort_order - b.sort_order);
      return HttpResponse.json(page(rows.map(platformSummary), url));
    }),
    http.get(`${api}/platform/help-articles/:id/`, ({ request, params }) => {
      const lang = context.languageFrom(request);
      const admin = platformAdmin(context, lang);
      if ("error" in admin) return admin.error;
      const a = articles.find((x) => x.id === params.id);
      return a ? HttpResponse.json({ ...a, missing_languages: missingOf(a) }) : notFound(lang);
    }),
    http.post(`${api}/platform/help-articles/`, async ({ request }) => {
      const lang = context.languageFrom(request);
      const admin = platformAdmin(context, lang);
      if ("error" in admin) return admin.error;
      const csrf = context.csrfFailure(request, lang);
      if (csrf) return csrf;
      const body = await context.readJson(request);
      const invalid = checkArticle(body, null, lang);
      if (invalid) return invalid;
      const at = now();
      const a: MockArticle = {
        id: id(),
        slug: str(body.slug),
        audience: str(body.audience) as HelpAudience,
        category: str(body.category) as HelpCategory,
        title_i18n: i18n(body.title_i18n),
        summary_i18n: i18n(body.summary_i18n),
        body_i18n: i18n(body.body_i18n),
        sort_order: typeof body.sort_order === "number" ? body.sort_order : 100,
        status: "draft",
        published_at: null,
        missing_languages: [],
        created_by: person(admin.me),
        updated_by: person(admin.me),
        version: 1,
        created_at: at,
        updated_at: at,
      };
      articles.push(a);
      return HttpResponse.json({ ...a, missing_languages: missingOf(a) }, { status: 201 });
    }),
    http.patch(`${api}/platform/help-articles/:id/`, async ({ request, params }) => {
      const lang = context.languageFrom(request);
      const admin = platformAdmin(context, lang);
      if ("error" in admin) return admin.error;
      const csrf = context.csrfFailure(request, lang);
      if (csrf) return csrf;
      const a = articles.find((x) => x.id === params.id);
      if (!a) return notFound(lang);
      const body = await context.readJson(request);
      if (body.version !== a.version) return conflict(context, lang);
      const invalid = checkArticle({ ...a, ...body }, a.id, lang);
      if (invalid) return invalid;
      if ("slug" in body) a.slug = str(body.slug);
      if ("audience" in body) a.audience = str(body.audience) as HelpAudience;
      if ("category" in body) a.category = str(body.category) as HelpCategory;
      if ("title_i18n" in body) a.title_i18n = i18n(body.title_i18n);
      if ("summary_i18n" in body) a.summary_i18n = i18n(body.summary_i18n);
      if ("body_i18n" in body) a.body_i18n = i18n(body.body_i18n);
      if (typeof body.sort_order === "number") a.sort_order = body.sort_order;
      a.version += 1;
      a.updated_at = now();
      a.updated_by = person(admin.me);
      return HttpResponse.json({ ...a, missing_languages: missingOf(a) });
    }),
    http.post(`${api}/platform/help-articles/:id/publish/`, ({ request, params }) => {
      const lang = context.languageFrom(request);
      const admin = platformAdmin(context, lang);
      if ("error" in admin) return admin.error;
      const csrf = context.csrfFailure(request, lang);
      if (csrf) return csrf;
      const a = articles.find((x) => x.id === params.id);
      if (!a) return notFound(lang);
      const step = stepUpFailure(context, lang);
      if (step) return step;
      if (a.status === "published") return conflict(context, lang);
      if (missingOf(a).length)
        return context.errorResponse(422, "business_rule_violation", msg("missing", lang));
      a.status = "published";
      a.published_at = now();
      a.version += 1;
      return HttpResponse.json({ ...a, missing_languages: [] });
    }),
    http.post(`${api}/platform/help-articles/:id/unpublish/`, ({ request, params }) => {
      const lang = context.languageFrom(request);
      const admin = platformAdmin(context, lang);
      if ("error" in admin) return admin.error;
      const csrf = context.csrfFailure(request, lang);
      if (csrf) return csrf;
      const a = articles.find((x) => x.id === params.id);
      if (!a) return notFound(lang);
      if (a.status === "draft") return conflict(context, lang);
      a.status = "draft";
      a.published_at = null;
      a.version += 1;
      return HttpResponse.json({ ...a, missing_languages: missingOf(a) });
    }),
  ];

  function i18n(value: unknown): I18nText {
    if (!value || typeof value !== "object") return {};
    const out: I18nText = {};
    for (const lang of LANGS) {
      const v = str((value as Record<string, unknown>)[lang]).trim();
      if (v) out[lang] = v;
    }
    return out;
  }

  function checkArticle(body: Record<string, unknown>, selfId: string | null, lang: LanguageCode) {
    const fields: Record<string, string> = {};
    const slug = str(body.slug);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) fields.slug = msg("slug", lang);
    else if (articles.some((a) => a.slug === slug && a.id !== selfId))
      fields.slug = msg("slugTaken", lang);
    if (!["patient", "staff"].includes(str(body.audience))) fields.audience = msg("invalid", lang);
    if (!(HELP_CATEGORIES as readonly string[]).includes(str(body.category)))
      fields.category = msg("invalid", lang);
    const limits = { title_i18n: 120, summary_i18n: 300, body_i18n: 8000 } as const;
    for (const [field, max] of Object.entries(limits)) {
      const value = body[field];
      if (value === undefined) continue;
      if (!value || typeof value !== "object") {
        fields[field] = msg("invalid", lang);
        continue;
      }
      const keys = Object.keys(value);
      if (keys.some((k) => !LANGS.includes(k as LanguageCode)))
        fields[field] = msg("invalid", lang);
      else if (Object.values(value).some((v) => str(v).length > max))
        fields[field] = msg("length", lang);
    }
    return Object.keys(fields).length ? fieldError(context, lang, fields) : null;
  }

  return {
    handlers,
    reset: () => {
      articles = seedArticles();
      requests = seedRequests();
    },
  };
};

/** IDs of the seeded mock records (tests). */
export const MOCK_HELP = {
  patientRequestId: "5e200000-0000-4000-8000-000000000001",
  staffRequestId: "5e200000-0000-4000-8000-000000000002",
  /** A Gasabo Family Clinic colleague's request (the mock facility admin's facility). */
  colleagueRequestId: "5e200000-0000-4000-8000-000000000003",
  draftArticleId: "5e100000-0000-4000-8000-000000000012",
  noFrenchArticleId: "5e100000-0000-4000-8000-000000000003",
} as const;

export type { SupportStatus };
