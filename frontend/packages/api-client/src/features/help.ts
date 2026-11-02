/**
 * S10 part 1: help center and support requests (contract sprint-10 §3.2). Shapes follow
 * `backend/medilink/support/serializers.py`. Article text is plain text (a blank line separates
 * paragraphs, a line starting with "- " is a list item); render it as text, never as HTML.
 */
import type { ApiClient } from "../client";
import type { LanguageCode, Uuid } from "../types";
import { query, type I18nText, type Page } from "./masterdata";

declare module "../types" {
  interface PermissionCodes {
    "support.view_facility": true;
  }
}

export type HelpAudience = "patient" | "staff";
export const HELP_CATEGORIES = [
  "getting_started",
  "account_security",
  "booking_visits",
  "family_profile",
  "notifications",
  "privacy",
  "facility_work",
  "other",
] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];
export type HelpArticleStatus = "draft" | "published";

export const SUPPORT_TOPICS = [
  "account_access",
  "booking_visits",
  "family_profile",
  "notifications",
  "privacy",
  "facility_setup",
  "technical",
  "other",
] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];
/** The patient form offers every topic but `facility_setup`; staff every one but `family_profile`. */
export const PATIENT_SUPPORT_TOPICS = SUPPORT_TOPICS.filter((t) => t !== "facility_setup");
export const STAFF_SUPPORT_TOPICS = SUPPORT_TOPICS.filter((t) => t !== "family_profile");

export type SupportStatus = "open" | "answered" | "closed";
export type SupportPriority = "normal" | "high";
export type SupportCloseReason =
  "resolved" | "no_response" | "duplicate" | "redirected_to_facility" | "withdrawn";
/** Reasons support can close with (`withdrawn` is the requester's). */
export const SUPPORT_CLOSE_REASONS = [
  "resolved",
  "no_response",
  "duplicate",
  "redirected_to_facility",
] as const;
export type SupportAuthorKind = "requester" | "support";

/** Contract §2.4 limits, mirrored for counters. */
export const HELP_LIMITS = { title: 120, summary: 300, body: 8000 } as const;
export const SUPPORT_LIMITS = {
  subject: { min: 3, max: 120 },
  body: { min: 10, max: 4000 },
  reply: { min: 1, max: 4000 },
  openRequests: 5,
} as const;

export interface PersonRef {
  id: Uuid;
  full_name: string;
}

export interface HelpArticleSummary {
  id: Uuid;
  slug: string;
  audience: HelpAudience;
  category: HelpCategory;
  title_i18n: I18nText;
  summary_i18n: I18nText;
  sort_order: number;
  updated_at: string;
}

export interface HelpArticle extends HelpArticleSummary {
  body_i18n: I18nText;
}

export interface PlatformHelpArticleSummary extends HelpArticleSummary {
  status: HelpArticleStatus;
  published_at: string | null;
  missing_languages: LanguageCode[];
  created_by: PersonRef | null;
  updated_by: PersonRef | null;
  version: number;
  created_at: string;
}

export interface PlatformHelpArticle extends PlatformHelpArticleSummary {
  body_i18n: I18nText;
}

export interface HelpArticleWrite {
  slug: string;
  audience: HelpAudience;
  category: HelpCategory;
  title_i18n: I18nText;
  summary_i18n?: I18nText;
  body_i18n?: I18nText;
  sort_order?: number;
}

export interface SupportMessage {
  id: Uuid;
  author_kind: SupportAuthorKind;
  /** "MediLink support" for support authors in requester views; the real name on platform. */
  author_name: string;
  body: string;
  created_at: string;
}

export interface SupportRequestRow {
  id: Uuid;
  reference: string;
  topic: SupportTopic;
  subject: string;
  status: SupportStatus;
  close_reason: SupportCloseReason | null;
  facility: { id: Uuid; name: string } | null;
  requester: PersonRef;
  message_count: number;
  last_message_at: string;
  closed_at: string | null;
  created_at: string;
  version: number;
}

export interface SupportRequest extends SupportRequestRow {
  messages: SupportMessage[];
}

export interface PlatformSupportRequestRow extends SupportRequestRow {
  requester_audience: HelpAudience;
  priority: SupportPriority;
  assigned_to: PersonRef | null;
  language: LanguageCode;
  client_label: string;
  client_path: string;
  closed_by: PersonRef | null;
}

export interface PlatformSupportRequest extends PlatformSupportRequestRow {
  messages: SupportMessage[];
}

export interface SupportRequestCreate {
  topic: SupportTopic;
  subject: string;
  body: string;
  /** In-app path the form was opened from (`^/[A-Za-z0-9/_-]*$`). */
  client_path?: string;
}

export interface SupportTriage {
  priority?: SupportPriority;
  topic?: SupportTopic;
  assigned_to_id?: Uuid | null;
  version: number;
}

export interface PublicContactInput {
  name: string;
  /** Email address or phone number to answer to. */
  reach: string;
  subject: string;
  message: string;
}

export interface ArticleListParams {
  q?: string;
  category?: HelpCategory;
  page?: number;
}

export interface PlatformArticleParams extends ArticleListParams {
  audience?: HelpAudience;
  status?: HelpArticleStatus;
}

export interface RequestListParams {
  /** `active` = open + answered. */
  status?: "active" | "closed";
  page?: number;
}

export interface StaffRequestListParams extends RequestListParams {
  scope?: "mine" | "facility";
}

export interface PlatformRequestParams {
  status?: SupportStatus | "active";
  topic?: SupportTopic;
  audience?: HelpAudience;
  priority?: SupportPriority;
  facility_id?: Uuid;
  assigned?: "me" | "none";
  q?: string;
  page?: number;
}

const v1 = "/api/v1";

const requestPaths = (base: string) => ({
  list: `${base}/support-requests/`,
  detail: (id: Uuid) => `${base}/support-requests/${id}/`,
  messages: (id: Uuid) => `${base}/support-requests/${id}/messages/`,
  close: (id: Uuid) => `${base}/support-requests/${id}/close/`,
});

export const helpPaths = {
  public: {
    articles: `${v1}/public/help-articles/`,
    article: (slug: string) => `${v1}/public/help-articles/${encodeURIComponent(slug)}/`,
    /** Upgrade 11 §13: proposed, not built on the API yet. */
    contact: `${v1}/public/contact/`,
  },
  patient: requestPaths(`${v1}/patient`),
  staff: {
    articles: `${v1}/staff/help-articles/`,
    article: (slug: string) => `${v1}/staff/help-articles/${encodeURIComponent(slug)}/`,
    ...requestPaths(`${v1}/staff`),
  },
  platform: {
    requests: `${v1}/platform/support-requests/`,
    request: (id: Uuid) => `${v1}/platform/support-requests/${id}/`,
    replies: (id: Uuid) => `${v1}/platform/support-requests/${id}/replies/`,
    close: (id: Uuid) => `${v1}/platform/support-requests/${id}/close/`,
    articles: `${v1}/platform/help-articles/`,
    article: (id: Uuid) => `${v1}/platform/help-articles/${id}/`,
    publish: (id: Uuid) => `${v1}/platform/help-articles/${id}/publish/`,
    unpublish: (id: Uuid) => `${v1}/platform/help-articles/${id}/unpublish/`,
  },
} as const;

function requesterApi(client: ApiClient, p: ReturnType<typeof requestPaths>) {
  return {
    get: (id: Uuid) => client.get<SupportRequest>(p.detail(id)),
    create: (body: SupportRequestCreate) => client.post<SupportRequest>(p.list, body),
    reply: (id: Uuid, body: string) => client.post<SupportRequest>(p.messages(id), { body }),
    close: (id: Uuid) => client.post<SupportRequest>(p.close(id), {}),
  };
}

export function createHelpApi(client: ApiClient) {
  const { platform } = helpPaths;
  return {
    public: {
      articles: (params: ArticleListParams = {}) =>
        client.get<Page<HelpArticleSummary>>(helpPaths.public.articles + query({ ...params })),
      article: (slug: string) => client.get<HelpArticle>(helpPaths.public.article(slug)),
      /** Public contact form (upgrade 11 §13, proposed endpoint). */
      contact: (body: PublicContactInput) => client.post<void>(helpPaths.public.contact, body),
    },
    patient: {
      requests: (params: RequestListParams = {}) =>
        client.get<Page<SupportRequestRow>>(helpPaths.patient.list + query({ ...params })),
      ...requesterApi(client, helpPaths.patient),
    },
    staff: {
      articles: (params: ArticleListParams = {}) =>
        client.get<Page<HelpArticleSummary>>(helpPaths.staff.articles + query({ ...params })),
      article: (slug: string) => client.get<HelpArticle>(helpPaths.staff.article(slug)),
      requests: (params: StaffRequestListParams = {}) =>
        client.get<Page<SupportRequestRow>>(helpPaths.staff.list + query({ ...params })),
      ...requesterApi(client, helpPaths.staff),
    },
    platform: {
      requests: (params: PlatformRequestParams = {}) =>
        client.get<Page<PlatformSupportRequestRow>>(platform.requests + query({ ...params })),
      request: (id: Uuid) => client.get<PlatformSupportRequest>(platform.request(id)),
      triage: (id: Uuid, body: SupportTriage) =>
        client.request<PlatformSupportRequest>("PATCH", platform.request(id), { body }),
      reply: (id: Uuid, body: string) =>
        client.post<PlatformSupportRequest>(platform.replies(id), { body }),
      close: (id: Uuid, reason: (typeof SUPPORT_CLOSE_REASONS)[number], body = "") =>
        client.post<PlatformSupportRequest>(platform.close(id), { reason, body }),
      articles: (params: PlatformArticleParams = {}) =>
        client.get<Page<PlatformHelpArticleSummary>>(platform.articles + query({ ...params })),
      article: (id: Uuid) => client.get<PlatformHelpArticle>(platform.article(id)),
      createArticle: (body: HelpArticleWrite) =>
        client.post<PlatformHelpArticle>(platform.articles, body),
      updateArticle: (id: Uuid, body: Partial<HelpArticleWrite> & { version: number }) =>
        client.request<PlatformHelpArticle>("PATCH", platform.article(id), { body }),
      publish: (id: Uuid) => client.post<PlatformHelpArticle>(platform.publish(id)),
      unpublish: (id: Uuid) => client.post<PlatformHelpArticle>(platform.unpublish(id)),
    },
  };
}

export type HelpApi = ReturnType<typeof createHelpApi>;

/** An i18n text in the wanted language, falling back rw → en → fr (contract §6.1). */
export function pickText(
  text: I18nText,
  language: LanguageCode,
): { text: string; language: LanguageCode | null } {
  for (const lang of [language, "rw", "en", "fr"] as const) {
    const value = text[lang]?.trim();
    if (value) return { text: value, language: lang };
  }
  return { text: "", language: null };
}

/** Plain-text article body as blocks: paragraphs and lists (lines starting with "- "). */
export type ArticleBlock = { kind: "paragraph"; text: string } | { kind: "list"; items: string[] };

export function articleBlocks(body: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  for (const chunk of body.replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk.split("\n").filter((l) => l.trim());
    if (!lines.length) continue;
    let paragraph: string[] = [];
    let list: string[] = [];
    const flushParagraph = () => {
      if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    };
    const flushList = () => {
      if (list.length) blocks.push({ kind: "list", items: list });
      list = [];
    };
    for (const line of lines) {
      const item = /^\s*- (.*)$/.exec(line);
      if (item) {
        flushParagraph();
        list.push(item[1]!.trim());
      } else {
        flushList();
        paragraph.push(line.trim());
      }
    }
    flushParagraph();
    flushList();
  }
  return blocks;
}
