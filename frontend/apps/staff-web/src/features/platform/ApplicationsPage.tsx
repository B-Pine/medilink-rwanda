import type { ApplicationStatus, ApplicationSummary } from "@medilink/api-client";
import {
  Alert,
  Button,
  CheckboxField,
  DataTable,
  Dialog,
  SidePanel,
  Tabs,
  TabsList,
  TabsTrigger,
  TextField,
  buttonClassName,
  type ColumnDef,
  type SortingState,
} from "@medilink/ui";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";
import {
  actionError,
  formatDate,
  PlatformOnly,
  StatusBadge,
  useLocale,
  useTableLabels,
} from "./shared";

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
  const [creating, setCreating] = useState(false);
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
        accessorKey: "applicant_name",
        header: t("platform.applications.applicant"),
        enableSorting: false,
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeading title={t("platform.applications.title")}>
          {t("platform.applications.title")}
        </PageHeading>
        <Button onClick={() => setCreating(true)}>{t("platform.applications.create")}</Button>
      </div>
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
            className={buttonClassName({ variant: "secondary" })}
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
      <CreateDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function CreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [values, setValues] = useState({ facility: "", name: "", email: "", sendLink: true });
  const [error, setError] = useState<string | undefined>();
  const create = useMutation({
    mutationFn: () =>
      api.onboarding.platform.create({
        applicant: { name: values.name.trim(), email: values.email.trim() },
        facility: { name: values.facility.trim() },
        send_link: values.sendLink,
      }),
    onSuccess: (app) => {
      void queryClient.invalidateQueries({ queryKey: ["platform"] });
      onOpenChange(false);
      void navigate(`/platform/applications/${app.id}`);
    },
    onError: (failure) => setError(actionError(failure, t("errors.generic"))),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!values.facility.trim() || !values.name.trim() || !values.email.includes("@")) {
      setError(t("platform.applications.createRequired"));
      return;
    }
    create.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("platform.applications.create")}
      description={t("platform.applications.createHint")}
      closeLabel={t("lock.close")}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t("lock.cancel")}
          </Button>
          <Button type="submit" form="create-application" loading={create.isPending}>
            {t("platform.applications.createSubmit")}
          </Button>
        </>
      }
    >
      <form id="create-application" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField
          label={t("platform.applications.facility")}
          value={values.facility}
          onChange={(e) => setValues((v) => ({ ...v, facility: e.target.value }))}
        />
        <TextField
          label={t("platform.applications.applicant")}
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
        />
        <TextField
          label={t("platform.applications.applicantEmail")}
          type="email"
          value={values.email}
          onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
        />
        <CheckboxField
          label={t("platform.applications.sendLink")}
          checked={values.sendLink}
          onChange={(e) => setValues((v) => ({ ...v, sendLink: e.target.checked }))}
        />
        {error && (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        )}
      </form>
    </Dialog>
  );
}
