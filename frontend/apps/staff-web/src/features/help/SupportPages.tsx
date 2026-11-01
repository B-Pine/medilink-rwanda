import {
  HELP_CATEGORIES,
  pickText,
  STAFF_SUPPORT_TOPICS,
  SUPPORT_LIMITS,
  type HelpCategory,
  type SupportRequest,
  type SupportRequestRow,
  type SupportTopic,
} from "@medilink/api-client";
import { BookOpen, Eye, FileX, Tray } from "@phosphor-icons/react";
import {
  Alert,
  Button,
  buttonClassName,
  Card,
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
} from "@medilink/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { useStaffMe } from "../../auth/queries";
import { PageHeader } from "../../components/PageHeader";
import {
  ArticleText,
  errorText,
  FallbackNote,
  fieldErrors,
  helpKeys,
  isStatus,
  LocalText,
  StatusBadge,
  Thread,
  useCan,
  useLanguage,
  useWhen,
} from "./shared";

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Alert tone="danger" role="alert" title={errorText(error, t("help.loadFailed"))}>
      <Button variant="secondary" onClick={onRetry}>
        {t("help.retry")}
      </Button>
    </Alert>
  );
}

const TABS = ["guides", "mine", "facility"] as const;
type Tab = (typeof TABS)[number];

/** /support: Guides, My requests and (with `support.view_facility`) Facility requests (S10-F5). */
export function SupportPage() {
  const { t } = useTranslation();
  const canFacility = useCan("support.view_facility");
  const [params, setParams] = useSearchParams();
  const wanted = params.get("tab") as Tab | null;
  const tab: Tab =
    wanted && TABS.includes(wanted) && (wanted !== "facility" || canFacility) ? wanted : "guides";
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("help.support.title")}
        description={t("help.support.description")}
        actions={
          <Link to="/support/requests/new" className={buttonClassName({})}>
            {t("help.support.new")}
          </Link>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList aria-label={t("help.support.title")}>
          <TabsTrigger value="guides">{t("help.support.guides")}</TabsTrigger>
          <TabsTrigger value="mine">{t("help.support.mine")}</TabsTrigger>
          {canFacility && <TabsTrigger value="facility">{t("help.support.facility")}</TabsTrigger>}
        </TabsList>
        <TabsContent value="guides" className="pt-4">
          <Guides />
        </TabsContent>
        <TabsContent value="mine" className="pt-4">
          <Requests scope="mine" />
        </TabsContent>
        {canFacility && (
          <TabsContent value="facility" className="pt-4">
            <Requests scope="facility" />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function Guides() {
  const { t } = useTranslation();
  const api = useApi();
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<HelpCategory | "">("");
  const list = useQuery({
    queryKey: helpKeys.articles(q, category),
    queryFn: () => api.help.staff.articles({ q: q || undefined, category: category || undefined }),
  });
  const rows = list.data?.results ?? [];
  return (
    <div className="flex flex-col gap-4">
      <form
        role="search"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setQ(draft.trim().length >= 2 ? draft.trim() : "");
        }}
      >
        <TextField
          type="search"
          label={t("help.support.search")}
          value={draft}
          maxLength={100}
          onChange={(e) => setDraft(e.target.value)}
          className="min-w-0 flex-1"
        />
        <SelectField
          label={t("help.support.category")}
          value={category}
          onChange={(e) => setCategory(e.target.value as HelpCategory | "")}
        >
          <option value="">{t("help.categories.all")}</option>
          {HELP_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`help.categories.${c}`)}
            </option>
          ))}
        </SelectField>
        <Button type="submit" variant="secondary">
          {t("help.support.search")}
        </Button>
      </form>
      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <LoadError error={list.error} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState size="inline" icon={BookOpen} title={t("help.support.noGuides")} />
      ) : (
        <ul
          aria-label={t("help.support.guides")}
          className="m-0 grid list-none gap-3 p-0 md:grid-cols-2"
        >
          {rows.map((a) => (
            <li key={a.id}>
              <Link
                to={`/support/articles/${a.slug}`}
                className="flex h-full flex-col gap-1 rounded-lg bg-surface shadow-card p-4 text-fg no-underline hover:bg-subtle"
              >
                <span className="font-semibold">
                  <LocalText text={a.title_i18n} />
                </span>
                <span className="text-body-sm text-fg-secondary">
                  <LocalText text={a.summary_i18n} />
                </span>
                <FallbackNote text={a.title_i18n} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Requests({ scope }: { scope: "mine" | "facility" }) {
  const { t } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const list = useQuery({
    queryKey: helpKeys.requests(scope),
    queryFn: () => api.help.staff.requests({ scope }),
  });
  if (list.isPending) return <LoadingState />;
  if (list.isError) return <LoadError error={list.error} onRetry={() => void list.refetch()} />;
  const rows: SupportRequestRow[] = list.data.results;
  if (!rows.length)
    return (
      <EmptyState
        size="inline"
        icon={Tray}
        title={
          scope === "mine" ? t("help.support.noRequests") : t("help.support.noFacilityRequests")
        }
        description={scope === "mine" ? t("help.support.noRequestsBody") : undefined}
      />
    );
  return (
    <ul
      aria-label={scope === "mine" ? t("help.support.mine") : t("help.support.facility")}
      className="m-0 flex list-none flex-col gap-2 p-0"
    >
      {rows.map((r) => (
        <li key={r.id}>
          <Link
            to={`/support/requests/${r.id}`}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-surface shadow-card p-3 text-fg no-underline hover:bg-subtle"
          >
            <span className="font-mono text-body-sm text-fg-secondary">{r.reference}</span>
            <span className="min-w-0 flex-1 font-semibold">{r.subject}</span>
            <StatusBadge status={r.status} />
            <span className="w-full text-body-sm text-fg-muted">
              {scope === "facility" &&
                `${t("help.support.openedBy", { name: r.requester.full_name })} · `}
              {t("help.support.lastActivity", { time: when(r.last_message_at) })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** /support/articles/:slug: a staff guide. */
export function ArticlePage() {
  const { t } = useTranslation();
  const api = useApi();
  const lang = useLanguage();
  const { slug = "" } = useParams();
  const article = useQuery({
    queryKey: helpKeys.article(slug),
    queryFn: () => api.help.staff.article(slug),
    retry: (count, error) => !isStatus(error, 404) && count < 2,
  });
  const back = { to: "/support", label: t("help.article.back") };
  if (article.isPending) return <LoadingState />;
  if (article.isError)
    return isStatus(article.error, 404) ? (
      <div className="flex flex-col gap-5">
        <PageHeader title={t("help.notFound")} back={back} />
        <EmptyState
          icon={FileX}
          title={t("help.notFound")}
          description={t("help.article.notFoundBody")}
        />
      </div>
    ) : (
      <LoadError error={article.error} onRetry={() => void article.refetch()} />
    );
  const title = pickText(article.data.title_i18n, lang);
  const body = pickText(article.data.body_i18n, lang);
  return (
    <div className="flex max-w-[48rem] flex-col gap-5">
      <PageHeader title={title.text} back={back} />
      <FallbackNote text={article.data.body_i18n} />
      <Card as="article" aria-label={title.text}>
        <ArticleText body={body.text} lang={body.language ?? undefined} />
      </Card>
    </div>
  );
}

/** /support/requests/new: a question to MediLink support from the active facility (S10-F5). */
export function NewRequestPage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [topic, setTopic] = useState<SupportTopic>("technical");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const from = (location.state as { from?: string } | null)?.from ?? "/support";
  const send = useMutation({
    mutationFn: () =>
      api.help.staff.create({
        topic,
        subject: subject.trim(),
        body: body.trim(),
        client_path: /^\/[A-Za-z0-9/_-]*$/.test(from) ? from : "/support",
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: helpKeys.all });
      queryClient.setQueryData(helpKeys.request(created.id), created);
      void navigate(`/support/requests/${created.id}`, {
        replace: true,
        state: { notice: t("help.new.sent", { reference: created.reference }) },
      });
    },
  });
  const errors = fieldErrors(send.error);
  const summary = Object.entries(errors).map(([field, message]) => ({
    fieldId: `support-${field}`,
    message,
  }));
  const other =
    send.isError && !summary.length ? errorText(send.error, t("help.loadFailed")) : null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    send.mutate();
  };
  return (
    <div className="flex max-w-[44rem] flex-col gap-5">
      <PageHeader
        title={t("help.new.title")}
        back={{ to: "/support", label: t("help.article.back") }}
      />
      <Alert tone="info">
        <p className="m-0 flex items-center gap-2">
          <Eye aria-hidden="true" />
          {t("help.new.adminNotice")}
        </p>
        <p className="m-0">{t("help.new.noHealth")}</p>
      </Alert>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {summary.length > 0 && (
          <ErrorSummary
            items={summary}
            focusKey={send.failureCount}
            title={t("help.new.fixErrors")}
          />
        )}
        {other && (
          <Alert tone="danger" role="alert">
            {other}
          </Alert>
        )}
        <SelectField
          id="support-topic"
          label={t("help.new.topic")}
          value={topic}
          error={errors.topic}
          onChange={(e) => setTopic(e.target.value as SupportTopic)}
        >
          {STAFF_SUPPORT_TOPICS.map((c) => (
            <option key={c} value={c}>
              {t(`help.topics.${c}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          id="support-subject"
          label={t("help.new.subject")}
          value={subject}
          maxLength={SUPPORT_LIMITS.subject.max}
          required
          error={errors.subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <TextareaField
          id="support-body"
          label={t("help.new.body")}
          hint={t("help.new.counter", { count: body.length, max: SUPPORT_LIMITS.body.max })}
          value={body}
          rows={6}
          maxLength={SUPPORT_LIMITS.body.max}
          required
          error={errors.body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button
          type="submit"
          loading={send.isPending}
          disabled={
            subject.trim().length < SUPPORT_LIMITS.subject.min ||
            body.trim().length < SUPPORT_LIMITS.body.min
          }
          className="self-start"
        >
          {t("help.new.send")}
        </Button>
      </form>
    </div>
  );
}

/** /support/requests/:id: own request (reply, close) or a colleague's, read-only (S10-F5). */
export function RequestPage() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { data: me } = useStaffMe();
  const { id = "" } = useParams();
  const [reply, setReply] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(
    () => (location.state as { notice?: string } | null)?.notice ?? null,
  );
  const request = useQuery({
    queryKey: helpKeys.request(id),
    queryFn: () => api.help.staff.get(id),
    retry: (count, error) => !isStatus(error, 404) && count < 2,
  });
  const update = (next: SupportRequest, message: string) => {
    queryClient.setQueryData(helpKeys.request(id), next);
    void queryClient.invalidateQueries({ queryKey: ["help", "requests"] });
    setNotice(message);
  };
  const send = useMutation({
    mutationFn: () => api.help.staff.reply(id, reply.trim()),
    onSuccess: (next) => {
      setReply("");
      update(next, t("help.thread.replySent"));
    },
  });
  const close = useMutation({
    mutationFn: () => api.help.staff.close(id),
    onSuccess: (next) => {
      setConfirming(false);
      update(next, t("help.thread.closedNotice"));
    },
  });
  const back = { to: "/support?tab=mine", label: t("help.support.mine") };
  if (request.isPending) return <LoadingState />;
  if (request.isError)
    return isStatus(request.error, 404) ? (
      <div className="flex flex-col gap-5">
        <PageHeader title={t("help.notFound")} back={back} />
        <EmptyState icon={Tray} title={t("help.notFound")} />
      </div>
    ) : (
      <LoadError error={request.error} onRetry={() => void request.refetch()} />
    );
  const r = request.data;
  const own = r.requester.id === me?.id;
  const label = t("help.thread.title", { reference: r.reference });
  const replyError =
    fieldErrors(send.error).body ??
    (send.isError ? errorText(send.error, t("help.loadFailed")) : undefined);
  return (
    <div className="flex max-w-[48rem] flex-col gap-5">
      <PageHeader
        title={r.subject}
        back={own ? back : { to: "/support?tab=facility", label: t("help.support.facility") }}
        badges={
          <>
            <span className="font-mono text-body-sm text-fg-secondary">{r.reference}</span>
            <StatusBadge status={r.status} />
          </>
        }
        description={t(`help.topics.${r.topic}`)}
      />
      {!own && (
        <Alert tone="info">{t("help.thread.readOnly", { name: r.requester.full_name })}</Alert>
      )}
      <p role="status" aria-live="polite" className="m-0 text-body-sm text-success">
        {notice ?? ""}
      </p>
      <Thread
        messages={r.messages}
        label={label}
        youId={own ? "requester" : undefined}
        supportSide="start"
      />
      {r.status === "closed" ? (
        <Alert tone="success" title={t("help.thread.closedTitle")}>
          {own && (
            <Link to="/support/requests/new" className={buttonClassName({})}>
              {t("help.thread.openNew")}
            </Link>
          )}
        </Alert>
      ) : (
        own && (
          <Card className="flex flex-col gap-3">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                send.mutate();
              }}
              className="flex flex-col gap-3"
            >
              <TextareaField
                label={t("help.thread.reply")}
                hint={t("help.new.noHealth")}
                value={reply}
                rows={4}
                maxLength={SUPPORT_LIMITS.reply.max}
                error={replyError}
                onChange={(e) => setReply(e.target.value)}
              />
              <Button
                type="submit"
                loading={send.isPending}
                disabled={!reply.trim()}
                className="self-start"
              >
                {t("help.thread.send")}
              </Button>
            </form>
            {confirming ? (
              <div
                role="group"
                aria-label={t("help.thread.close")}
                className="flex flex-col gap-2 rounded-md border border-border p-3"
              >
                <p className="m-0">{t("help.thread.closeConfirm")}</p>
                {close.isError && (
                  <Alert tone="danger" role="alert">
                    {errorText(close.error, t("help.loadFailed"))}
                  </Alert>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="danger" loading={close.isPending} onClick={() => close.mutate()}>
                    {t("help.thread.closeYes")}
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirming(false)}>
                    {t("help.thread.cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setConfirming(true)} className="self-start">
                {t("help.thread.close")}
              </Button>
            )}
          </Card>
        )
      )}
    </div>
  );
}
