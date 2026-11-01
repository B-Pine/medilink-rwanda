import {
  HELP_CATEGORIES,
  HELP_LIMITS,
  LANGUAGES,
  pickText,
  type HelpArticleWrite,
  type HelpAudience,
  type HelpCategory,
  type LanguageCode,
  type PlatformHelpArticle,
  type PlatformHelpArticleSummary,
} from "@medilink/api-client";
import { FileX } from "@phosphor-icons/react";
import {
  Alert,
  Badge,
  Button,
  buttonClassName,
  Card,
  DataTable,
  EmptyState,
  ErrorSummary,
  LoadingState,
  SelectField,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextareaField,
  TextField,
  type ColumnDef,
} from "@medilink/ui";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { useStepUp } from "../lock";
import { PlatformOnly, useTableLabels } from "../platform/shared";
import { ArticleText, errorText, fieldErrors, helpKeys, isStatus, useLanguage } from "./shared";

/** /platform/help-articles: every article with audience, topic, state and missing languages. */
export function PlatformArticlesPage() {
  return (
    <PlatformOnly>
      <Articles />
    </PlatformOnly>
  );
}

function Articles() {
  const { t } = useTranslation();
  const api = useApi();
  const lang = useLanguage();
  const [params, setParams] = useSearchParams();
  const filters = {
    audience: params.get("audience") ?? "",
    status: params.get("status") ?? "",
    q: params.get("q") ?? "",
    page: params.get("page") ?? "1",
  };
  const update = (changes: Partial<typeof filters>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in changes)) next.delete("page");
    setParams(next, { replace: true });
  };
  const list = useQuery({
    queryKey: helpKeys.platformArticles(filters),
    queryFn: () =>
      api.help.platform.articles({
        audience: (filters.audience || undefined) as HelpAudience | undefined,
        status: (filters.status || undefined) as "draft" | "published" | undefined,
        q: filters.q || undefined,
        page: Number(filters.page),
      }),
    placeholderData: keepPreviousData,
  });
  const labels = useTableLabels(t("help.articles.noun"));
  const columns = useMemo<ColumnDef<PlatformHelpArticleSummary, unknown>[]>(
    () => [
      {
        id: "title",
        header: t("help.articles.titleCol"),
        enableSorting: false,
        cell: ({ row }) => {
          const title = pickText(row.original.title_i18n, lang).text || row.original.slug;
          return (
            <Link
              to={`/platform/help-articles/${row.original.id}`}
              aria-label={t("help.articles.edit", { title })}
            >
              {title}
            </Link>
          );
        },
      },
      {
        accessorKey: "slug",
        header: t("help.articles.slug"),
        enableSorting: false,
        cell: ({ row }) => <span className="font-mono text-body-sm">{row.original.slug}</span>,
      },
      {
        id: "audience",
        header: t("help.articles.audience"),
        enableSorting: false,
        cell: ({ row }) => t(`help.audience.${row.original.audience}`),
      },
      {
        id: "category",
        header: t("help.articles.category"),
        enableSorting: false,
        cell: ({ row }) => t(`help.categories.${row.original.category}`),
      },
      {
        id: "status",
        header: t("help.articles.status"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.status === "published" ? (
            <Badge tone="success">{t("help.articles.published")}</Badge>
          ) : (
            <Badge tone="neutral">{t("help.articles.draft")}</Badge>
          ),
      },
      {
        id: "missing",
        header: t("help.articles.missing"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.missing_languages.length ? (
            <Badge tone="warning">
              {row.original.missing_languages.map((l) => t(`help.languages.${l}`)).join(", ")}
            </Badge>
          ) : (
            t("help.articles.complete")
          ),
      },
    ],
    [t, lang],
  );
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("help.articles.title")}
        actions={
          <Link to="/platform/help-articles/new" className={buttonClassName({})}>
            {t("help.articles.new")}
          </Link>
        }
      />
      {list.isError ? (
        <Alert tone="danger" role="alert" title={errorText(list.error, t("help.loadFailed"))}>
          <Button variant="secondary" onClick={() => void list.refetch()}>
            {t("help.retry")}
          </Button>
        </Alert>
      ) : (
        <DataTable<PlatformHelpArticleSummary>
          caption={t("help.articles.title")}
          columns={columns}
          data={list.data?.results ?? []}
          getRowId={(r) => r.id}
          labels={labels}
          total={list.data?.count ?? 0}
          page={Number(filters.page)}
          pageSize={25}
          onPageChange={(p) => update({ page: String(p) })}
          search={filters.q}
          onSearchChange={(value) => update({ q: value })}
          filters={[]}
          onClearFilters={() => update({ audience: "", status: "", q: "" })}
          toolbar={
            <div className="flex flex-wrap gap-3">
              <SelectField
                label={t("help.articles.audience")}
                value={filters.audience}
                onChange={(e) => update({ audience: e.target.value })}
              >
                <option value="">{t("help.articles.allAudiences")}</option>
                <option value="patient">{t("help.audience.patient")}</option>
                <option value="staff">{t("help.audience.staff")}</option>
              </SelectField>
              <SelectField
                label={t("help.articles.status")}
                value={filters.status}
                onChange={(e) => update({ status: e.target.value })}
              >
                <option value="">{t("help.articles.allStatuses")}</option>
                <option value="draft">{t("help.articles.draft")}</option>
                <option value="published">{t("help.articles.published")}</option>
              </SelectField>
            </div>
          }
        />
      )}
    </div>
  );
}

/** /platform/help-articles/new and /:id: rw/en/fr editor with preview and publishing (S10-F7). */
export function PlatformArticlePage() {
  return (
    <PlatformOnly>
      <EditorRoute />
    </PlatformOnly>
  );
}

function EditorRoute() {
  const { t } = useTranslation();
  const api = useApi();
  const { id } = useParams();
  const article = useQuery({
    queryKey: helpKeys.platformArticle(id ?? "new"),
    queryFn: () => api.help.platform.article(id!),
    enabled: Boolean(id),
    retry: (count, error) => !isStatus(error, 404) && count < 2,
  });
  // Lives here: the editor remounts with each saved version and would lose it.
  const [notice, setNotice] = useState<string | null>(null);
  const back = { to: "/platform/help-articles", label: t("help.articles.title") };
  if (!id) return <Editor row={null} notice={notice} setNotice={setNotice} />;
  if (article.isPending) return <LoadingState />;
  if (article.isError)
    return isStatus(article.error, 404) ? (
      <div className="flex flex-col gap-5">
        <PageHeader title={t("help.notFound")} back={back} />
        <EmptyState icon={FileX} title={t("help.notFound")} />
      </div>
    ) : (
      <Alert tone="danger" role="alert" title={errorText(article.error, t("help.loadFailed"))}>
        <Button variant="secondary" onClick={() => void article.refetch()}>
          {t("help.retry")}
        </Button>
      </Alert>
    );
  return (
    <Editor
      key={`${article.data.id}:${article.data.version}`}
      row={article.data}
      notice={notice}
      setNotice={setNotice}
    />
  );
}

type TextKind = "title_i18n" | "summary_i18n" | "body_i18n";
interface Draft {
  slug: string;
  audience: HelpAudience;
  category: HelpCategory;
  sort_order: number;
  title_i18n: Record<LanguageCode, string>;
  summary_i18n: Record<LanguageCode, string>;
  body_i18n: Record<LanguageCode, string>;
}

const empty = (): Record<LanguageCode, string> => ({ rw: "", en: "", fr: "" });
const fromRow = (row: PlatformHelpArticle | null): Draft => ({
  slug: row?.slug ?? "",
  audience: row?.audience ?? "patient",
  category: row?.category ?? "getting_started",
  sort_order: row?.sort_order ?? 100,
  title_i18n: { ...empty(), ...row?.title_i18n },
  summary_i18n: { ...empty(), ...row?.summary_i18n },
  body_i18n: { ...empty(), ...row?.body_i18n },
});
const toWrite = (d: Draft): HelpArticleWrite => {
  const clean = (v: Record<LanguageCode, string>) =>
    Object.fromEntries(Object.entries(v).filter(([, text]) => text.trim()));
  return {
    slug: d.slug.trim(),
    audience: d.audience,
    category: d.category,
    sort_order: d.sort_order,
    title_i18n: clean(d.title_i18n),
    summary_i18n: clean(d.summary_i18n),
    body_i18n: clean(d.body_i18n),
  };
};
const LIMIT: Record<TextKind, number> = {
  title_i18n: HELP_LIMITS.title,
  summary_i18n: HELP_LIMITS.summary,
  body_i18n: HELP_LIMITS.body,
};

function Editor({
  row,
  notice,
  setNotice,
}: {
  row: PlatformHelpArticle | null;
  notice: string | null;
  setNotice: (notice: string | null) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const [draft, setDraft] = useState<Draft>(() => fromRow(row));
  const [tab, setTab] = useState<LanguageCode>("rw");
  const missing = LANGUAGES.filter(
    (l) =>
      !draft.title_i18n[l].trim() || !draft.summary_i18n[l].trim() || !draft.body_i18n[l].trim(),
  );
  const settle = (next: PlatformHelpArticle, message: string) => {
    queryClient.setQueryData(helpKeys.platformArticle(next.id), next);
    void queryClient.invalidateQueries({ queryKey: ["help", "platform", "articles"] });
    if (!row) {
      void navigate(`/platform/help-articles/${next.id}`, { replace: true });
      return;
    }
    setNotice(message);
  };
  const onConflict = (error: unknown) => {
    if (isStatus(error, 409) && row) {
      setNotice(t("help.editor.stale"));
      void queryClient.invalidateQueries({ queryKey: helpKeys.platformArticle(row.id) });
    }
  };
  const save = useMutation({
    mutationFn: () =>
      row
        ? api.help.platform.updateArticle(row.id, { ...toWrite(draft), version: row.version })
        : api.help.platform.createArticle(toWrite(draft)),
    onSuccess: (next) => settle(next, t("help.editor.saved")),
    onError: onConflict,
  });
  const publish = useMutation({
    mutationFn: async () => {
      // Save edits first so what is published is what the editor shows.
      const saved = await api.help.platform.updateArticle(row!.id, {
        ...toWrite(draft),
        version: row!.version,
      });
      return withStepUp(() => api.help.platform.publish(saved.id));
    },
    onSuccess: (next) => settle(next, t("help.editor.published")),
    onError: onConflict,
  });
  const unpublish = useMutation({
    mutationFn: () => api.help.platform.unpublish(row!.id),
    onSuccess: (next) => settle(next, t("help.editor.unpublished")),
    onError: onConflict,
  });
  const failed = save.error ?? publish.error ?? unpublish.error;
  const errors = fieldErrors(save.error);
  const summary = Object.entries(errors).map(([field, message]) => ({
    fieldId: `article-${field.replace(/_i18n.*/, "")}`,
    message,
  }));
  const busy = save.isPending || publish.isPending || unpublish.isPending;
  const setText = (kind: TextKind, value: string) =>
    setDraft((d) => ({ ...d, [kind]: { ...d[kind], [tab]: value } }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    save.mutate();
  };
  const published = row?.status === "published";
  const langName = (l: LanguageCode) => t(`help.languages.${l}`);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={row ? t("help.editor.editTitle") : t("help.editor.newTitle")}
        back={{ to: "/platform/help-articles", label: t("help.articles.title") }}
        badges={
          row &&
          (published ? (
            <Badge tone="success">{t("help.editor.statusPublished")}</Badge>
          ) : (
            <Badge tone="neutral">{t("help.editor.statusDraft")}</Badge>
          ))
        }
      />
      <p role="status" aria-live="polite" className="m-0 text-body-sm">
        {notice ?? ""}
      </p>
      <form onSubmit={submit} noValidate className="grid gap-5 lg:grid-cols-[1fr_24rem]">
        <div className="flex flex-col gap-4">
          {summary.length > 0 && (
            <ErrorSummary
              items={summary}
              focusKey={save.failureCount}
              title={t("help.editor.fixErrors")}
            />
          )}
          {Boolean(failed) && !summary.length && !isStatus(failed, 409) && (
            <Alert tone="danger" role="alert">
              {errorText(failed, t("help.loadFailed"))}
            </Alert>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              id="article-slug"
              label={t("help.editor.slug")}
              hint={t("help.editor.slugHint")}
              value={draft.slug}
              maxLength={80}
              error={errors.slug}
              onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value.toLowerCase() }))}
            />
            <TextField
              id="article-sort_order"
              type="number"
              min={0}
              max={999}
              label={t("help.editor.sortOrder")}
              value={String(draft.sort_order)}
              error={errors.sort_order}
              onChange={(e) => setDraft((d) => ({ ...d, sort_order: Number(e.target.value) || 0 }))}
            />
            <SelectField
              id="article-audience"
              label={t("help.editor.audience")}
              value={draft.audience}
              error={errors.audience}
              onChange={(e) =>
                setDraft((d) => ({ ...d, audience: e.target.value as HelpAudience }))
              }
            >
              <option value="patient">{t("help.audience.patient")}</option>
              <option value="staff">{t("help.audience.staff")}</option>
            </SelectField>
            <SelectField
              id="article-category"
              label={t("help.editor.category")}
              value={draft.category}
              error={errors.category}
              onChange={(e) =>
                setDraft((d) => ({ ...d, category: e.target.value as HelpCategory }))
              }
            >
              {HELP_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`help.categories.${c}`)}
                </option>
              ))}
            </SelectField>
          </div>
          {missing.length > 0 && (
            <Alert tone="warning">
              {t("help.editor.missing", { languages: missing.map(langName).join(", ") })}
            </Alert>
          )}
          <Tabs value={tab} onValueChange={(v) => setTab(v as LanguageCode)}>
            <TabsList aria-label={t("help.editor.languages")}>
              {LANGUAGES.map((l) => (
                <TabsTrigger key={l} value={l}>
                  {langName(l)}
                  {missing.includes(l) && <span aria-hidden="true"> •</span>}
                </TabsTrigger>
              ))}
            </TabsList>
            {LANGUAGES.map((l) => (
              <TabsContent key={l} value={l} className="flex flex-col gap-4 pt-4">
                {(["title_i18n", "summary_i18n", "body_i18n"] as const).map((kind) => {
                  const Field = kind === "title_i18n" ? TextField : TextareaField;
                  const label =
                    kind === "title_i18n"
                      ? t("help.editor.fieldTitle", { language: langName(l) })
                      : kind === "summary_i18n"
                        ? t("help.editor.fieldSummary", { language: langName(l) })
                        : t("help.editor.fieldBody", { language: langName(l) });
                  const counter = t("help.editor.counter", {
                    count: draft[kind][l].length,
                    max: LIMIT[kind],
                  });
                  return (
                    <Field
                      key={kind}
                      id={l === "rw" ? `article-${kind.replace("_i18n", "")}` : undefined}
                      lang={l}
                      label={label}
                      hint={
                        kind === "body_i18n" ? (
                          <>
                            <span>{t("help.editor.bodyHint")}</span> <span>{counter}</span>
                          </>
                        ) : (
                          counter
                        )
                      }
                      value={draft[kind][l]}
                      maxLength={LIMIT[kind]}
                      {...(kind === "body_i18n"
                        ? { rows: 10 }
                        : kind === "summary_i18n"
                          ? { rows: 2 }
                          : {})}
                      error={errors[kind]}
                      onChange={(e: { target: { value: string } }) => setText(kind, e.target.value)}
                    />
                  );
                })}
              </TabsContent>
            ))}
          </Tabs>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={save.isPending} disabled={busy && !save.isPending}>
              {t("help.editor.save")}
            </Button>
            {row && !published && (
              <Button
                type="button"
                variant="secondary"
                loading={publish.isPending}
                disabled={busy || missing.length > 0}
                onClick={() => {
                  setNotice(null);
                  publish.mutate();
                }}
              >
                {t("help.editor.publish")}
              </Button>
            )}
            {row && published && (
              <Button
                type="button"
                variant="secondary"
                loading={unpublish.isPending}
                disabled={busy}
                onClick={() => {
                  setNotice(null);
                  unpublish.mutate();
                }}
              >
                {t("help.editor.unpublish")}
              </Button>
            )}
          </div>
        </div>
        <Card
          as="section"
          aria-labelledby="article-preview"
          className="flex flex-col gap-3 self-start"
        >
          <h2 id="article-preview" className="m-0 text-h3">
            {t("help.editor.preview", { language: langName(tab) })}
          </h2>
          <div lang={tab} className="flex flex-col gap-2">
            <p className="m-0 text-h3 font-semibold">{draft.title_i18n[tab]}</p>
            <p className="m-0 text-fg-secondary">{draft.summary_i18n[tab]}</p>
            <ArticleText body={draft.body_i18n[tab]} />
          </div>
        </Card>
      </form>
    </div>
  );
}
