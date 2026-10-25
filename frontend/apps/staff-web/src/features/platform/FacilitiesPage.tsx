import type {
  FacilityAction,
  FacilityFeatureFlag,
  Licence,
  LicenceKind,
  PlatformFacility,
  PlatformFacilityDetail,
} from "@medilink/api-client";
import {
  Alert,
  Button,
  Card,
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
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
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
    queryKey: ["platform", "facilities", status, licenceState, q, page],
    queryFn: () =>
      api.onboarding.platform.facilities({
        status,
        licence_state: licenceState,
        q,
        page,
        page_size: 50,
      }),
    placeholderData: keepPreviousData,
  });
  const columns = useMemo<ColumnDef<PlatformFacility, unknown>[]>(
    () => [
      { accessorKey: "name", header: t("platform.facilities.name"), enableSorting: false },
      {
        accessorKey: "status",
        header: t("platform.applications.status"),
        enableSorting: false,
        cell: ({ row }) => <StatusBadge kind="facility" value={row.original.status} />,
      },
      { accessorKey: "facility_type", header: t("platform.review.type"), enableSorting: false },
      {
        id: "district",
        header: t("platform.facilities.district"),
        enableSorting: false,
        cell: ({ row }) => row.original.district?.name ?? "—",
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
      <PageHeader title={t("platform.facilities.title")} />
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
        onClearFilters={() => update({ status: "", licence_state: "", q: "" })}
        toolbar={
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
        }
        rowActions={(row) => (
          <Link
            to={`/platform/facilities/${row.id}`}
            className={buttonClassName({ variant: "secondary" })}
            aria-label={`${t("platform.table.open")}: ${row.name}`}
          >
            {t("platform.table.open")}
          </Link>
        )}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        filtered={Boolean(q || status || licenceState)}
      />
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
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-fg-muted">{t("platform.facilities.address")}</dt>
            <dd className="m-0">{data.slug}</dd>
            <dt className="text-fg-muted">{t("platform.review.type")}</dt>
            <dd className="m-0">{data.facility_type}</dd>
            <dt className="text-fg-muted">{t("platform.facilities.district")}</dt>
            <dd className="m-0">{data.district?.name ?? "—"}</dd>
            <dt className="text-fg-muted">{t("platform.facilities.licence")}</dt>
            <dd className="m-0">
              <StatusBadge kind="licence" value={data.licence_state} />
            </dd>
            {data.application && (
              <>
                <dt className="text-fg-muted">{t("platform.facilities.application")}</dt>
                <dd className="m-0">
                  <Link to={`/platform/applications/${data.application.id}`}>
                    {data.application.applicant_name}
                  </Link>
                </dd>
              </>
            )}
          </dl>
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
