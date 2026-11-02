import {
  SUPPORT_CLOSE_REASONS,
  SUPPORT_LIMITS,
  SUPPORT_TOPICS,
  type HelpAudience,
  type PlatformSupportRequest,
  type PlatformSupportRequestRow,
  type SupportPriority,
  type SupportTopic,
} from "@medilink/api-client";
import { Tray } from "@phosphor-icons/react";
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  LoadingState,
  SelectField,
  TextareaField,
  type ColumnDef,
} from "@medilink/ui";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { useStaffMe } from "../../auth/queries";
import { PageHeader } from "../../components/PageHeader";
import { PlatformOnly, useTableLabels } from "../platform/shared";
import { errorText, fieldErrors, helpKeys, isStatus, StatusBadge, Thread, useWhen } from "./shared";

const STATUS_TABS = ["active", "open", "answered", "closed"] as const;

/** /platform/support: the support queue, high priority first, then oldest activity (S10-F6). */
export function PlatformSupportPage() {
  return (
    <PlatformOnly>
      <Queue />
    </PlatformOnly>
  );
}

function Queue() {
  const { t } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const [params, setParams] = useSearchParams();
  const filters = {
    status: params.get("status") ?? "active",
    topic: params.get("topic") ?? "",
    audience: params.get("audience") ?? "",
    assigned: params.get("assigned") ?? "",
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
    queryKey: helpKeys.queue(filters),
    queryFn: () =>
      api.help.platform.requests({
        status: filters.status as (typeof STATUS_TABS)[number],
        topic: (filters.topic || undefined) as SupportTopic | undefined,
        audience: (filters.audience || undefined) as HelpAudience | undefined,
        assigned: (filters.assigned || undefined) as "me" | "none" | undefined,
        q: filters.q || undefined,
        page: Number(filters.page),
      }),
    placeholderData: keepPreviousData,
  });
  const labels = useTableLabels(t("help.queue.noun"));
  const columns = useMemo<ColumnDef<PlatformSupportRequestRow, unknown>[]>(
    () => [
      {
        accessorKey: "reference",
        header: t("help.queue.reference"),
        enableSorting: false,
        cell: ({ row }) => (
          <Link
            to={`/platform/support/${row.original.id}`}
            aria-label={t("help.queue.open", { reference: row.original.reference })}
            className="font-mono"
          >
            {row.original.reference}
          </Link>
        ),
      },
      { accessorKey: "subject", header: t("help.queue.subject"), enableSorting: false },
      {
        id: "requester",
        header: t("help.queue.requester"),
        enableSorting: false,
        cell: ({ row }) => t(`help.audience.${row.original.requester_audience}`),
      },
      {
        id: "facility",
        header: t("help.queue.facility"),
        enableSorting: false,
        cell: ({ row }) => row.original.facility?.name ?? "—",
      },
      {
        id: "topic",
        header: t("help.queue.topic"),
        enableSorting: false,
        cell: ({ row }) => t(`help.topics.${row.original.topic}`),
      },
      {
        id: "priority",
        header: t("help.queue.priority"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.priority === "high" ? (
            <Badge tone="warning">{t("help.priority.high")}</Badge>
          ) : (
            t("help.priority.normal")
          ),
      },
      {
        id: "status",
        header: t("help.queue.status"),
        enableSorting: false,
        cell: ({ row }) => <StatusBadge status={row.original.status} platform />,
      },
      {
        id: "assignee",
        header: t("help.queue.assignee"),
        enableSorting: false,
        cell: ({ row }) => row.original.assigned_to?.full_name ?? t("help.queue.unassigned"),
      },
      {
        id: "last",
        header: t("help.queue.lastActivity"),
        enableSorting: false,
        cell: ({ row }) => when(row.original.last_message_at),
      },
    ],
    [t, when],
  );
  const chips = [
    ...(filters.topic
      ? [
          {
            id: "topic",
            label: t(`help.topics.${filters.topic}`),
            onRemove: () => update({ topic: "" }),
          },
        ]
      : []),
    ...(filters.audience
      ? [
          {
            id: "audience",
            label: t(`help.audience.${filters.audience}`),
            onRemove: () => update({ audience: "" }),
          },
        ]
      : []),
    ...(filters.assigned
      ? [
          {
            id: "assigned",
            label: filters.assigned === "me" ? t("help.queue.me") : t("help.queue.none"),
            onRemove: () => update({ assigned: "" }),
          },
        ]
      : []),
  ];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("help.queue.title")} />
      <div role="group" aria-label={t("help.queue.statusTabs")} className="flex flex-wrap gap-2">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={filters.status === s}
            onClick={() => update({ status: s })}
            className="inline-flex min-h-target cursor-pointer items-center rounded-full border border-border-input bg-surface px-4 text-body-sm font-semibold text-fg hover:bg-subtle aria-pressed:border-primary aria-pressed:bg-brand-subtle aria-pressed:text-on-brand-subtle"
          >
            {t(`help.queue.tabs.${s}`)}
          </button>
        ))}
      </div>
      {list.isError ? (
        <Alert tone="danger" role="alert" title={errorText(list.error, t("help.loadFailed"))}>
          <Button variant="secondary" onClick={() => void list.refetch()}>
            {t("help.retry")}
          </Button>
        </Alert>
      ) : (
        <DataTable<PlatformSupportRequestRow>
          caption={t("help.queue.title")}
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
          filters={chips}
          onClearFilters={() => update({ topic: "", audience: "", assigned: "", q: "" })}
          toolbar={
            <div className="flex flex-wrap gap-3">
              <SelectField
                label={t("help.queue.topic")}
                value={filters.topic}
                onChange={(e) => update({ topic: e.target.value })}
              >
                <option value="">{t("help.queue.allTopics")}</option>
                {SUPPORT_TOPICS.map((c) => (
                  <option key={c} value={c}>
                    {t(`help.topics.${c}`)}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label={t("help.queue.audienceFilter")}
                value={filters.audience}
                onChange={(e) => update({ audience: e.target.value })}
              >
                <option value="">{t("help.queue.allAudiences")}</option>
                <option value="patient">{t("help.audience.patient")}</option>
                <option value="staff">{t("help.audience.staff")}</option>
              </SelectField>
              <SelectField
                label={t("help.queue.assigned")}
                value={filters.assigned}
                onChange={(e) => update({ assigned: e.target.value })}
              >
                <option value="">{t("help.queue.anyone")}</option>
                <option value="me">{t("help.queue.me")}</option>
                <option value="none">{t("help.queue.none")}</option>
              </SelectField>
            </div>
          }
        />
      )}
    </div>
  );
}

/** /platform/support/:id: details, triage, thread, reply and close (S10-F6). */
export function PlatformRequestPage() {
  return (
    <PlatformOnly>
      <Request />
    </PlatformOnly>
  );
}

function Request() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { id = "" } = useParams();
  const request = useQuery({
    queryKey: helpKeys.platformRequest(id),
    queryFn: () => api.help.platform.request(id),
    retry: (count, error) => !isStatus(error, 404) && count < 2,
  });
  // Lives here: the triage panel remounts with each new version and would lose it.
  const [triageNotice, setTriageNotice] = useState<string | null>(null);
  const back = { to: "/platform/support", label: t("help.queue.title") };
  if (request.isPending) return <LoadingState />;
  if (request.isError)
    return isStatus(request.error, 404) ? (
      <div className="flex flex-col gap-5">
        <PageHeader title={t("help.notFound")} back={back} />
        <EmptyState icon={Tray} title={t("help.notFound")} />
      </div>
    ) : (
      <Alert tone="danger" role="alert" title={errorText(request.error, t("help.loadFailed"))}>
        <Button variant="secondary" onClick={() => void request.refetch()}>
          {t("help.retry")}
        </Button>
      </Alert>
    );
  const r = request.data;
  const store = (next: PlatformSupportRequest) => {
    queryClient.setQueryData(helpKeys.platformRequest(id), next);
    void queryClient.invalidateQueries({ queryKey: ["help", "queue"] });
  };
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={r.subject}
        back={back}
        badges={
          <>
            <span className="font-mono text-body-sm text-fg-secondary">{r.reference}</span>
            <StatusBadge status={r.status} platform />
            {r.priority === "high" && <Badge tone="warning">{t("help.priority.high")}</Badge>}
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-4">
          <Thread
            messages={r.messages}
            label={t("help.thread.title", { reference: r.reference })}
            supportSide="end"
          />
          <ReplyAndClose request={r} onChange={store} />
        </div>
        <Triage
          key={r.version}
          request={r}
          onChange={store}
          notice={triageNotice}
          setNotice={setTriageNotice}
        />
      </div>
    </div>
  );
}

function Triage({
  request: r,
  onChange,
  notice,
  setNotice,
}: {
  request: PlatformSupportRequest;
  onChange: (next: PlatformSupportRequest) => void;
  notice: string | null;
  setNotice: (notice: string | null) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { data: me } = useStaffMe();
  const [priority, setPriority] = useState<SupportPriority>(r.priority);
  const [topic, setTopic] = useState<SupportTopic>(r.topic);
  const save = useMutation({
    mutationFn: (assignee?: string | null) =>
      api.help.platform.triage(r.id, {
        version: r.version,
        priority,
        topic,
        ...(assignee !== undefined ? { assigned_to_id: assignee } : {}),
      }),
    onSuccess: (next) => {
      onChange(next);
      setNotice(t("help.triage.saved"));
    },
    onError: (error) => {
      if (isStatus(error, 409)) {
        setNotice(t("help.triage.stale"));
        void queryClient.invalidateQueries({ queryKey: helpKeys.platformRequest(r.id) });
      }
    },
  });
  const closed = r.status === "closed";
  const mine = r.assigned_to?.id === me?.id;
  const rows: [string, string][] = [
    [t("help.triage.requester"), r.requester.full_name],
    [t("help.triage.audience"), t(`help.audience.${r.requester_audience}`)],
    [t("help.triage.facility"), r.facility?.name ?? "—"],
    [t("help.triage.language"), t(`help.languages.${r.language}`)],
    [t("help.triage.device"), r.client_label || "—"],
    [t("help.triage.path"), r.client_path || "—"],
    [t("help.triage.assignee"), r.assigned_to?.full_name ?? t("help.queue.unassigned")],
  ];
  return (
    <Card as="section" aria-labelledby="triage" className="flex flex-col gap-4 self-start">
      <h2 id="triage" className="m-0 text-h3">
        {t("help.triage.title")}
      </h2>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-fg-secondary">{k}</dt>
            <dd className="m-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {!closed && (
        <>
          <SelectField
            label={t("help.triage.priority")}
            value={priority}
            onChange={(e) => setPriority(e.target.value as SupportPriority)}
          >
            <option value="normal">{t("help.priority.normal")}</option>
            <option value="high">{t("help.priority.high")}</option>
          </SelectField>
          <SelectField
            label={t("help.triage.topic")}
            value={topic}
            onChange={(e) => setTopic(e.target.value as SupportTopic)}
          >
            {SUPPORT_TOPICS.map((c) => (
              <option key={c} value={c}>
                {t(`help.topics.${c}`)}
              </option>
            ))}
          </SelectField>
          <div className="flex flex-wrap gap-2">
            <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>
              {t("help.triage.save")}
            </Button>
            <Button
              variant="secondary"
              disabled={save.isPending}
              onClick={() => save.mutate(mine ? null : (me?.id ?? null))}
            >
              {mine ? t("help.triage.unassign") : t("help.triage.assignMe")}
            </Button>
          </div>
        </>
      )}
      <p role="status" aria-live="polite" className="m-0 text-body-sm">
        {notice ?? ""}
      </p>
      {save.isError && !isStatus(save.error, 409) && (
        <Alert tone="danger" role="alert">
          {fieldErrors(save.error).assigned_to_id ?? errorText(save.error, t("help.loadFailed"))}
        </Alert>
      )}
    </Card>
  );
}

function ReplyAndClose({
  request: r,
  onChange,
}: {
  request: PlatformSupportRequest;
  onChange: (next: PlatformSupportRequest) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const [reply, setReply] = useState("");
  const [reason, setReason] = useState<(typeof SUPPORT_CLOSE_REASONS)[number]>("resolved");
  const [closing, setClosing] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: () => api.help.platform.reply(r.id, reply.trim()),
    onSuccess: (next) => {
      setReply("");
      onChange(next);
      setNotice(t("help.thread.replySent"));
    },
  });
  const close = useMutation({
    mutationFn: () => api.help.platform.close(r.id, reason, closing.trim()),
    onSuccess: (next) => {
      onChange(next);
      setNotice(t("help.reply.closed"));
    },
  });
  if (r.status === "closed")
    return (
      <Alert tone="success" title={t("help.thread.closedTitle")}>
        {r.close_reason && t(`help.closeReasons.${r.close_reason}`)}
        {r.closed_by && ` · ${r.closed_by.full_name}`}
      </Alert>
    );
  return (
    <>
      <p role="status" aria-live="polite" className="m-0 text-body-sm text-success">
        {notice ?? ""}
      </p>
      <Card className="flex flex-col gap-3">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send.mutate();
          }}
          className="flex flex-col gap-3"
        >
          <TextareaField
            label={t("help.reply.label")}
            value={reply}
            rows={4}
            maxLength={SUPPORT_LIMITS.reply.max}
            error={
              fieldErrors(send.error).body ??
              (send.isError ? errorText(send.error, t("help.loadFailed")) : undefined)
            }
            onChange={(e) => setReply(e.target.value)}
          />
          <Button
            type="submit"
            loading={send.isPending}
            disabled={!reply.trim()}
            className="self-start"
          >
            {t("help.reply.send")}
          </Button>
        </form>
      </Card>
      <Card as="section" aria-labelledby="close-request" className="flex flex-col gap-3">
        <h2 id="close-request" className="m-0 text-h3">
          {t("help.reply.closeTitle")}
        </h2>
        <SelectField
          label={t("help.reply.reason")}
          value={reason}
          onChange={(e) => setReason(e.target.value as (typeof SUPPORT_CLOSE_REASONS)[number])}
        >
          {SUPPORT_CLOSE_REASONS.map((c) => (
            <option key={c} value={c}>
              {t(`help.closeReasons.${c}`)}
            </option>
          ))}
        </SelectField>
        <TextareaField
          label={t("help.reply.closingMessage")}
          value={closing}
          rows={2}
          maxLength={SUPPORT_LIMITS.reply.max}
          onChange={(e) => setClosing(e.target.value)}
        />
        {close.isError && (
          <Alert tone="danger" role="alert">
            {errorText(close.error, t("help.loadFailed"))}
          </Alert>
        )}
        <Button
          variant="danger"
          loading={close.isPending}
          onClick={() => close.mutate()}
          className="self-start"
        >
          {t("help.reply.close")}
        </Button>
      </Card>
    </>
  );
}
