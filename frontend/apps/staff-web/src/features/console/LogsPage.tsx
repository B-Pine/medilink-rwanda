import type { ConsoleEvent, LogParams } from "@medilink/api-client";
import { Alert, DataTable, SelectField, SidePanel, type ColumnDef } from "@medilink/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { useTableLabels } from "../platform/shared";
import { Avatar, OutcomeIcon, useActionLabel, useDateTime, useRelative } from "./shared";

type LogKind = "security" | "access";

const ACTION_FILTERS: Record<LogKind, string[]> = {
  security: [
    "auth.login",
    "auth.mfa",
    "auth.step_up",
    "auth.password_reset",
    "auth.account",
    "platform.user",
  ],
  access: [
    "patients.record",
    "clinical.access_reason",
    "patients.access_reason",
    "authz.break_glass",
  ],
};

/**
 * Logs (upgrade 2026-11-02): one design for every log. Search by person or IP, an action filter,
 * "failures only" for security; a row opens the full entry in a side panel. Access entries show a
 * short record reference, never whose record it was.
 */
function LogPage({ kind }: { kind: LogKind }) {
  const { t } = useTranslation();
  const api = useApi();
  const relative = useRelative();
  const dateTime = useDateTime();
  const label = useActionLabel();
  const labels = useTableLabels(t(`console.logs.${kind}.noun`));
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [failures, setFailures] = useState(false);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<ConsoleEvent | null>(null);

  const params: LogParams = {
    q: search || undefined,
    action: action || undefined,
    outcome: failures ? "failure" : undefined,
    page,
  };
  const events = useQuery({
    queryKey: ["console", "log", kind, params],
    queryFn: () =>
      kind === "security" ? api.console.securityEvents(params) : api.console.accessEvents(params),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const columns = useMemo<ColumnDef<ConsoleEvent, unknown>[]>(
    () => [
      {
        id: "event",
        header: t("console.logs.event"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex items-center gap-3">
            <OutcomeIcon outcome={row.original.outcome} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-semibold text-fg">{label(row.original.action)}</span>
              <span className="truncate font-mono text-caption font-normal text-fg-muted">
                {row.original.action}
              </span>
            </span>
          </span>
        ),
      },
      {
        id: "who",
        header: t("console.logs.who"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.actor_name ? (
            <span className="flex items-center gap-2.5">
              <Avatar name={row.original.actor_name} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-fg">{row.original.actor_name}</span>
                <span className="truncate text-caption text-fg-muted">
                  {row.original.facility_name || row.original.actor_role}
                </span>
              </span>
            </span>
          ) : (
            <span className="text-fg-muted">{t("console.system")}</span>
          ),
      },
      kind === "access"
        ? {
            id: "record",
            header: t("console.logs.record"),
            enableSorting: false,
            cell: ({ row }) => (
              <span className="flex flex-col">
                <span className="font-mono text-fg">{row.original.object_ref || "—"}</span>
                {row.original.reason && (
                  <span className="max-w-[16rem] truncate text-caption text-fg-muted">
                    {row.original.reason}
                  </span>
                )}
              </span>
            ),
          }
        : {
            id: "device",
            header: t("console.logs.device"),
            enableSorting: false,
            cell: ({ row }) => (
              <span className="flex flex-col">
                <span className="text-fg">{row.original.device || "—"}</span>
                <span className="font-mono text-caption text-fg-muted">{row.original.ip}</span>
              </span>
            ),
          },
      {
        id: "when",
        header: t("console.logs.when"),
        enableSorting: false,
        meta: { align: "right" },
        cell: ({ row }) => (
          <span title={dateTime(row.original.occurred_at)}>
            {relative(row.original.occurred_at)}
          </span>
        ),
      },
    ],
    [t, kind, label, relative, dateTime],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t(`console.logs.${kind}.title`)}
        description={t(`console.logs.${kind}.lead`)}
      />
      <DataTable
        caption={t(`console.logs.${kind}.title`)}
        columns={columns}
        data={events.data?.results ?? []}
        getRowId={(e) => e.id}
        labels={labels}
        total={events.data?.count ?? 0}
        page={page}
        pageSize={25}
        onPageChange={setPage}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        filtered={Boolean(search || action || failures)}
        loading={events.isPending}
        error={events.isError}
        onRetry={() => void events.refetch()}
        onRowClick={setOpen}
        toolbar={
          <>
            <SelectField
              label={t("console.logs.type")}
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t("console.all")}</option>
              {ACTION_FILTERS[kind].map((prefix) => (
                <option key={prefix} value={prefix}>
                  {t(`console.logs.prefix.${prefix.replace(/\./g, "_")}`)}
                </option>
              ))}
            </SelectField>
            {kind === "security" && (
              <button
                type="button"
                aria-pressed={failures}
                onClick={() => {
                  setFailures((v) => !v);
                  setPage(1);
                }}
                className="min-h-10 cursor-pointer rounded-full border border-border-input bg-surface px-4 text-body-sm font-semibold text-fg transition-colors duration-150 ease-out-quint hover:border-fg-muted aria-pressed:border-danger aria-pressed:bg-danger-bg aria-pressed:text-danger"
              >
                {t("console.logs.failures")}
              </button>
            )}
          </>
        }
      />
      {open && (
        <SidePanel
          open
          onOpenChange={(value) => !value && setOpen(null)}
          title={label(open.action)}
          closeLabel={t("console.close")}
        >
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <OutcomeIcon outcome={open.outcome} />
              <span className="font-mono text-body-sm text-fg-secondary">{open.action}</span>
            </div>
            <dl className="m-0 grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-body-sm">
              {(
                [
                  ["when", dateTime(open.occurred_at)],
                  [
                    "who",
                    open.actor_name
                      ? `${open.actor_name} · ${open.actor_email}`
                      : t("console.system"),
                  ],
                  ["role", open.actor_role || "—"],
                  ["facility", open.facility_name || "—"],
                  ["record", open.object_ref ? `${open.object_type} · ${open.object_ref}` : "—"],
                  ["reason", open.reason || "—"],
                  ["ip", open.ip || "—"],
                  ["device", open.device || "—"],
                ] as const
              ).map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-fg-muted">{t(`console.logs.fields.${key}`)}</dt>
                  <dd className="m-0 font-medium break-words text-fg">{value}</dd>
                </div>
              ))}
            </dl>
            <Alert tone="info">{t("console.logs.immutable")}</Alert>
          </div>
        </SidePanel>
      )}
    </div>
  );
}

export function SecurityLogPage() {
  return <LogPage kind="security" />;
}

export function AccessLogPage() {
  return <LogPage kind="access" />;
}
