import {
  articleBlocks,
  isApiError,
  pickText,
  type I18nText,
  type LanguageCode,
  type SupportMessage,
  type SupportStatus,
} from "@medilink/api-client";
import { ChatsCircle } from "@phosphor-icons/react";
import { Badge, cx, type BadgeTone } from "@medilink/ui";
import { dateFormat } from "@medilink/ui/i18n";
import { useTranslation } from "react-i18next";

import { useStaffMe } from "../../auth/queries";

export const helpKeys = {
  all: ["help"] as const,
  articles: (q: string, category: string) => ["help", "articles", q, category] as const,
  article: (slug: string) => ["help", "article", slug] as const,
  requests: (scope: string) => ["help", "requests", scope] as const,
  request: (id: string) => ["help", "request", id] as const,
  queue: (params: Record<string, string>) => ["help", "queue", params] as const,
  platformRequest: (id: string) => ["help", "platform", "request", id] as const,
  platformArticles: (params: Record<string, string>) =>
    ["help", "platform", "articles", params] as const,
  platformArticle: (id: string) => ["help", "platform", "article", id] as const,
};

export function useLanguage(): LanguageCode {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? i18n.language).slice(0, 2);
  return lang === "en" || lang === "fr" ? lang : "rw";
}

export function useCan(code: string): boolean {
  const { data: me } = useStaffMe();
  return Boolean(me?.permissions.includes(code as never));
}

export function errorText(error: unknown, fallback: string): string {
  return isApiError(error) ? error.message : fallback;
}

export function fieldErrors(error: unknown): Record<string, string> {
  if (!isApiError(error)) return {};
  return Object.fromEntries(
    Object.entries(error.fields).map(([field, messages]) => [field, messages[0] ?? ""]),
  );
}

export const isStatus = (error: unknown, status: number) =>
  isApiError(error) && error.status === status;

/** Date and time in Africa/Kigali through dateFormat() (Kinyarwanda month names). */
export function useWhen() {
  const lang = useLanguage();
  return (value: string) => {
    const options: Intl.DateTimeFormatOptions = {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Kigali",
    };
    try {
      return dateFormat(lang, options).format(new Date(value));
    } catch {
      return new Intl.DateTimeFormat("en", options).format(new Date(value));
    }
  };
}

export function LocalText({ text }: { text: I18nText }) {
  const lang = useLanguage();
  const picked = pickText(text, lang);
  return <span lang={picked.language ?? undefined}>{picked.text}</span>;
}

export function FallbackNote({ text }: { text: I18nText }) {
  const { t } = useTranslation();
  const lang = useLanguage();
  const used = pickText(text, lang).language;
  if (!used || used === lang) return null;
  return (
    <p className="m-0 text-body-sm text-fg-muted">
      {t("help.shownIn", { language: t(`help.languages.${used}`) })}
    </p>
  );
}

/** Plain-text article body as paragraphs and lists: text nodes only, never HTML. */
export function ArticleText({ body, lang }: { body: string; lang?: string }) {
  return (
    <div lang={lang} className="flex flex-col gap-3">
      {articleBlocks(body).map((block, index) =>
        block.kind === "paragraph" ? (
          <p key={index} className="m-0">
            {block.text}
          </p>
        ) : (
          <ul key={index} className="m-0 flex flex-col gap-1 ps-6">
            {block.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

const TONE: Record<SupportStatus, BadgeTone> = {
  open: "neutral",
  answered: "info",
  closed: "success",
};

/** Requester wording ("Waiting for MediLink") or platform wording ("Open"). */
export function StatusBadge({
  status,
  platform = false,
}: {
  status: SupportStatus;
  platform?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Badge tone={TONE[status]}>
      {t(platform ? `help.platformStatus.${status}` : `help.status.${status}`)}
    </Badge>
  );
}

/** Messages, requester on one side and support on the other. */
export function Thread({
  messages,
  label,
  youId,
  supportSide = "start",
}: {
  messages: SupportMessage[];
  label: string;
  /** Name shown as "You" (the requester's own messages). */
  youId?: "requester" | "support";
  supportSide?: "start" | "end";
}) {
  const { t } = useTranslation();
  const when = useWhen();
  return (
    <ol aria-label={label} className="m-0 flex list-none flex-col gap-3 p-0">
      {messages.map((m) => {
        const support = m.author_kind === "support";
        const end = support ? supportSide === "end" : supportSide === "start";
        return (
          <li key={m.id} className={cx("flex", end ? "justify-end" : "justify-start")}>
            <div
              className={cx(
                "flex max-w-[85%] flex-col gap-1 rounded-lg p-3",
                end ? "bg-brand-subtle" : "border border-border bg-surface",
              )}
            >
              <span className="flex items-center gap-2 text-body-sm font-semibold text-fg-secondary">
                {support && <ChatsCircle aria-hidden="true" />}
                {youId === m.author_kind ? t("help.thread.you") : m.author_name}
                <span className="font-normal text-fg-muted">· {when(m.created_at)}</span>
              </span>
              <p className="m-0 whitespace-pre-wrap">{m.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
