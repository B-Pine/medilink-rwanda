import {
  articleBlocks,
  isApiError,
  pickText,
  type I18nText,
  type SupportStatus,
} from "@medilink/api-client";
import type { LanguageCode } from "@medilink/api-client";
import { Badge, type BadgeTone } from "@medilink/ui";
import { dateFormat } from "@medilink/ui/i18n";
import { useTranslation } from "react-i18next";

export const helpKeys = {
  all: ["help"] as const,
  articles: (q: string, category: string) => ["help", "articles", q, category] as const,
  article: (slug: string) => ["help", "article", slug] as const,
  requests: (status: string) => ["help", "requests", status] as const,
  request: (id: string) => ["help", "request", id] as const,
};

export function useLanguage(): LanguageCode {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? i18n.language).slice(0, 2);
  return lang === "en" || lang === "fr" ? lang : "rw";
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

/** "1 Nov 2026, 10:14" in Africa/Kigali, through dateFormat() (Kinyarwanda month names). */
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

/** An i18n text in the UI language, with a note when it falls back to another language. */
export function LocalText({ text, as: Tag = "span" }: { text: I18nText; as?: "span" | "p" }) {
  const lang = useLanguage();
  const picked = pickText(text, lang);
  return <Tag lang={picked.language ?? undefined}>{picked.text}</Tag>;
}

export function FallbackNote({ texts }: { texts: I18nText[] }) {
  const { t } = useTranslation();
  const lang = useLanguage();
  const used = pickText(texts[0] ?? {}, lang).language;
  if (!used || used === lang) return null;
  return (
    <p className="m-0 text-body-sm text-fg-muted">
      {t("help.shownIn", { language: t(`help.languages.${used}`) })}
    </p>
  );
}

/** Plain-text article body as paragraphs and lists: text nodes only, never HTML (S10-F2). */
export function ArticleText({ body, lang }: { body: string; lang?: string }) {
  return (
    <div lang={lang} className="flex flex-col gap-3 text-body">
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

const STATUS_TONE: Record<SupportStatus, BadgeTone> = {
  open: "neutral",
  answered: "info",
  closed: "success",
};

export function StatusBadge({ status }: { status: SupportStatus }) {
  const { t } = useTranslation();
  return <Badge tone={STATUS_TONE[status]}>{t(`help.status.${status}`)}</Badge>;
}
