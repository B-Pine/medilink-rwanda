import {
  isApiError,
  type FacilityAction,
  type FacilityFeatureFlag,
  type Licence,
  type LicenceKind,
  type PlatformFacility,
  type PlatformFacilityDetail,
  onboardingPaths,
} from "@medilink/api-client";
import {
  Alert,
  Button,
  Card,
  CheckboxField,
  ConfirmDialog,
  DataTable,
  Dialog,
  LoadingState,
  SelectField,
  SwitchField,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextField,
  Timeline,
  buttonClassName,
  type ColumnDef,
} from "@medilink/ui";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { env } from "../../env";
import { useStepUp } from "../lock";
import { ReasonSelect, useReasons } from "./ApplicationReviewPage";
import {
  actionError,
  formatDate,
  PlatformOnly,
  StatusBadge,
  useIdempotencyKey,
  useLocale,
  useTableLabels,
} from "./shared";

/** /platform/facilities (replaces the Sprint 0 placeholder). */
export function FacilitiesPage() {
  return (
    <PlatformOnly>
      <Facilities />
    </PlatformOnly>
  );
}

function Facilities() {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const licenceState = params.get("licence_state") ?? "";
  const facilityType = params.get("facility_type") ?? "";
  const ownership = params.get("ownership") ?? "";
  const missingCode = params.get("missing_code") === "true";
  const q = params.get("q") ?? "";
  const page = Number(params.get("page") ?? 1);
  const labels = useTableLabels(t("platform.facilities.noun"));
  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in changes)) next.delete("page");
    setParams(next, { replace: true });
  };
  const list = useQuery({
    queryKey: [
      "platform",
      "facilities",
      status,
      licenceState,
      facilityType,
      ownership,
      missingCode,
      q,
      page,
    ],
    queryFn: () =>
      api.onboarding.platform.facilities({
        status,
        licence_state: licenceState,
        facility_type: facilityType,
        ownership,
        ...(missingCode ? { missing_code: true } : {}),
        q,
        page,
        page_size: 50,
      }),
    placeholderData: keepPreviousData,
  });
  const columns = useMemo<ColumnDef<PlatformFacility, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("platform.facilities.name"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex flex-col">
            <span className="font-semibold">{row.original.name}</span>
            <span className="text-body-sm text-fg-muted">
              {row.original.moh_facility_code
                ? `FOSA ${row.original.moh_facility_code}`
                : t("platform.facilities.noCode")}
            </span>
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: t("platform.applications.status"),
        enableSorting: false,
        cell: ({ row }) => <StatusBadge kind="facility" value={row.original.status} />,
      },
      {
        accessorKey: "facility_type",
        header: t("platform.review.type"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex flex-col">
            <span>
              {t(`facility.types.${row.original.facility_type}`, {
                defaultValue: row.original.facility_type,
              })}
            </span>
            <span className="text-body-sm text-fg-muted">
              {t(`platform.ownership.${row.original.ownership}`, {
                defaultValue: row.original.ownership,
              })}
            </span>
          </span>
        ),
      },
      {
        id: "district",
        header: t("platform.facilities.place"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex flex-col">
            <span>{row.original.location.district || row.original.district?.name || "—"}</span>
            {row.original.location.sector && (
              <span className="text-body-sm text-fg-muted">{row.original.location.sector}</span>
            )}
          </span>
        ),
      },
      {
        id: "in_charge",
        header: t("platform.facilities.inCharge"),
        enableSorting: false,
        cell: ({ row }) => {
          const admin = row.original.admins[0];
          return admin ? (
            <span className="flex flex-col">
              <span>{admin.name}</span>
              <span className="text-body-sm text-fg-muted">{admin.phone || admin.email}</span>
            </span>
          ) : (
            <span className="text-fg-muted">{t("platform.facilities.noAdmin")}</span>
          );
        },
      },
      {
        id: "staff",
        header: t("platform.facilities.staff"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex flex-col text-body-sm">
            <span>{t("platform.facilities.staffCount", { count: row.original.staff_count })}</span>
            {row.original.doctor_count > 0 && (
              <span className="text-fg-muted">
                {t("platform.facilities.doctorsChecked", {
                  checked: row.original.doctors_attested,
                  count: row.original.doctor_count,
                })}
              </span>
            )}
          </span>
        ),
      },
      {
        accessorKey: "licence_state",
        header: t("platform.facilities.licence"),
        enableSorting: false,
        cell: ({ row }) => <StatusBadge kind="licence" value={row.original.licence_state} />,
      },
      {
        accessorKey: "next_licence_expiry",
        header: t("platform.facilities.nextExpiry"),
        enableSorting: false,
        cell: ({ row }) => formatDate(row.original.next_licence_expiry, locale),
      },
    ],
    [t, locale],
  );
  const filters = [
    ...(status
      ? [
          {
            id: "status",
            label: t(`platform.status.facility.${status}`),
            onRemove: () => update({ status: "" }),
          },
        ]
      : []),
    ...(licenceState
      ? [
          {
            id: "licence_state",
            label: t(`platform.status.licence.${licenceState}`),
            onRemove: () => update({ licence_state: "" }),
          },
        ]
      : []),
  ];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("platform.facilities.title")}
        actions={
          <ExportButton
            params={{
              status,
              licence_state: licenceState,
              facility_type: facilityType,
              ownership,
              q,
            }}
          />
        }
      />
      <DataTable<PlatformFacility>
        caption={t("platform.facilities.title")}
        columns={columns}
        data={list.data?.results ?? []}
        getRowId={(r) => r.id}
        labels={labels}
        total={list.data?.count ?? 0}
        page={page}
        pageSize={50}
        onPageChange={(p) => update({ page: String(p) })}
        search={q}
        onSearchChange={(value) => update({ q: value })}
        filters={filters}
        onClearFilters={() =>
          update({
            status: "",
            licence_state: "",
            facility_type: "",
            ownership: "",
            missing_code: "",
            q: "",
          })
        }
        toolbar={
          <>
            <SelectField
              label={t("platform.applications.status")}
              value={status}
              onChange={(e) => update({ status: e.target.value })}
            >
              <option value="">{t("platform.applications.all")}</option>
              {(["approved", "setup", "live", "suspended", "deactivated"] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`platform.status.facility.${s}`)}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t("platform.review.type")}
              value={facilityType}
              onChange={(e) => update({ facility_type: e.target.value })}
            >
              <option value="">{t("platform.applications.all")}</option>
              {FACILITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`facility.types.${type}`, { defaultValue: type })}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t("platform.review.ownership")}
              value={ownership}
              onChange={(e) => update({ ownership: e.target.value })}
            >
              <option value="">{t("platform.applications.all")}</option>
              {(["public", "private", "faith_based", "ngo"] as const).map((o) => (
                <option key={o} value={o}>
                  {t(`platform.ownership.${o}`)}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t("platform.facilities.licence")}
              value={licenceState}
              onChange={(e) => update({ licence_state: e.target.value })}
            >
              <option value="">{t("platform.applications.all")}</option>
              {(["valid", "expiring", "expired", "missing"] as const).map((l) => (
                <option key={l} value={l}>
                  {t(`platform.status.licence.${l}`)}
                </option>
              ))}
            </SelectField>
            <CheckboxField
              label={t("platform.facilities.missingCode")}
              checked={missingCode}
              onChange={(e) => update({ missing_code: e.target.checked ? "true" : "" })}
            />
          </>
        }
        rowActions={(row) => (
          <Link
            to={`/platform/facilities/${row.id}`}
            className={buttonClassName({ variant: "ghost", size: "sm", pill: true })}
            aria-label={`${t("platform.table.open")}: ${row.name}`}
          >
            {t("platform.table.open")}
          </Link>
        )}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        filtered={Boolean(q || status || licenceState || facilityType || ownership || missingCode)}
      />
    </div>
  );
}

const FACILITY_TYPES = [
  "health_post",
  "health_center",
  "district_hospital",
  "provincial_hospital",
  "referral_hospital",
  "private_clinic",
  "polyclinic",
  "private_hospital",
  "dental_clinic",
  "eye_clinic",
  "diagnostic_center",
] as const;

/** The facility list as CSV for the Ministry of Health (the same filters; audit-logged). */
function ExportButton({ params }: { params: Record<string, string> }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function download() {
    setBusy(true);
    setFailed(false);
    try {
      const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
      const response = await fetch(
        `${env.apiBaseUrl}${onboardingPaths.facilitiesExport}${query ? `?${query}` : ""}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error(String(response.status));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `medilink-facilities-${new Date().toISOString().slice(0, 10)}.csv`;
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
      <Button variant="secondary" loading={busy} onClick={() => void download()}>
        {t("platform.facilities.export")}
      </Button>
      {failed && (
        <span role="alert" className="text-body-sm text-danger">
          {t("platform.facilities.exportFailed")}
        </span>
      )}
    </div>
  );
}

const ACTIONS: Record<string, FacilityAction[]> = {
  approved: ["start-setup", "deactivate"],
  setup: ["go-live", "deactivate"],
  live: ["suspend", "deactivate"],
  suspended: ["reactivate", "deactivate"],
  deactivated: [],
};
const REASON_KIND: Partial<Record<FacilityAction, string>> = {
  suspend: "facility_suspension",
  reactivate: "facility_reactivation",
  deactivate: "facility_deactivation",
};

/** /platform/facilities/:id — Overview, Licences, History, Feature flags. */
export function FacilityDetailPage() {
  return (
    <PlatformOnly>
      <FacilityDetail />
    </PlatformOnly>
  );
}

function FacilityDetail() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const api = useApi();
  const locale = useLocale();
  const facility = useQuery({
    queryKey: ["platform", "facility", id],
    queryFn: () => api.onboarding.platform.facility(id),
  });
  const [action, setAction] = useState<FacilityAction | null>(null);
  if (facility.isPending) return <LoadingState />;
  if (facility.isError) return <Alert tone="danger">{t("platform.table.error")}</Alert>;
  const data = facility.data;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={data.name}
        back={{ to: "/platform/facilities", label: t("platform.facilities.back") }}
        badges={<StatusBadge kind="facility" value={data.status} />}
      />
      <Tabs defaultValue="overview">
        <TabsList aria-label={data.name}>
          <TabsTrigger value="overview">{t("platform.facilities.tabs.overview")}</TabsTrigger>
          <TabsTrigger value="licences">{t("platform.facilities.tabs.licences")}</TabsTrigger>
          <TabsTrigger value="history">{t("platform.facilities.tabs.history")}</TabsTrigger>
          <TabsTrigger value="flags">{t("platform.facilities.tabs.flags")}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="flex flex-col gap-4">
          <FacilityOverview facility={data} />
          <IdentifiersForm facility={data} />
          <div className="flex flex-wrap gap-2">
            {(ACTIONS[data.status] ?? []).map((a) => (
              <Button
                key={a}
                variant={a === "deactivate" || a === "suspend" ? "danger" : "primary"}
                onClick={() => setAction(a)}
              >
                {t(`platform.facilities.actions.${a}`)}
              </Button>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="licences">
          <LicencesTab facility={data} />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTab id={id} locale={locale} />
        </TabsContent>
        <TabsContent value="flags">
          <FlagsTab id={id} />
        </TabsContent>
      </Tabs>
      {action && (
        <StatusActionDialog facility={data} action={action} onClose={() => setAction(null)} />
      )}
    </div>
  );
}

/** What MediLink holds about the facility: identity, contacts, place, people and staff. */
function FacilityOverview({ facility }: { facility: PlatformFacilityDetail }) {
  const { t } = useTranslation();
  const place = facility.location;
  const rows: [string, ReactNode][] = [
    [t("platform.facilities.address"), facility.slug],
    [
      t("platform.review.type"),
      t(`facility.types.${facility.facility_type}`, { defaultValue: facility.facility_type }),
    ],
    [
      t("platform.review.ownership"),
      t(`platform.ownership.${facility.ownership}`, { defaultValue: facility.ownership }),
    ],
    [
      t("platform.review.levelOfCare"),
      facility.level_of_care ? t(`platform.review.level.${facility.level_of_care}`) : "—",
    ],
    [t("platform.review.organization"), facility.organization_name || "—"],
    [t("platform.review.mohCode"), facility.moh_facility_code || "—"],
    [t("platform.review.tin"), facility.tin || "—"],
    [
      t("platform.facilities.licence"),
      <StatusBadge key="licence" kind="licence" value={facility.licence_state} />,
    ],
  ];
  const contact: [string, ReactNode][] = [
    [
      t("platform.form.phone"),
      facility.phone ? <a href={`tel:${facility.phone}`}>{facility.phone}</a> : "—",
    ],
    [
      t("platform.form.email"),
      facility.email ? <a href={`mailto:${facility.email}`}>{facility.email}</a> : "—",
    ],
    [t("platform.form.address"), facility.address || "—"],
    [
      t("platform.review.location"),
      [place.village, place.cell, place.sector, place.district, place.province]
        .filter(Boolean)
        .join(", ") || "—",
    ],
    [
      t("platform.review.mapPin"),
      facility.latitude !== null && facility.longitude !== null ? (
        <a
          href={`https://www.openstreetmap.org/?mlat=${facility.latitude}&mlon=${facility.longitude}#map=17/${facility.latitude}/${facility.longitude}`}
          target="_blank"
          rel="noreferrer"
        >
          {`${facility.latitude}, ${facility.longitude}`}
        </a>
      ) : (
        "—"
      ),
    ],
    [t("platform.facilities.photos"), String(facility.photo_count)],
  ];
  const professions = Object.entries(facility.staff_by_profession);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card padding="md" className="flex flex-col gap-3">
        <h2 className="m-0 font-heading text-h4 font-bold">{t("platform.facilities.identity")}</h2>
        <Facts rows={rows} />
      </Card>
      <Card padding="md" className="flex flex-col gap-3">
        <h2 className="m-0 font-heading text-h4 font-bold">{t("platform.facilities.contact")}</h2>
        <Facts rows={contact} />
      </Card>
      <Card padding="md" className="flex flex-col gap-3">
        <h2 className="m-0 font-heading text-h4 font-bold">{t("platform.facilities.inCharge")}</h2>
        {facility.admins.length === 0 ? (
          <p className="m-0 text-fg-muted">{t("platform.facilities.noAdmin")}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {facility.admins.map((a) => (
              <li key={a.email} className="flex flex-col">
                <Link to={`/platform/users/${a.user_id}`} className="font-semibold">
                  {a.name}
                </Link>
                <span className="text-body-sm text-fg-secondary">
                  <a href={`mailto:${a.email}`}>{a.email}</a>
                  {a.phone && (
                    <>
                      {" · "}
                      <a href={`tel:${a.phone}`}>{a.phone}</a>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {facility.application && (
          <p className="m-0 text-body-sm text-fg-secondary">
            {t("platform.facilities.application")}:{" "}
            <Link to={`/platform/applications/${facility.application.id}`}>
              {facility.application.applicant_name}
            </Link>
          </p>
        )}
      </Card>
      <Card padding="md" className="flex flex-col gap-3">
        <h2 className="m-0 font-heading text-h4 font-bold">{t("platform.facilities.staff")}</h2>
        <p className="m-0 text-body-sm text-fg-secondary">
          {t("platform.facilities.staffCount", { count: facility.staff_count })}
          {facility.doctor_count > 0 &&
            ` · ${t("platform.facilities.doctorsChecked", {
              checked: facility.doctors_attested,
              count: facility.doctor_count,
            })}`}
        </p>
        {professions.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-body-sm">
            {professions.map(([code, count]) => (
              <li key={code} className="flex justify-between gap-3">
                <span>
                  {t(`setup.professions.${code}`, {
                    defaultValue: t("platform.facilities.professionUnknown"),
                  })}
                </span>
                <span className="font-semibold">{count}</span>
              </li>
            ))}
          </ul>
        )}
        <Link to={`/platform/users?facility=${facility.id}`} className="text-body-sm font-semibold">
          {t("platform.facilities.seeStaff")}
        </Link>
      </Card>
    </div>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-fg-muted">{label}</dt>
          <dd className="m-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The government identifiers, often known only after approval (step-up, audit-logged). */
function IdentifiersForm({ facility }: { facility: PlatformFacilityDetail }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const [form, setForm] = useState({
    moh_facility_code: facility.moh_facility_code,
    tin: facility.tin,
  });
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      withStepUp(() => api.onboarding.platform.updateFacilityIdentifiers(facility.id, form)),
    onSuccess: (next) => {
      queryClient.setQueryData(["platform", "facility", facility.id], next);
      setSaved(true);
    },
  });
  const field = (name: "moh_facility_code" | "tin") =>
    isApiError(save.error) ? save.error.fieldError(name) : undefined;
  const changed =
    form.moh_facility_code !== facility.moh_facility_code || form.tin !== facility.tin;
  function submit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    save.mutate();
  }
  return (
    <Card padding="md" className="flex flex-col gap-3">
      <h2 className="m-0 font-heading text-h4 font-bold">{t("platform.facilities.identifiers")}</h2>
      <p className="m-0 text-body-sm text-fg-secondary">
        {t("platform.facilities.identifiersHint")}
      </p>
      <form
        noValidate
        onSubmit={submit}
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      >
        <TextField
          label={t("platform.review.mohCode")}
          value={form.moh_facility_code}
          onChange={(e) => setForm((f) => ({ ...f, moh_facility_code: e.target.value }))}
          error={field("moh_facility_code")}
        />
        <TextField
          label={t("platform.review.tin")}
          inputMode="numeric"
          maxLength={9}
          value={form.tin}
          onChange={(e) => setForm((f) => ({ ...f, tin: e.target.value }))}
          error={field("tin")}
        />
        <Button type="submit" disabled={!changed || save.isPending}>
          {t("platform.facilities.saveIdentifiers")}
        </Button>
      </form>
      {saved && !changed && (
        <Alert tone="success" role="status">
          {t("platform.facilities.identifiersSaved")}
        </Alert>
      )}
      {save.isError &&
        !field("moh_facility_code") &&
        !field("tin") &&
        actionError(save.error, "") !== undefined && (
          <Alert tone="danger" role="alert">
            {actionError(save.error, t("platform.table.error"))}
          </Alert>
        )}
    </Card>
  );
}

function StatusActionDialog({
  facility,
  action,
  onClose,
}: {
  facility: PlatformFacilityDetail;
  action: FacilityAction;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const idem = useIdempotencyKey();
  const reasonKind = REASON_KIND[action];
  const reasons = useReasons(reasonKind ?? "none");
  const [reason, setReason] = useState("");
  const [confirmSlug, setConfirmSlug] = useState("");
  const [error, setError] = useState<string | undefined>();
  const run = useMutation({
    mutationFn: (text: string) =>
      withStepUp(() =>
        api.onboarding.platform.facilityAction(
          facility.id,
          action,
          {
            version: facility.version,
            ...(reasonKind ? { reason_code: reason, reason_text: text } : {}),
            ...(action === "deactivate" ? { confirm_slug: confirmSlug } : {}),
          },
          idem.current(),
        ),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform"] });
      onClose();
    },
    onError: (failure) => setError(actionError(failure, t("errors.generic"))),
  });
  const requiresText = reasons.find((r) => r.code === reason)?.requires_text ?? false;
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t(`platform.facilities.actions.${action}`)}
      consequences={t(`platform.facilities.consequences.${action}`, { name: facility.name })}
      confirmLabel={t(`platform.facilities.actions.${action}`)}
      cancelLabel={t("lock.cancel")}
      closeLabel={t("lock.close")}
      tone={action === "deactivate" || action === "suspend" ? "danger" : "primary"}
      {...(reasonKind
        ? {
            reasonLabel: t("platform.reason.text"),
            reasonRequired: requiresText,
            reasonRequiredMessage: t("platform.reason.textRequired"),
          }
        : {})}
      busy={run.isPending}
      error={error}
      onConfirm={(text) => {
        if (reasonKind && !reason) {
          setError(t("platform.reason.required"));
          return;
        }
        run.mutate(text);
      }}
    >
      {reasonKind && <ReasonSelect reasons={reasons} value={reason} onChange={setReason} />}
      {action === "deactivate" && (
        <TextField
          label={t("platform.facilities.confirmSlug", { slug: facility.slug })}
          value={confirmSlug}
          onChange={(e) => setConfirmSlug(e.target.value)}
        />
      )}
    </ConfirmDialog>
  );
}

function LicencesTab({ facility }: { facility: PlatformFacilityDetail }) {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const licences = useQuery({
    queryKey: ["platform", "facility", facility.id, "licences"],
    queryFn: () => api.onboarding.platform.licences(facility.id),
  });
  const [editing, setEditing] = useState<{
    mode: "add" | "renew" | "correct";
    licence?: Licence;
  } | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button onClick={() => setEditing({ mode: "add" })}>{t("platform.licences.add")}</Button>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {(licences.data ?? []).map((l) => (
          <Card
            as="li"
            key={l.id}
            padding="md"
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex flex-col">
              <span className="font-semibold">
                {t(`platform.licences.kind.${l.kind}`)} · {l.number}
              </span>
              <span className="text-body-sm text-fg-secondary">
                {t("platform.review.expires", { date: formatDate(l.expires_on, locale) })}
                {l.superseded_at && ` · ${t("platform.licences.superseded")}`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!l.superseded_at && <StatusBadge kind="licence" value={l.state} />}
              {!l.superseded_at && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => setEditing({ mode: "renew", licence: l })}
                  >
                    {t("platform.licences.renew")}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setEditing({ mode: "correct", licence: l })}
                  >
                    {t("platform.licences.correct")}
                  </Button>
                </>
              )}
            </div>
          </Card>
        ))}
      </ul>
      {editing && (
        <LicenceDialog facilityId={facility.id} {...editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function LicenceDialog({
  facilityId,
  mode,
  licence,
  onClose,
}: {
  facilityId: string;
  mode: "add" | "renew" | "correct";
  licence?: Licence;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const [values, setValues] = useState({
    kind: licence?.kind ?? "moh_operating",
    number: mode === "correct" ? (licence?.number ?? "") : "",
    expires_on: mode === "correct" ? (licence?.expires_on ?? "") : "",
  });
  const [error, setError] = useState<string | undefined>();
  const save = useMutation({
    mutationFn: () =>
      withStepUp(() =>
        mode === "correct" && licence
          ? api.onboarding.platform.correctLicence(facilityId, licence.id, {
              version: licence.version,
              number: values.number,
              expires_on: values.expires_on,
            })
          : api.onboarding.platform.addLicence(facilityId, {
              kind: values.kind,
              number: values.number,
              expires_on: values.expires_on,
              ...(mode === "renew" && licence ? { renews_licence_id: licence.id } : {}),
            }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform", "facility", facilityId] });
      void queryClient.invalidateQueries({ queryKey: ["platform", "facilities"] });
      onClose();
    },
    onError: (failure) => setError(actionError(failure, t("errors.generic"))),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!values.number.trim() || !values.expires_on) {
      setError(t("platform.review.approveRequired"));
      return;
    }
    save.mutate();
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t(`platform.licences.${mode}`)}
      closeLabel={t("lock.close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("lock.cancel")}
          </Button>
          <Button type="submit" form="licence-form" loading={save.isPending}>
            {t("platform.licences.save")}
          </Button>
        </>
      }
    >
      <form id="licence-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {mode === "add" && (
          <SelectField
            label={t("platform.licences.kindLabel")}
            value={values.kind}
            onChange={(e) => setValues((v) => ({ ...v, kind: e.target.value as LicenceKind }))}
          >
            {(
              ["moh_operating", "pharmacy", "rdb_registration", "accreditation", "other"] as const
            ).map((k) => (
              <option key={k} value={k}>
                {t(`platform.licences.kind.${k}`)}
              </option>
            ))}
          </SelectField>
        )}
        <TextField
          label={t("platform.review.licenceNumber")}
          value={values.number}
          onChange={(e) => setValues((v) => ({ ...v, number: e.target.value }))}
        />
        <TextField
          label={t("platform.review.licenceExpiry")}
          type="date"
          value={values.expires_on}
          onChange={(e) => setValues((v) => ({ ...v, expires_on: e.target.value }))}
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

function HistoryTab({ id, locale }: { id: string; locale: string }) {
  const { t } = useTranslation();
  const api = useApi();
  const events = useQuery({
    queryKey: ["platform", "facility", id, "events"],
    queryFn: () => api.onboarding.platform.statusEvents(id),
  });
  return (
    <Timeline
      locale={locale}
      events={(events.data ?? []).map((e) => ({
        id: e.id,
        at: e.occurred_at,
        title: t(`platform.status.facility.${e.to_status}`),
        actor: e.actor?.full_name,
        text: [e.reason_label, e.reason_text].filter(Boolean).join(" — ") || undefined,
      }))}
    />
  );
}

function FlagsTab({ id }: { id: string }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const flags = useQuery({
    queryKey: ["platform", "facility", id, "flags"],
    queryFn: () => api.onboarding.platform.facilityFlags(id),
  });
  const [error, setError] = useState<string | undefined>();
  const toggle = useMutation({
    mutationFn: ({ flag, on }: { flag: FacilityFeatureFlag; on: boolean }) =>
      withStepUp(() => api.onboarding.platform.setFacilityFlag(id, flag.code, { is_enabled: on })),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["platform", "facility", id, "flags"] }),
    onError: (failure) => setError(actionError(failure, t("errors.generic"))),
  });
  const reset = useMutation({
    mutationFn: (code: string) =>
      withStepUp(() => api.onboarding.platform.clearFacilityFlag(id, code)),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["platform", "facility", id, "flags"] }),
    onError: (failure) => setError(actionError(failure, t("errors.generic"))),
  });
  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
      {(flags.data ?? []).map((flag) => (
        <Card key={flag.code} padding="md" className="flex flex-col gap-2">
          <SwitchField
            label={t(`platform.flags.names.${flag.code}`, { defaultValue: flag.code })}
            hint={
              flag.source === "default"
                ? t("platform.flags.usingDefault")
                : t("platform.flags.overridden")
            }
            checked={flag.is_enabled}
            stateLabel={flag.is_enabled ? t("platform.flags.on") : t("platform.flags.off")}
            onCheckedChange={(on) => toggle.mutate({ flag, on })}
          />
          {flag.source === "override" && (
            <div>
              <Button variant="ghost" onClick={() => reset.mutate(flag.code)}>
                {t("platform.flags.useDefault")}
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
