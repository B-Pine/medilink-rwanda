import {
  isApiError,
  type AccountAction,
  type RoleCode,
  type ConsoleUser,
  type UserKind,
} from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  cx,
  DataTable,
  Dialog,
  SelectField,
  SidePanel,
  TextField,
  type ColumnDef,
} from "@medilink/ui";
import {
  Devices,
  Key,
  LockKey,
  LockKeyOpen,
  ShieldCheck,
  ShieldSlash,
  SignOut,
  UserPlus,
  type Icon,
} from "@phosphor-icons/react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { roleLabel } from "../../facility/labels";
import { useStepUp } from "../lock/StepUp";
import { useTableLabels } from "../platform/shared";
import {
  Avatar,
  KindPill,
  OutcomeIcon,
  StatusDot,
  useActionLabel,
  useDateTime,
  useRelative,
} from "./shared";

const KINDS: (UserKind | "all")[] = ["all", "staff", "platform", "patient"];

/**
 * Users (upgrade 2026-11-02): every account on MediLink. A segmented kind filter, status and MFA
 * filters, and a table of people; a row opens the profile in a side panel with facilities and
 * roles, sessions, recent security events and the account actions. Patients appear as accounts
 * only, never with health data.
 */
export function UsersPage() {
  const { t } = useTranslation();
  const api = useApi();
  const relative = useRelative();
  const labels = useTableLabels(t("console.users.noun"));
  const [kind, setKind] = useState<UserKind | "all">("all");
  const [status, setStatus] = useState("");
  const [mfa, setMfa] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const users = useQuery({
    queryKey: ["console", "users", kind, status, mfa, search, page],
    queryFn: () =>
      api.console.users({
        kind: kind === "all" ? undefined : kind,
        status: (status || undefined) as "active" | "locked" | undefined,
        mfa: (mfa || undefined) as "on" | "off" | undefined,
        q: search || undefined,
        page,
      }),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<ColumnDef<ConsoleUser, unknown>[]>(
    () => [
      {
        id: "person",
        header: t("console.users.person"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex items-center gap-3">
            <Avatar name={row.original.full_name} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-semibold text-fg">{row.original.full_name}</span>
              <span className="truncate text-caption font-normal text-fg-muted">
                {row.original.email}
              </span>
            </span>
          </span>
        ),
      },
      {
        id: "kind",
        header: t("console.users.kind"),
        enableSorting: false,
        cell: ({ row }) => <KindPill kind={row.original.kind} />,
      },
      {
        id: "facilities",
        header: t("console.users.facilities"),
        enableSorting: false,
        cell: ({ row }) => {
          const first = row.original.facilities[0];
          if (!first) return <span className="text-fg-muted">—</span>;
          return (
            <span className="flex flex-col">
              <span className="truncate text-fg">{first.facility_name}</span>
              <span className="text-caption text-fg-muted">
                {first.roles.map((r) => roleLabel(r as RoleCode, t)).join(" · ")}
                {row.original.facilities.length > 1 && ` · +${row.original.facilities.length - 1}`}
              </span>
            </span>
          );
        },
      },
      {
        id: "mfa",
        header: t("console.users.mfa"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.kind === "patient" ? (
            <span className="text-fg-muted">—</span>
          ) : row.original.mfa_enabled ? (
            <StatusDot tone="success">{t("console.users.mfaOn")}</StatusDot>
          ) : (
            <StatusDot tone="warning">{t("console.users.mfaOff")}</StatusDot>
          ),
      },
      {
        id: "status",
        header: t("console.users.status"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.is_active ? (
            <StatusDot tone="success">{t("console.users.active")}</StatusDot>
          ) : (
            <StatusDot tone="danger">{t("console.users.locked")}</StatusDot>
          ),
      },
      {
        id: "lastLogin",
        header: t("console.users.lastLogin"),
        enableSorting: false,
        meta: { align: "right" },
        cell: ({ row }) => relative(row.original.last_login),
      },
    ],
    [t, relative],
  );

  const filters = [
    status && {
      id: "status",
      label: t(`console.users.${status}`),
      onRemove: () => setStatus(""),
    },
    mfa && {
      id: "mfa",
      label: mfa === "on" ? t("console.users.mfaOn") : t("console.users.mfaOff"),
      onRemove: () => setMfa(""),
    },
  ].filter(Boolean) as { id: string; label: string; onRemove: () => void }[];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("console.users.title")} />
      <div
        role="group"
        aria-label={t("console.users.kind")}
        className="inline-flex max-w-full flex-wrap gap-1 self-start rounded-full bg-subtle p-1"
      >
        {KINDS.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={kind === key}
            onClick={() => {
              setKind(key);
              setPage(1);
            }}
            className="inline-flex min-h-9 cursor-pointer items-center rounded-full px-4 text-body-sm font-semibold text-fg-secondary transition-[background-color,color,box-shadow] duration-200 ease-out-quint hover:text-fg aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-card"
          >
            {t(`console.kind.${key}`)}
          </button>
        ))}
      </div>
      <DataTable
        caption={t("console.users.title")}
        columns={columns}
        data={users.data?.results ?? []}
        getRowId={(u) => u.id}
        labels={labels}
        total={users.data?.count ?? 0}
        page={page}
        pageSize={25}
        onPageChange={setPage}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        filters={filters}
        onClearFilters={() => {
          setStatus("");
          setMfa("");
        }}
        filtered={Boolean(search || status || mfa || kind !== "all")}
        loading={users.isPending}
        error={users.isError}
        onRetry={() => void users.refetch()}
        onRowClick={(u) => setOpenId(u.id)}
        toolbar={
          <>
            <SelectField
              label={t("console.users.status")}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t("console.all")}</option>
              <option value="active">{t("console.users.active")}</option>
              <option value="locked">{t("console.users.locked")}</option>
            </SelectField>
            <SelectField
              label={t("console.users.mfa")}
              value={mfa}
              onChange={(e) => {
                setMfa(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t("console.all")}</option>
              <option value="on">{t("console.users.mfaOn")}</option>
              <option value="off">{t("console.users.mfaOff")}</option>
            </SelectField>
          </>
        }
      />
      {openId && <UserPanel id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

const ACTIONS: { key: AccountAction; icon: Icon; danger?: boolean }[] = [
  { key: "revoke-sessions", icon: SignOut },
  { key: "reset-mfa", icon: Key },
  { key: "lock", icon: LockKey, danger: true },
  { key: "unlock", icon: LockKeyOpen },
];

function UserPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const relative = useRelative();
  const dateTime = useDateTime();
  const label = useActionLabel();
  const [action, setAction] = useState<AccountAction | null>(null);
  const user = useQuery({ queryKey: ["console", "user", id], queryFn: () => api.console.user(id) });
  const u = user.data;
  const available = u
    ? ACTIONS.filter((a) =>
        a.key === "lock"
          ? u.is_active
          : a.key === "unlock"
            ? !u.is_active
            : u.kind !== "patient" || a.key !== "reset-mfa",
      )
    : [];

  return (
    <SidePanel
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("console.users.profile")}
      closeLabel={t("console.close")}
      footer={
        u && (
          <div className="flex w-full flex-wrap gap-2">
            {available.map(({ key, icon: ActionIcon, danger }) => (
              <Button
                key={key}
                size="sm"
                pill
                variant={danger ? "danger" : "secondary"}
                onClick={() => setAction(key)}
                iconStart={<ActionIcon aria-hidden="true" className="size-4" />}
              >
                {t(`console.users.actions.${key}`)}
              </Button>
            ))}
          </div>
        )
      }
    >
      {user.isPending ? (
        <div className="flex flex-col gap-3">
          <div className="h-16 animate-pulse rounded-2xl bg-subtle" />
          <div className="h-32 animate-pulse rounded-2xl bg-subtle" />
        </div>
      ) : user.isError || !u ? (
        <Alert tone="danger">{t("console.failed")}</Alert>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <Avatar name={u.full_name} size="lg" />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="m-0 truncate font-heading text-h3 font-bold">{u.full_name}</p>
              <p className="m-0 truncate text-body-sm text-fg-secondary">{u.email}</p>
              <div className="flex flex-wrap items-center gap-2">
                <KindPill kind={u.kind} />
                {u.is_active ? (
                  <StatusDot tone="success">{t("console.users.active")}</StatusDot>
                ) : (
                  <StatusDot tone="danger">{t("console.users.locked")}</StatusDot>
                )}
              </div>
            </div>
          </div>

          <dl className="m-0 grid grid-cols-2 gap-3">
            {(
              [
                ["lastLogin", relative(u.last_login)],
                ["since", dateTime(u.created_at)],
                [
                  "mfa",
                  u.kind === "patient"
                    ? "—"
                    : u.mfa_enabled
                      ? t("console.users.mfaOn")
                      : t("console.users.mfaOff"),
                ],
                [
                  "email",
                  u.email_verified ? t("console.users.verified") : t("console.users.unverified"),
                ],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="rounded-2xl bg-page px-4 py-3">
                <dt className="text-caption text-fg-muted">{t(`console.users.facts.${key}`)}</dt>
                <dd className="m-0 font-semibold">{value}</dd>
              </div>
            ))}
          </dl>

          {u.facilities.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="m-0 text-caption font-semibold tracking-wider text-fg-muted uppercase">
                {t("console.users.facilities")}
              </h3>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {u.facilities.map((f) => (
                  <li
                    key={f.facility_id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 px-4 py-3"
                  >
                    <span className="flex flex-col">
                      <span className="font-semibold">{f.facility_name}</span>
                      <span className="text-caption text-fg-muted">
                        {f.roles.map((r) => roleLabel(r as RoleCode, t)).join(" · ")}
                      </span>
                    </span>
                    {!f.is_active && <Badge tone="neutral">{t("console.users.inactive")}</Badge>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="m-0 flex items-center gap-2 text-caption font-semibold tracking-wider text-fg-muted uppercase">
              <Devices aria-hidden="true" className="size-4" />
              {t("console.users.sessions", { count: u.sessions.length })}
            </h3>
            {u.sessions.length === 0 ? (
              <p className="m-0 text-body-sm text-fg-muted">{t("console.users.noSessions")}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {u.sessions.map((sess) => (
                  <li
                    key={sess.ref}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-page px-4 py-3 text-body-sm"
                  >
                    <span className="flex flex-col">
                      <span className="font-semibold">
                        {t(`console.audience.${sess.audience}`, { defaultValue: sess.audience })}
                      </span>
                      <span className="font-mono text-caption text-fg-muted">{sess.ref}</span>
                    </span>
                    <span className="text-right text-caption text-fg-muted">
                      {t("console.users.started", { time: relative(sess.created_at) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="m-0 flex items-center gap-2 text-caption font-semibold tracking-wider text-fg-muted uppercase">
              <ShieldCheck aria-hidden="true" className="size-4" />
              {t("console.users.events")}
            </h3>
            {u.events.length === 0 ? (
              <p className="m-0 text-body-sm text-fg-muted">{t("console.empty")}</p>
            ) : (
              <ol className="m-0 flex list-none flex-col gap-1 p-0">
                {u.events.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-1.5">
                    <OutcomeIcon outcome={e.outcome} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body-sm font-semibold">{label(e.action)}</span>
                      <span className="truncate text-caption text-fg-muted">
                        {[e.device, e.ip].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-caption text-fg-muted">
                      {relative(e.occurred_at)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
      {action && u && (
        <ActionDialog
          userId={u.id}
          name={u.full_name}
          action={action}
          onClose={() => setAction(null)}
        />
      )}
    </SidePanel>
  );
}

function ActionDialog({
  userId,
  name,
  action,
  onClose,
}: {
  userId: string;
  name: string;
  action: AccountAction;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const [reason, setReason] = useState("");
  const run = useMutation({
    mutationFn: () => withStepUp(() => api.console.act(userId, action, reason.trim())),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["console"] });
      onClose();
    },
  });
  const danger = action === "lock";
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t(`console.users.actions.${action}`)}
      description={t(`console.users.confirm.${action}`, { name })}
      closeLabel={t("console.close")}
      footer={
        <Button
          variant={danger ? "danger" : "primary"}
          pill
          loading={run.isPending}
          disabled={reason.trim().length < 5}
          onClick={() => run.mutate()}
          iconStart={
            action === "reset-mfa" ? (
              <ShieldSlash aria-hidden="true" className="size-4" />
            ) : action === "unlock" ? (
              <UserPlus aria-hidden="true" className="size-4" />
            ) : undefined
          }
        >
          {t(`console.users.actions.${action}`)}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {run.isError && (
          <Alert tone="danger">
            {isApiError(run.error) ? run.error.message : t("console.failed")}
          </Alert>
        )}
        <TextField
          label={t("console.users.reason")}
          hint={t("console.users.reasonHint")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={cx("w-full")}
        />
      </div>
    </Dialog>
  );
}
