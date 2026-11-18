import {
  isApiError,
  type FacilityAction,
  type FacilityDetailsUpdate,
  type RoleCode,
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
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  SelectField,
  SwitchField,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextareaField,
  TextField,
  Timeline,
  buttonClassName,
  cx,
  type ColumnDef,
} from "@medilink/ui";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";

import {
  ArrowLeft,
  DotsThree,
  EnvelopeSimple,
  Pause,
  PencilSimple,
  Prohibit,
  UserPlus,
  WarningCircle,
} from "@phosphor-icons/react";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { env } from "../../env";
import { roleLabel } from "../../facility/labels";
import { Avatar, StatusDot, useRelative } from "../console/shared";
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
  const noAdmin = params.get("no_admin") === "true";
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
      noAdmin,
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
        ...(noAdmin ? { no_admin: true } : {}),
        q,
        page,
        page_size: 50,
      }),
    placeholderData: keepPreviousData,
  });
  const summary = useQuery({
    queryKey: ["platform", "facilities", "summary"],
    queryFn: () => api.onboarding.platform.facilitiesSummary(),
  });
  const counts = summary.data;
  const columns = useMemo<ColumnDef<PlatformFacility, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("platform.facilities.name"),
        meta: { cellClassName: "min-w-52 whitespace-nowrap" },
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex items-center gap-3">
            <FacilityMark facility={row.original} />
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold text-fg">{row.original.name}</span>
              <span className="text-body-sm text-fg-muted">
                {row.original.moh_facility_code
                  ? `FOSA ${row.original.moh_facility_code}`
                  : t("platform.facilities.noCode")}
              </span>
            </span>
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: t("platform.applications.status"),
        meta: { cellClassName: "whitespace-nowrap" },
        enableSorting: false,
        cell: ({ row }) => <StatusBadge kind="facility" value={row.original.status} />,
      },
      {
        accessorKey: "facility_type",
        header: t("platform.review.type"),
        meta: { cellClassName: "whitespace-nowrap" },
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
        meta: { cellClassName: "whitespace-nowrap" },
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
        meta: { cellClassName: "whitespace-nowrap" },
        enableSorting: false,
        cell: ({ row }) => {
          const admin = row.original.admins[0];
          return admin ? (
            <span className="flex flex-col">
              <span>{admin.name}</span>
              <span className="text-body-sm text-fg-muted">{admin.phone || admin.email}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-semibold text-attention">
              <WarningCircle aria-hidden="true" weight="fill" className="size-4" />
              {t("platform.facilities.noAdmin")}
            </span>
          );
        },
      },
      {
        id: "staff",
        header: t("platform.facilities.staff"),
        meta: { cellClassName: "min-w-44" },
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
        meta: { cellClassName: "whitespace-nowrap" },
        enableSorting: false,
        cell: ({ row }) => <StatusBadge kind="licence" value={row.original.licence_state} />,
      },
      {
        accessorKey: "next_licence_expiry",
        header: t("platform.facilities.nextExpiry"),
        meta: { cellClassName: "whitespace-nowrap" },
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
    ...(noAdmin
      ? [
          {
            id: "no_admin",
            label: t("platform.facilities.noAdminFilter"),
            onRemove: () => update({ no_admin: "" }),
          },
        ]
      : []),
  ];
  const attention = counts
    ? (
        [
          ["noAdmin", counts.no_admin, { no_admin: "true" }],
          ["expired", counts.licence_expired, { licence_state: "expired" }],
          ["expiring", counts.licence_expiring, { licence_state: "expiring" }],
          ["missingCode", counts.missing_code, { missing_code: "true" }],
        ] as const
      ).filter(([, count]) => count > 0)
    : [];
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
      <div className="flex flex-col gap-3">
        <div
          role="group"
          aria-label={t("platform.applications.status")}
          className="inline-flex max-w-full flex-wrap gap-1 self-start rounded-full bg-subtle p-1"
        >
          {STATUS_TABS.map((key) => {
            const count = counts
              ? key === ""
                ? counts.total
                : (counts.by_status[key] ?? 0)
              : undefined;
            return (
              <button
                key={key || "all"}
                type="button"
                aria-pressed={status === key}
                onClick={() => update({ status: key })}
                className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full px-4 text-body-sm font-semibold text-fg-secondary transition-[background-color,color,box-shadow] duration-200 ease-out-quint hover:text-fg aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-card"
              >
                {key ? t(`platform.status.facility.${key}`) : t("platform.applications.all")}
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
            <span className="text-fg-secondary">{t("platform.facilities.attention")}</span>
            {attention.map(([key, count, next]) => (
              <button
                key={key}
                type="button"
                onClick={() => update({ ...next })}
                className="cursor-pointer font-semibold text-link underline-offset-2 hover:underline"
              >
                {t(`platform.facilities.attentionItems.${key}`, { count })}
              </button>
            ))}
          </p>
        )}
      </div>
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
            no_admin: "",
            q: "",
          })
        }
        toolbar={
          <>
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
        filtered={Boolean(
          q || status || licenceState || facilityType || ownership || missingCode || noAdmin,
        )}
      />
    </div>
  );
}

const STATUS_TABS = ["", "live", "setup", "approved", "suspended", "deactivated"] as const;

/** The facility's logo, else its initials on a tinted tile. */
function FacilityMark({
  facility,
  size = "md",
}: {
  facility: Pick<PlatformFacility, "name" | "logo_url">;
  size?: "md" | "lg";
}) {
  const box = size === "lg" ? "size-14 rounded-2xl text-body" : "size-10 rounded-xl text-caption";
  if (facility.logo_url)
    return (
      <img
        src={facility.logo_url}
        alt=""
        className={`${box} shrink-0 bg-surface object-contain ring-1 ring-border/70`}
      />
    );
  const initials = facility.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!)
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={`${box} grid shrink-0 place-items-center bg-brand-subtle font-heading font-bold text-on-brand-subtle`}
    >
      {initials}
    </span>
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
  const [editing, setEditing] = useState(false);
  if (facility.isPending) return <LoadingState />;
  if (facility.isError) return <Alert tone="danger">{t("platform.table.error")}</Alert>;
  const data = facility.data;
  const actions = ACTIONS[data.status] ?? [];
  const forward = actions.filter((a) => a !== "deactivate" && a !== "suspend");
  const risky = actions.filter((a) => a === "deactivate" || a === "suspend");
  const place = [data.location.sector, data.location.district || data.district?.name]
    .filter(Boolean)
    .join(", ");
  return (
    <div className="flex flex-col gap-5">
      <Link
        to="/platform/facilities"
        className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-full px-3 text-body-sm font-semibold text-fg-secondary no-underline hover:bg-subtle hover:text-fg"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t("platform.facilities.back")}
      </Link>
      {/* identity band: the cover photo when there is one, the logo, name, status and place */}
      <section className="overflow-hidden rounded-2xl bg-surface shadow-card">
        {data.cover_url && (
          <img
            src={data.cover_url}
            alt=""
            className="block aspect-[16/4] w-full object-cover"
            decoding="async"
          />
        )}
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <FacilityMark facility={data} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 font-heading text-h2 font-bold tracking-tight">{data.name}</h1>
              <StatusBadge kind="facility" value={data.status} />
            </div>
            <p className="m-0 text-body-sm text-fg-secondary">
              {[
                t(`facility.types.${data.facility_type}`, { defaultValue: data.facility_type }),
                t(`platform.ownership.${data.ownership}`, { defaultValue: data.ownership }),
                place,
                data.moh_facility_code ? `FOSA ${data.moh_facility_code}` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.status !== "deactivated" && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <PencilSimple aria-hidden="true" className="size-4" />
                {t("platform.facilities.edit")}
              </Button>
            )}
            {forward.map((a) => (
              <Button key={a} onClick={() => setAction(a)}>
                {t(`platform.facilities.actions.${a}`)}
              </Button>
            ))}
            {risky.length > 0 && (
              <Menu>
                <MenuTrigger
                  aria-label={t("platform.facilities.more")}
                  className={buttonClassName({ variant: "secondary", className: "px-3" })}
                >
                  <DotsThree aria-hidden="true" weight="bold" className="size-5" />
                </MenuTrigger>
                <MenuContent align="end">
                  {risky.map((a) => (
                    <MenuItem key={a} onSelect={() => setAction(a)} className="text-danger">
                      {a === "suspend" ? (
                        <Pause aria-hidden="true" className="size-5" />
                      ) : (
                        <Prohibit aria-hidden="true" className="size-5" />
                      )}
                      {t(`platform.facilities.actions.${a}`)}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
            )}
          </div>
        </div>
      </section>
      {data.admins.length === 0 && data.status !== "deactivated" && (
        <Alert tone="warning">{t("platform.facilities.noAdminAlert")}</Alert>
      )}
      <Tabs defaultValue="overview">
        <TabsList aria-label={data.name}>
          <TabsTrigger value="overview">{t("platform.facilities.tabs.overview")}</TabsTrigger>
          <TabsTrigger value="staff">
            {t("platform.facilities.tabs.staff")}
            <span className="font-normal text-fg-muted tabular-nums">{data.staff_count}</span>
          </TabsTrigger>
          <TabsTrigger value="licences">{t("platform.facilities.tabs.licences")}</TabsTrigger>
          <TabsTrigger value="history">{t("platform.facilities.tabs.history")}</TabsTrigger>
          <TabsTrigger value="flags">{t("platform.facilities.tabs.flags")}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="flex flex-col gap-4">
          <FacilityOverview facility={data} />
          <IdentifiersForm facility={data} />
        </TabsContent>
        <TabsContent value="staff">
          <StaffTab facility={data} />
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
      {editing && <EditDetailsDialog facility={data} onClose={() => setEditing(false)} />}
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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
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
      <form
        noValidate
        onSubmit={submit}
        className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
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

/** Everyone with access to the facility and pending invitations; invite a person, e.g. a new
 * facility admin when the last one left (step-up, reason). */
function StaffTab({ facility }: { facility: PlatformFacilityDetail }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const relative = useRelative();
  const [inviting, setInviting] = useState(false);
  const staff = useQuery({
    queryKey: ["platform", "facility", facility.id, "staff"],
    queryFn: () => api.onboarding.platform.facilityStaff(facility.id),
  });
  const cancel = useMutation({
    mutationFn: (invitationId: string) =>
      withStepUp(() => api.onboarding.platform.cancelFacilityInvitation(facility.id, invitationId)),
    onSuccess: (data) =>
      queryClient.setQueryData(["platform", "facility", facility.id, "staff"], data),
  });
  if (staff.isPending) return <LoadingState />;
  if (staff.isError) return <Alert tone="danger">{t("platform.table.error")}</Alert>;
  const { members, invitations } = staff.data;
  const active = members.filter((m) => m.is_active);
  const removed = members.filter((m) => !m.is_active);
  const canInvite = facility.status !== "deactivated";
  return (
    <div className="flex flex-col gap-4">
      <Card padding="none" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="min-w-0">
            <h2 className="m-0 font-heading text-h4 font-bold">
              {t("platform.facilities.staffTitle")}
            </h2>
          </div>
          {canInvite && (
            <Button onClick={() => setInviting(true)}>
              <UserPlus aria-hidden="true" className="size-4" />
              {t("platform.facilities.invite")}
            </Button>
          )}
        </div>
        {active.length === 0 ? (
          <p className="m-0 px-5 py-6 text-body-sm text-fg-muted">
            {t("platform.facilities.noStaff")}
          </p>
        ) : (
          <ul className="m-0 list-none divide-y divide-border/60 p-0">
            {[...active, ...removed].map((m) => (
              <li
                key={m.membership_id}
                className={cx(
                  "flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:gap-4",
                  !m.is_active && "opacity-60",
                )}
              >
                <Avatar name={m.name} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link
                    to={`/platform/users/${m.user_id}`}
                    className="truncate font-semibold text-fg no-underline hover:underline"
                  >
                    {m.name}
                  </Link>
                  <span className="truncate text-body-sm text-fg-muted">{m.email}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 sm:w-64">
                  {m.roles.map((r) => (
                    <span
                      key={r}
                      className={cx(
                        "rounded-full px-2.5 py-0.5 text-caption font-semibold",
                        r === "facility_admin"
                          ? "bg-brand-subtle text-on-brand-subtle"
                          : "bg-subtle text-fg-secondary",
                      )}
                    >
                      {roleLabel(r as RoleCode, t)}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-4 sm:w-56 sm:justify-end">
                  {m.is_active ? (
                    <StatusDot tone={m.mfa_enabled ? "success" : "warning"}>
                      {m.mfa_enabled
                        ? t("platform.facilities.twoStepOn")
                        : t("platform.facilities.twoStepOff")}
                    </StatusDot>
                  ) : (
                    <StatusDot tone="muted">{t("platform.facilities.removed")}</StatusDot>
                  )}
                  <span className="text-body-sm whitespace-nowrap text-fg-muted tabular-nums">
                    {relative(m.last_login)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {invitations.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <h2 className="m-0 border-b border-border/60 px-5 py-4 font-heading text-h4 font-bold">
            {t("platform.facilities.pending", { count: invitations.length })}
          </h2>
          <ul className="m-0 list-none divide-y divide-border/60 p-0">
            {invitations.map((i) => (
              <li
                key={i.id}
                className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:gap-4"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-subtle text-fg-muted">
                  <EnvelopeSimple aria-hidden="true" className="size-5" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{i.full_name || i.email}</span>
                  <span className="truncate text-body-sm text-fg-muted">
                    {i.full_name ? `${i.email} · ` : ""}
                    {i.role_codes.map((r) => roleLabel(r as RoleCode, t)).join(", ")}
                  </span>
                </div>
                <span className="text-body-sm text-fg-muted">
                  {t("platform.facilities.expires", { when: relative(i.expires_at) })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={cancel.isPending && cancel.variables === i.id}
                  onClick={() => cancel.mutate(i.id)}
                >
                  {t("platform.facilities.cancelInvite")}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {cancel.isError && (
        <Alert tone="danger" role="alert">
          {actionError(cancel.error, t("errors.generic"))}
        </Alert>
      )}
      {inviting && (
        <InviteDialog
          facility={facility}
          noAdmin={!active.some((m) => m.roles.includes("facility_admin"))}
          onClose={() => setInviting(false)}
        />
      )}
    </div>
  );
}

function InviteDialog({
  facility,
  noAdmin,
  onClose,
}: {
  facility: PlatformFacilityDetail;
  noAdmin: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roles, setRoles] = useState<RoleCode[]>(noAdmin ? ["facility_admin"] : []);
  const [reason, setReason] = useState("");
  const invite = useMutation({
    mutationFn: () =>
      withStepUp(() =>
        api.onboarding.platform.inviteToFacility(facility.id, {
          email: email.trim(),
          full_name: name.trim(),
          role_codes: roles,
          reason: reason.trim(),
        }),
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(["platform", "facility", facility.id, "staff"], data);
      onClose();
    },
  });
  const fields = isApiError(invite.error) ? invite.error : null;
  const ready = email.includes("@") && roles.length > 0 && reason.trim().length >= 5;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("platform.facilities.inviteTitle", { name: facility.name })}
      closeLabel={t("platform.table.close", { defaultValue: "Close" })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("platform.facilities.cancel")}
          </Button>
          <Button type="submit" form="invite-form" loading={invite.isPending} disabled={!ready}>
            {t("platform.facilities.sendInvite")}
          </Button>
        </>
      }
    >
      <form
        id="invite-form"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) invite.mutate();
        }}
      >
        <TextField
          label={t("platform.form.email")}
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fields?.fieldError("email") ?? undefined}
        />
        <TextField
          label={t("platform.facilities.fullName")}
          optional
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 font-semibold">{t("platform.facilities.roles")}</legend>
          <div className="flex flex-wrap gap-2">
            {ROLE_CODES.map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={roles.includes(code)}
                onClick={() =>
                  setRoles(
                    roles.includes(code) ? roles.filter((r) => r !== code) : [...roles, code],
                  )
                }
                className="min-h-9 cursor-pointer rounded-full border border-border bg-surface px-3.5 text-body-sm font-semibold text-fg-secondary transition-colors hover:text-fg aria-pressed:border-primary aria-pressed:bg-brand-subtle aria-pressed:text-on-brand-subtle"
              >
                {roleLabel(code, t)}
              </button>
            ))}
          </div>
        </fieldset>
        <TextareaField
          label={t("platform.reason.text")}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={fields?.fieldError("reason") ?? undefined}
        />
        {invite.isError && !fields?.fieldError("email") && (
          <Alert tone="danger" role="alert">
            {actionError(invite.error, t("errors.generic"))}
          </Alert>
        )}
      </form>
    </Dialog>
  );
}

/** Platform-managed facts the facility can't change itself; each change needs a reason. */
function EditDetailsDialog({
  facility,
  onClose,
}: {
  facility: PlatformFacilityDetail;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const [name, setName] = useState(facility.name);
  const [type, setType] = useState(facility.facility_type);
  const [ownership, setOwnership] = useState(facility.ownership);
  const [level, setLevel] = useState(facility.level_of_care || "");
  const [reason, setReason] = useState("");
  const body: FacilityDetailsUpdate = { reason: reason.trim() };
  if (name.trim() !== facility.name) body.name = name.trim();
  if (type !== facility.facility_type) body.facility_type = type;
  if (ownership !== facility.ownership) body.ownership = ownership;
  if (level && level !== facility.level_of_care)
    body.level_of_care = level as FacilityDetailsUpdate["level_of_care"];
  const changed = Object.keys(body).length > 1;
  const save = useMutation({
    mutationFn: () =>
      withStepUp(() => api.onboarding.platform.updateFacilityDetails(facility.id, body)),
    onSuccess: (data) => {
      queryClient.setQueryData(["platform", "facility", facility.id], data);
      void queryClient.invalidateQueries({ queryKey: ["platform", "facilities"] });
      onClose();
    },
  });
  const fields = isApiError(save.error) ? save.error : null;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("platform.facilities.editTitle")}
      closeLabel={t("platform.table.close", { defaultValue: "Close" })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("platform.facilities.cancel")}
          </Button>
          <Button
            type="submit"
            form="details-form"
            loading={save.isPending}
            disabled={!changed || reason.trim().length < 5 || name.trim().length < 2}
          >
            {t("platform.facilities.saveDetails")}
          </Button>
        </>
      }
    >
      <form
        id="details-form"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed) save.mutate();
        }}
      >
        <TextField
          label={t("platform.facilities.name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fields?.fieldError("name") ?? undefined}
        />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
          <SelectField
            label={t("platform.review.type")}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {FACILITY_TYPES.map((code) => (
              <option key={code} value={code}>
                {t(`facility.types.${code}`, { defaultValue: code })}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("platform.review.ownership")}
            value={ownership}
            onChange={(e) => setOwnership(e.target.value)}
          >
            {(["public", "private", "faith_based", "ngo"] as const).map((o) => (
              <option key={o} value={o}>
                {t(`platform.ownership.${o}`)}
              </option>
            ))}
          </SelectField>
        </div>
        <SelectField
          label={t("platform.review.levelOfCare")}
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          {!level && <option value="">—</option>}
          {(["primary", "secondary", "tertiary"] as const).map((l) => (
            <option key={l} value={l}>
              {t(`platform.review.level.${l}`)}
            </option>
          ))}
        </SelectField>
        <p className="m-0 text-body-sm text-fg-muted">
          {t("platform.facilities.slugFixed", { slug: facility.slug })}
        </p>
        <TextareaField
          label={t("platform.reason.text")}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={fields?.fieldError("reason") ?? undefined}
        />
        {save.isError && !fields?.fieldError("reason") && (
          <Alert tone="danger" role="alert">
            {actionError(save.error, t("errors.generic"))}
          </Alert>
        )}
      </form>
    </Dialog>
  );
}

const ROLE_CODES: RoleCode[] = [
  "facility_admin",
  "doctor",
  "receptionist",
  "pharmacist",
  "cashier",
  "triage_nurse",
  "lab_technician",
];
