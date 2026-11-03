import type { ApplicationStatus, ApplicationSummary } from "@medilink/api-client";
import {
  Button,
  CheckboxField,
  DataTable,
  SidePanel,
  Tabs,
  TabsList,
  TabsTrigger,
  buttonClassName,
  type ColumnDef,
  type SortingState,
} from "@medilink/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { facilityTypeLabel } from "../../facility/labels";
import { formatDate, PlatformOnly, StatusBadge, useLocale, useTableLabels } from "./shared";

const TABS: (ApplicationStatus | "all")[] = [
  "submitted",
  "under_review",
  "changes_requested",
  "approved",
  "rejected",
  "draft",
  "all",
];

/** /platform/applications: the pipeline (contract §6.1, design 08). */
export function ApplicationsPage() {
  return (
    <PlatformOnly>
      <Applications />
    </PlatformOnly>
  );
}

function Applications() {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") ?? "submitted") as ApplicationStatus | "all";
  const q = params.get("q") ?? "";
  const byPlatform = params.get("created_by_platform") === "true";
  const page = Number(params.get("page") ?? 1);
  const pageSize = Number(params.get("page_size") ?? 50);
  const [sorting, setSorting] = useState<SortingState>([{ id: "submitted_at", desc: false }]);
  const [preview, setPreview] = useState<ApplicationSummary | null>(null);
  const labels = useTableLabels(t("platform.applications.noun"));

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in changes)) next.delete("page");
    setParams(next, { replace: true });
  };

  const ordering = sorting[0] ? `${sorting[0].desc ? "-" : ""}${sorting[0].id}` : undefined;
  const list = useQuery({
    queryKey: ["platform", "applications", status, q, byPlatform, page, pageSize, ordering],
    queryFn: () =>
      api.onboarding.platform.applications({
        ...(status === "all" ? { status: "" } : { status }),
        q,
        page,
        page_size: pageSize,
        ordering,
        ...(byPlatform ? { created_by_platform: true } : {}),
      }),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<ColumnDef<ApplicationSummary, unknown>[]>(
    () => [
      {
        accessorKey: "facility_name",
        header: t("platform.applications.facility"),
        enableSorting: false,
      },
      {
        accessorKey: "status",
        header: t("platform.applications.status"),
        enableSorting: false,
        cell: ({ row }) => <StatusBadge kind="application" value={row.original.status} />,
      },
      {
        accessorKey: "facility_type",
        header: t("platform.review.type"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.facility_type ? facilityTypeLabel(row.original.facility_type, t) : "—",
      },
      {
        accessorKey: "district_name",
        header: t("platform.facilities.district"),
        enableSorting: false,
        cell: ({ row }) => row.original.district_name || "—",
      },
      {
        accessorKey: "applicant_name",
        header: t("platform.applications.applicant"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex flex-col">
            <span>{row.original.applicant_name}</span>
            {row.original.proposed_admin_name && (
              <span className="text-body-sm text-fg-muted">
                {t("platform.applications.adminIs", { name: row.original.proposed_admin_name })}
              </span>
            )}
          </span>
        ),
      },
      {
        id: "progress",
        header: t("platform.applications.progress"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex flex-col text-body-sm">
            <span>
              {t("platform.applications.documents", { count: row.original.documents_count })}
            </span>
            {row.original.missing_count > 0 && (
              <span className="text-attention">
                {t("platform.applications.missing", { count: row.original.missing_count })}
              </span>
            )}
          </span>
        ),
      },
      {
        accessorKey: "submitted_at",
        header: t("platform.applications.submitted"),
        cell: ({ row }) => formatDate(row.original.submitted_at, locale),
      },
      {
        accessorKey: "last_activity_at",
        header: t("platform.applications.lastActivity"),
        cell: ({ row }) => formatDate(row.original.last_activity_at, locale),
      },
    ],
    [t, locale],
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("platform.applications.title")}
        actions={
          <Link to="/platform/applications/new" className={buttonClassName({})}>
            {t("platform.applications.create")}
          </Link>
        }
      />
      <Tabs value={status} onValueChange={(value) => update({ status: value })}>
        <TabsList aria-label={t("platform.applications.status")}>
          {TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {tab === "all"
                ? t("platform.applications.all")
                : t(`platform.status.application.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <DataTable<ApplicationSummary>
        caption={t("platform.applications.title")}
        columns={columns}
        data={list.data?.results ?? []}
        getRowId={(row) => row.id}
        labels={labels}
        total={list.data?.count ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={(p) => update({ page: String(p) })}
        onPageSizeChange={(size) => update({ page_size: String(size) })}
        sorting={sorting}
        onSortingChange={setSorting}
        search={q}
        onSearchChange={(value) => update({ q: value })}
        filters={
          byPlatform
            ? [
                {
                  id: "created_by_platform",
                  label: t("platform.applications.byPlatform"),
                  onRemove: () => update({ created_by_platform: null }),
                },
              ]
            : []
        }
        onClearFilters={() => update({ created_by_platform: null, q: null })}
        toolbar={
          <CheckboxField
            label={t("platform.applications.byPlatform")}
            checked={byPlatform}
            onChange={(e) => update({ created_by_platform: e.target.checked ? "true" : null })}
          />
        }
        onRowClick={setPreview}
        rowActions={(row) => (
          <Link
            to={`/platform/applications/${row.id}`}
            className={buttonClassName({ variant: "ghost", size: "sm", pill: true })}
            aria-label={`${t("platform.applications.review")}: ${row.facility_name}`}
          >
            {t("platform.applications.review")}
          </Link>
        )}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        filtered={Boolean(q || byPlatform)}
      />
      <SidePanel
        open={preview !== null}
        onOpenChange={(open) => !open && setPreview(null)}
        title={preview?.facility_name ?? ""}
        closeLabel={t("lock.close")}
        footer={
          preview && (
            <Button onClick={() => void navigate(`/platform/applications/${preview.id}`)}>
              {t("platform.applications.review")}
            </Button>
          )
        }
      >
        {preview && (
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-fg-muted">{t("platform.applications.status")}</dt>
            <dd className="m-0">
              <StatusBadge kind="application" value={preview.status} />
            </dd>
            <dt className="text-fg-muted">{t("platform.applications.applicant")}</dt>
            <dd className="m-0">{preview.applicant_name}</dd>
            <dt className="text-fg-muted">{t("platform.applications.submitted")}</dt>
            <dd className="m-0">{formatDate(preview.submitted_at, locale)}</dd>
            <dt className="text-fg-muted">{t("platform.applications.reviewer")}</dt>
            <dd className="m-0">{preview.reviewer?.full_name ?? "—"}</dd>
          </dl>
        )}
      </SidePanel>
    </div>
  );
}
