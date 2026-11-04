import {
  consolePaths,
  type ConsoleUser,
  type RoleCode,
  type UserKind,
  type UserListParams,
} from "@medilink/api-client";
import { Button, DataTable, SelectField, type ColumnDef } from "@medilink/ui";
import { DownloadSimple } from "@phosphor-icons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { env } from "../../env";
import { roleLabel } from "../../facility/labels";
import { PlatformOnly, useTableLabels } from "../platform/shared";
import { Avatar, KindPill, StatusDot, useRelative } from "./shared";

const KINDS: (UserKind | "all")[] = ["all", "platform", "staff", "patient"];
export const ROLES: RoleCode[] = [
  "facility_admin",
  "doctor",
  "receptionist",
  "pharmacist",
  "cashier",
];
/** The list filters, kept in the address so a filtered list can be linked and reloaded. */
const FILTERS = ["kind", "status", "mfa", "facility", "role", "verification", "q"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * Users (upgrade 2026-11-02; #198): every account on MediLink. Account counts by type, the
 * accounts that need attention, filters by facility, role, status, two-step sign-in and email
 * confirmation, and an export of who has access. A row opens the person's page. Patients appear
 * as accounts only, never with health data.
 */
export function UsersPage() {
  return (
    <PlatformOnly>
      <Users />
    </PlatformOnly>
  );
}

function Users() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const relative = useRelative();
  const labels = useTableLabels(t("console.users.noun"));
  const [params, setParams] = useSearchParams();
  const value = (key: Filter) => params.get(key) ?? "";
  const page = Number(params.get("page") ?? "1") || 1;
  const filters: UserListParams = {
    q: value("q") || undefined,
    kind: (value("kind") || undefined) as UserKind | undefined,
    status: (value("status") || undefined) as UserListParams["status"],
    mfa: (value("mfa") || undefined) as UserListParams["mfa"],
    facility: value("facility") || undefined,
    role: value("role") || undefined,
    verification: (value("verification") || undefined) as UserListParams["verification"],
  };
  /** Set some filters (empty removes one); any change goes back to the first page. */
  function set(next: Partial<Record<Filter | "page", string>>) {
    setParams(
      (current) => {
        const out = new URLSearchParams(current);
        for (const [key, v] of Object.entries(next)) {
          if (v) out.set(key, v);
          else out.delete(key);
        }
        if (!("page" in next)) out.delete("page");
        return out;
      },
      { replace: true },
    );
  }

  const summary = useQuery({
    queryKey: ["console", "users", "summary"],
    queryFn: () => api.console.userSummary(),
  });
  const users = useQuery({
    queryKey: ["console", "users", filters, page],
    queryFn: () => api.console.users({ ...filters, page }),
    placeholderData: keepPreviousData,
  });
  const counts = summary.data;
  const facilities = counts?.facilities ?? [];
  const facilityName = facilities.find((f) => f.id === filters.facility)?.name;

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
              {row.original.phone && (
                <span className="truncate text-caption font-normal text-fg-muted tabular-nums">
                  {row.original.phone}
                </span>
              )}
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
          const active = row.original.facilities.filter((f) => f.is_active);
          const first = active[0];
          if (!first)
            return (
              <span className="text-fg-muted">
                {row.original.facilities.length ? t("console.users.noActiveAccess") : "—"}
              </span>
            );
          return (
            <span className="flex flex-col">
              <span className="truncate text-fg">{first.facility_name}</span>
              <span className="text-caption text-fg-muted">
                {first.roles.map((r) => roleLabel(r as RoleCode, t)).join(" · ")}
                {active.length > 1 && ` · +${active.length - 1}`}
              </span>
              {row.original.licence_state && (
                <span className="text-caption">
                  <span className="text-fg-secondary">
                    {t(`setup.professions.${row.original.profession}`, {
                      defaultValue: t("console.users.clinician"),
                    })}
                  </span>
                  {" · "}
                  <span
                    className={
                      row.original.licence_state === "valid"
                        ? "text-success"
                        : row.original.licence_state === "expiring"
                          ? "text-attention"
                          : "text-danger"
                    }
                  >
                    {t(`setup.licenceState.${row.original.licence_state}`)}
                  </span>
                </span>
              )}
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
        cell: ({ row }) =>
          row.original.last_login ? relative(row.original.last_login) : t("console.users.never"),
      },
    ],
    [t, relative],
  );

  const chips = [
    filters.facility && {
      id: "facility",
      label: facilityName ?? t("console.users.oneFacility"),
      onRemove: () => set({ facility: "" }),
    },
    filters.role && {
      id: "role",
      label: roleLabel(filters.role as RoleCode, t),
      onRemove: () => set({ role: "" }),
    },
    filters.status && {
      id: "status",
      label: t(`console.users.${filters.status}`),
      onRemove: () => set({ status: "" }),
    },
    filters.mfa && {
      id: "mfa",
      label:
        filters.mfa === "on" ? t("console.users.mfaOnFilter") : t("console.users.mfaOffFilter"),
      onRemove: () => set({ mfa: "" }),
    },
    filters.verification && {
      id: "verification",
      label: t("console.users.pendingFilter"),
      onRemove: () => set({ verification: "" }),
    },
  ].filter(Boolean) as { id: string; label: string; onRemove: () => void }[];

  const attention = counts
    ? (
        [
          ["locked", counts.locked, { status: "locked" }],
          ["withoutMfa", counts.without_mfa, { mfa: "off", kind: "" }],
          ["pending", counts.verification_pending, { verification: "pending" }],
        ] as const
      ).filter(([, count]) => count > 0)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("console.users.title")}
        description={t("console.users.lead")}
        actions={<ExportButton filters={filters} />}
      />

      <div className="flex flex-col gap-3">
        <div
          role="group"
          aria-label={t("console.users.kind")}
          className="inline-flex max-w-full flex-wrap gap-1 self-start rounded-full bg-subtle p-1"
        >
          {KINDS.map((key) => {
            const count = counts ? counts[key === "all" ? "total" : key] : undefined;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={(filters.kind ?? "all") === key}
                onClick={() => set({ kind: key === "all" ? "" : key })}
                className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full px-4 text-body-sm font-semibold text-fg-secondary transition-[background-color,color,box-shadow] duration-200 ease-out-quint hover:text-fg aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-card"
              >
                {t(`console.kind.${key}`)}
                {count !== undefined && (
                  <span className="font-normal text-fg-muted tabular-nums">
                    {count.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {attention.length > 0 && (
          <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm">
            <span className="text-fg-secondary">{t("console.users.attention")}</span>
            {attention.map(([key, count, next]) => (
              <button
                key={key}
                type="button"
                onClick={() => set(next)}
                className="cursor-pointer font-semibold text-link underline-offset-2 hover:underline"
              >
                {t(`console.users.attentionItems.${key}`, { count })}
              </button>
            ))}
          </p>
        )}
      </div>

      <DataTable
        caption={t("console.users.title")}
        columns={columns}
        data={users.data?.results ?? []}
        getRowId={(u) => u.id}
        labels={{ ...labels, search: t("console.users.search") }}
        total={users.data?.count ?? 0}
        page={page}
        pageSize={25}
        onPageChange={(next) => set({ page: next > 1 ? String(next) : "" })}
        search={filters.q ?? ""}
        onSearchChange={(q) => set({ q })}
        filters={chips}
        onClearFilters={() =>
          set({ status: "", mfa: "", facility: "", role: "", verification: "" })
        }
        filtered={FILTERS.some((key) => Boolean(value(key)))}
        loading={users.isPending}
        error={users.isError}
        onRetry={() => void users.refetch()}
        onRowClick={(u) => void navigate(`/platform/users/${u.id}`)}
        toolbar={
          <>
            <SelectField
              label={t("console.users.facility")}
              value={filters.facility ?? ""}
              onChange={(e) => set({ facility: e.target.value })}
            >
              <option value="">{t("console.all")}</option>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t("console.users.role")}
              value={filters.role ?? ""}
              onChange={(e) => set({ role: e.target.value })}
            >
              <option value="">{t("console.all")}</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role, t)}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t("console.users.status")}
              value={filters.status ?? ""}
              onChange={(e) => set({ status: e.target.value })}
            >
              <option value="">{t("console.all")}</option>
              <option value="active">{t("console.users.active")}</option>
              <option value="locked">{t("console.users.locked")}</option>
            </SelectField>
            <SelectField
              label={t("console.users.mfa")}
              value={filters.mfa ?? ""}
              onChange={(e) => set({ mfa: e.target.value })}
            >
              <option value="">{t("console.all")}</option>
              <option value="on">{t("console.users.mfaOn")}</option>
              <option value="off">{t("console.users.mfaOff")}</option>
            </SelectField>
            <SelectField
              label={t("console.users.emailState")}
              value={filters.verification ?? ""}
              onChange={(e) => set({ verification: e.target.value })}
            >
              <option value="">{t("console.all")}</option>
              <option value="pending">{t("console.users.pending")}</option>
            </SelectField>
          </>
        }
      />
    </div>
  );
}

/** Who has access, for an access review: staff and platform admins (never patients), as CSV with
 * the list's filters; the download is audit-logged. */
function ExportButton({ filters }: { filters: UserListParams }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function download() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(`${env.apiBaseUrl}${consolePaths.usersExport(filters)}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error(String(response.status));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `medilink-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        loading={busy}
        onClick={() => void download()}
        iconStart={<DownloadSimple aria-hidden="true" className="size-4" />}
      >
        {t("console.users.export")}
      </Button>
      <span className="text-caption text-fg-muted">
        {failed ? (
          <span role="alert" className="text-danger">
            {t("console.users.exportFailed")}
          </span>
        ) : (
          t("console.users.exportHint")
        )}
      </span>
    </div>
  );
}
