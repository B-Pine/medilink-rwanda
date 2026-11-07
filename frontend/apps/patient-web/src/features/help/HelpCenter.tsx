import { HELP_CATEGORIES, type HelpCategory } from "@medilink/api-client";
import { CaretRight, ChatsCircle, MagnifyingGlass } from "@phosphor-icons/react";
import {
  Alert,
  Button,
  buttonClassName,
  Card,
  EmptyState,
  Skeleton,
  TextField,
} from "@medilink/ui";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { paths } from "../../app/paths";
import { useApi } from "../../app/services";
import { FallbackNote, helpKeys, LocalText } from "./shared";

/** Patient article categories (`facility_work` is for staff). */
const CATEGORIES = HELP_CATEGORIES.filter((c) => c !== "facility_work");

/**
 * The Help tab's searchable articles and the "Still need help?" card (contract sprint-10 §6.1).
 * Mounted by `SupportPage` in its [S10] block, below the emergency notice.
 */
export function HelpCenter() {
  const { t } = useTranslation();
  const api = useApi();
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<HelpCategory | "">("");
  const articles = useQuery({
    queryKey: helpKeys.articles(q, category),
    queryFn: () => api.help.public.articles({ q: q || undefined, category: category || undefined }),
  });
  const open = useQuery({
    queryKey: helpKeys.requests("active"),
    queryFn: () => api.help.patient.requests({ status: "active" }),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    setQ(value.length >= 2 ? value : "");
  };
  const rows = articles.data?.results ?? [];
  const openCount = open.data?.count ?? 0;

  return (
    <>
      <Card as="section" aria-labelledby="help-articles" className="flex flex-col gap-4">
        <h2 id="help-articles" className="m-0 text-h3">
          {t("help.articles")}
        </h2>
        <form role="search" onSubmit={submit} className="flex flex-wrap items-end gap-2">
          <TextField
            type="search"
            label={t("help.search.label")}
            placeholder={t("help.search.placeholder")}
            value={draft}
            maxLength={100}
            onChange={(e) => setDraft(e.target.value)}
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="secondary">
            <MagnifyingGlass aria-hidden="true" />
            {t("help.search.submit")}
          </Button>
        </form>
        <div role="group" aria-label={t("help.categories.label")} className="flex flex-wrap gap-2">
          {(["", ...CATEGORIES] as const).map((c) => (
            <button
              key={c || "all"}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className="inline-flex min-h-target cursor-pointer items-center rounded-full border border-border-input bg-surface px-4 text-body-sm font-semibold text-fg hover:bg-subtle aria-pressed:border-primary aria-pressed:bg-brand-subtle aria-pressed:text-on-brand-subtle"
            >
              {c ? t(`help.categories.${c}`) : t("help.categories.all")}
            </button>
          ))}
        </div>
        {articles.isPending ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            <Skeleton height="4rem" className="rounded-md" />
            <Skeleton height="4rem" className="rounded-md" />
          </div>
        ) : articles.isError ? (
          <Alert tone="danger" role="alert" title={t("help.loadFailed")}>
            <Button variant="secondary" onClick={() => void articles.refetch()}>
              {t("help.retry")}
            </Button>
          </Alert>
        ) : rows.length === 0 ? (
          <EmptyState
            size="inline"
            icon={MagnifyingGlass}
            title={t("help.search.none")}
            description={t("help.search.noneBody")}
          />
        ) : (
          <>
            {q && (
              <p className="m-0 text-body-sm text-fg-secondary" role="status">
                {t("help.search.results", { count: articles.data.count })}
              </p>
            )}
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {rows.map((a) => (
                <li key={a.id}>
                  <Link
                    to={paths.article(a.slug)}
                    className="flex min-h-target items-center gap-3 rounded-md border border-border p-3 text-fg no-underline hover:bg-subtle"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-semibold">
                        <LocalText text={a.title_i18n} />
                      </span>
                      <span className="text-body-sm text-fg-secondary">
                        <LocalText text={a.summary_i18n} />
                      </span>
                      <FallbackNote texts={[a.title_i18n]} />
                    </span>
                    <CaretRight aria-hidden="true" className="size-5 shrink-0 text-fg-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <ContactCard openCount={openCount} />
    </>
  );
}

export function ContactCard({ openCount = 0 }: { openCount?: number }) {
  const { t } = useTranslation();
  return (
    <Card as="section" aria-labelledby="help-contact" className="flex gap-4">
      <ChatsCircle aria-hidden="true" weight="duotone" className="size-8 shrink-0 text-brand" />
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="help-contact" className="m-0 text-h3">
            {t("help.contact.title")}
          </h2>
          <p className="m-0 text-fg-secondary">{t("help.contact.body")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={paths.newRequest} className={buttonClassName({})}>
            {t("help.contact.contact")}
          </Link>
          <Link to={paths.requests} className={buttonClassName({ variant: "secondary" })}>
            {t("help.contact.requests")}
            {openCount > 0 && (
              <span className="text-body-sm font-normal">
                ({t("help.contact.open", { count: openCount })})
              </span>
            )}
          </Link>
          {/* S10b: complaints about a visit, bill, prescription or document */}
          <Link to={paths.disputes} className={buttonClassName({ variant: "secondary" })}>
            {t("dashboard.nav.disputes")}
          </Link>
        </div>
      </div>
    </Card>
  );
}
