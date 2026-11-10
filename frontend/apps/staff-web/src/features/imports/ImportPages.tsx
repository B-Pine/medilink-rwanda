import {
  isApiError,
  PATIENT_IMPORT_FIELDS,
  PATIENT_IMPORT_PURPOSE,
  PATIENT_IMPORT_REQUIRED,
  type PatientImportBatch,
  type PatientImportField,
  type PatientImportMapping,
  type PatientImportRowStatus,
} from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  cx,
  EmptyState,
  FileUpload,
  LoadingState,
  SelectField,
  type BadgeTone,
  type FileUploadItem,
} from "@medilink/ui";
import { dateFormat } from "@medilink/ui/i18n";
import { UsersThree } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { useStepUp } from "../lock/StepUp";

/**
 * /settings/patient-import (S6-F7, FR-PAT-10): bring a paper or spreadsheet register in. Upload a
 * CSV → map its columns → check every row (problems and likely duplicates; nothing is created) →
 * import the ready rows (step-up) → roll back within 7 days while no imported patient has a visit.
 */
export const importKeys = {
  list: ["patient-imports", "list"] as const,
  one: (id: string) => ["patient-imports", id] as const,
  rows: (id: string, status: string) => ["patient-imports", id, "rows", status] as const,
};

const MAX_BYTES = 5 * 1024 * 1024;
const STATUS_TONE: Record<PatientImportBatch["status"], BadgeTone> = {
  uploaded: "info",
  previewed: "warning",
  confirmed: "success",
  rolled_back: "neutral",
  failed: "danger",
};
const ROW_TONE: Record<PatientImportRowStatus, BadgeTone> = {
  pending: "neutral",
  valid: "success",
  error: "danger",
  duplicate: "warning",
  created: "success",
  rolled_back: "neutral",
};

const errorText = (error: unknown, fallback: string) =>
  isApiError(error) ? error.message : fallback;

function useWhen() {
  const { i18n } = useTranslation();
  return (iso: string) =>
    dateFormat(i18n.resolvedLanguage ?? "rw", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Kigali",
    }).format(new Date(iso));
}

export function PatientImportPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const batchId = params.get("batch");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("imports.title")}
        back={batchId ? { to: "/settings/patient-import", label: t("imports.title") } : undefined}
      />
      {batchId ? <Batch id={batchId} /> : <Start onStarted={(id) => setParams({ batch: id })} />}
    </div>
  );
}

/** Upload a CSV (S1 pipeline, scanned), then open the import it starts; earlier imports below. */
function Start({ onStarted }: { onStarted: (id: string) => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const when = useWhen();
  const [item, setItem] = useState<FileUploadItem | null>(null);
  const [error, setError] = useState<string | undefined>();
  const list = useQuery({ queryKey: importKeys.list, queryFn: () => api.patientImports.list() });

  async function send(file: File) {
    const key = crypto.randomUUID();
    setError(undefined);
    setItem({ id: key, name: file.name, status: "uploading", progress: 0 });
    try {
      let upload = await api.uploads.staff.upload(PATIENT_IMPORT_PURPOSE, file, {
        onProgress: (progress) => setItem((i) => (i ? { ...i, progress } : i)),
      });
      for (let i = 0; i < 20 && upload.status === "pending"; i += 1) {
        setItem({ id: key, name: file.name, status: "pending" });
        await new Promise((resolve) => setTimeout(resolve, 500));
        upload = await api.uploads.staff.get(upload.id);
      }
      setItem({ id: key, name: file.name, status: upload.status });
      if (upload.status !== "clean") return;
      const batch = await api.patientImports.start(upload.id);
      queryClient.setQueryData(importKeys.one(batch.id), batch);
      void queryClient.invalidateQueries({ queryKey: importKeys.list });
      onStarted(batch.id);
    } catch (failure) {
      const message = isApiError(failure)
        ? (failure.fieldError("file") ?? failure.message)
        : t("imports.failed");
      setItem({ id: key, name: file.name, status: "error", error: message });
      setError(message);
    }
  }

  const statusText = t("imports.upload.working");
  return (
    <>
      <Card className="flex flex-col gap-3">
        <FileUpload
          label={t("imports.upload.label")}
          labels={{
            drop: t("imports.upload.drop"),
            browse: t("imports.upload.browse"),
            camera: t("imports.upload.browse"),
            hint: t("imports.upload.hint"),
            retry: t("imports.retry"),
            remove: t("imports.upload.remove"),
            status: {
              uploading: statusText,
              pending: t("imports.upload.scanning"),
              clean: statusText,
              infected: t("imports.upload.infected"),
              rejected: t("imports.upload.rejected"),
              failed: t("imports.upload.rejected"),
              error: t("imports.failed"),
            },
            tooLarge: t("imports.upload.tooLarge"),
            wrongType: t("imports.upload.wrongType"),
          }}
          items={item ? [item] : []}
          accept=".csv,text/csv"
          maxBytes={MAX_BYTES}
          allowCamera={false}
          disabled={item?.status === "uploading" || item?.status === "pending"}
          error={error}
          onFiles={(files) => files[0] && void send(files[0])}
        />
      </Card>
      <section aria-labelledby="imports-earlier" className="flex flex-col gap-3">
        <h2 id="imports-earlier" className="m-0 text-h3">
          {t("imports.earlier")}
        </h2>
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <Alert tone="danger" role="alert">
            {t("imports.failed")}
          </Alert>
        ) : list.data.results.length ? (
          <ul className="m-0 flex list-none flex-col divide-y divide-border overflow-hidden rounded-2xl bg-surface p-0 shadow-card">
            {list.data.results.map((b) => (
              <li key={b.id}>
                <Link
                  to={`/settings/patient-import?batch=${b.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-fg no-underline hover:bg-subtle/70"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold">{b.file_name}</span>
                    <span className="text-body-sm text-fg-secondary">
                      {[
                        when(b.created_at),
                        b.created_by_name,
                        t("imports.rows", { count: b.row_count }),
                      ].join(" · ")}
                    </span>
                  </span>
                  <Badge tone={STATUS_TONE[b.status]}>{t(`imports.status.${b.status}`)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={UsersThree} title={t("imports.none")} />
        )}
      </section>
    </>
  );
}

function Batch({ id }: { id: string }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const when = useWhen();
  const { withStepUp } = useStepUp();
  const [notice, setNotice] = useState<string | null>(null);
  const batch = useQuery({
    queryKey: importKeys.one(id),
    queryFn: () => api.patientImports.get(id),
  });
  const store = (next: PatientImportBatch, message: string) => {
    queryClient.setQueryData(importKeys.one(id), next);
    void queryClient.invalidateQueries({ queryKey: ["patient-imports"] });
    setNotice(message);
  };
  const step = useMutation({
    mutationFn: (kind: "confirm" | "rollback") =>
      withStepUp(() => api.patientImports[kind](id, batch.data!.version)),
    onSuccess: (next, kind) =>
      store(
        next,
        t(kind === "confirm" ? "imports.done.confirmed" : "imports.done.rolledBack", {
          count: next.created_count,
        }),
      ),
    onError: (error) => {
      if (isApiError(error) && error.status === 409)
        void queryClient.invalidateQueries({ queryKey: importKeys.one(id) });
    },
  });
  if (batch.isPending) return <LoadingState />;
  if (batch.isError) return <EmptyState icon={UsersThree} title={t("imports.notFound")} />;
  const b = batch.data;
  const counts: [string, number, BadgeTone][] = [
    [t("imports.count.rows"), b.row_count, "neutral"],
    [t("imports.count.valid"), b.valid_count, "success"],
    [t("imports.count.error"), b.error_count, "danger"],
    [t("imports.count.duplicate"), b.duplicate_count, "warning"],
    ...(b.status === "confirmed" || b.status === "rolled_back"
      ? ([[t("imports.count.created"), b.created_count, "success"]] as [
          string,
          number,
          BadgeTone,
        ][])
      : []),
  ];
  return (
    <div className="flex flex-col gap-5">
      <p className="m-0 flex flex-wrap items-center gap-2 text-body-sm text-fg-secondary">
        <span className="font-semibold text-fg">{b.file_name}</span>
        <Badge tone={STATUS_TONE[b.status]}>{t(`imports.status.${b.status}`)}</Badge>
        <span>{when(b.created_at)}</span>
      </p>
      <p role="status" aria-live="polite" className="m-0 text-body-sm font-semibold text-success">
        {notice ?? ""}
      </p>
      {(b.status === "uploaded" || b.status === "previewed") && (
        <Mapping key={b.version} batch={b} onDone={store} />
      )}
      {b.status !== "uploaded" && (
        <dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border shadow-card sm:grid-cols-5">
          {counts.map(([label, value, tone]) => (
            <div key={label} className="flex flex-col gap-1 bg-surface px-5 py-4">
              <dt className="text-caption font-semibold text-fg-muted">{label}</dt>
              <dd
                className={cx(
                  "m-0 font-heading text-h3 font-bold tabular-nums",
                  tone === "danger" && value > 0 && "text-danger",
                )}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {b.status === "previewed" && (
        <Card className="flex flex-col gap-3">
          <p className="m-0">
            {b.valid_count
              ? t("imports.confirmHint", { count: b.valid_count })
              : t("imports.nothingReady")}
          </p>
          {step.isError && (
            <Alert tone="danger" role="alert">
              {errorText(step.error, t("imports.failed"))}
            </Alert>
          )}
          <Button
            loading={step.isPending}
            disabled={!b.valid_count}
            onClick={() => step.mutate("confirm")}
            className="self-start"
          >
            {t("imports.confirm", { count: b.valid_count })}
          </Button>
        </Card>
      )}
      {b.status === "confirmed" && (
        <Card className="flex flex-col gap-3">
          <p className="m-0">
            {b.can_roll_back && b.rollback_until
              ? t("imports.rollbackHint", { date: when(b.rollback_until) })
              : t("imports.rollbackClosed")}
          </p>
          {step.isError && (
            <Alert tone="danger" role="alert">
              {errorText(step.error, t("imports.failed"))}
            </Alert>
          )}
          {b.can_roll_back && (
            <Button
              variant="danger"
              loading={step.isPending}
              onClick={() => step.mutate("rollback")}
              className="self-start"
            >
              {t("imports.rollback")}
            </Button>
          )}
        </Card>
      )}
      {b.status === "rolled_back" && b.rolled_back_at && (
        <Alert tone="info">{t("imports.rolledBackOn", { date: when(b.rolled_back_at) })}</Alert>
      )}
      {b.status !== "uploaded" && <Rows batch={b} />}
    </div>
  );
}

/** Which column holds what; the name and the sex are required. Checking rows creates nothing. */
function Mapping({
  batch: b,
  onDone,
}: {
  batch: PatientImportBatch;
  onDone: (next: PatientImportBatch, message: string) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const [mapping, setMapping] = useState<PatientImportMapping>(b.column_mapping);
  const save = useMutation({
    mutationFn: () => api.patientImports.map(b.id, b.version, mapping),
    onSuccess: (next) => onDone(next, t("imports.done.checked")),
  });
  const ready = PATIENT_IMPORT_REQUIRED.every((f) => mapping[f]);
  const set = (field: PatientImportField, header: string) =>
    setMapping((m) => ({ ...m, [field]: header }));
  return (
    <Card
      as="form"
      noValidate
      aria-labelledby="imports-mapping"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !save.isPending) save.mutate();
      }}
      className="flex flex-col gap-4"
    >
      <h2 id="imports-mapping" className="m-0 text-h3">
        {t("imports.mapping.title")}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PATIENT_IMPORT_FIELDS.map((field) => (
          <SelectField
            key={field}
            label={t(`imports.field.${field}`)}
            hint={
              PATIENT_IMPORT_REQUIRED.includes(field) ? t("imports.mapping.required") : undefined
            }
            value={mapping[field] ?? ""}
            onChange={(e) => set(field, e.target.value)}
          >
            <option value="">{t("imports.mapping.none")}</option>
            {b.headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </SelectField>
        ))}
      </div>
      {save.isError && (
        <Alert tone="danger" role="alert">
          {errorText(save.error, t("imports.failed"))}
        </Alert>
      )}
      <Button type="submit" loading={save.isPending} disabled={!ready} className="self-start">
        {t("imports.mapping.check")}
      </Button>
    </Card>
  );
}

const FILTERS = ["all", "error", "duplicate", "valid"] as const;

function Rows({ batch: b }: { batch: PatientImportBatch }) {
  const { t } = useTranslation();
  const api = useApi();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>(b.error_count ? "error" : "all");
  const rows = useQuery({
    queryKey: importKeys.rows(b.id, `${filter}-${b.version}`),
    queryFn: () => api.patientImports.rows(b.id, filter === "all" ? {} : { status: filter }),
  });
  return (
    <section aria-labelledby="imports-rows" className="flex flex-col gap-3">
      <h2 id="imports-rows" className="m-0 text-h3">
        {t("imports.rowsTitle")}
      </h2>
      <div role="group" aria-label={t("imports.filter")} className="flex flex-wrap gap-2">
        {FILTERS.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className="inline-flex min-h-target cursor-pointer items-center rounded-full border border-border-input bg-surface px-4 text-body-sm font-semibold text-fg hover:bg-subtle aria-pressed:border-primary aria-pressed:bg-brand-subtle aria-pressed:text-on-brand-subtle"
          >
            {t(`imports.filters.${key}`)}
          </button>
        ))}
      </div>
      {rows.isPending ? (
        <LoadingState />
      ) : rows.isError ? (
        <Alert tone="danger" role="alert">
          {t("imports.failed")}
        </Alert>
      ) : rows.data.results.length ? (
        <div className="overflow-x-auto rounded-2xl bg-surface shadow-card">
          <table className="w-full border-collapse text-body-sm">
            <caption className="sr-only">{t("imports.rowsTitle")}</caption>
            <thead>
              <tr className="border-b border-border text-left text-caption text-fg-muted">
                <th scope="col" className="px-4 py-3 font-semibold">
                  {t("imports.col.row")}
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {t("imports.field.full_name")}
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {t("imports.field.sex")}
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {t("imports.field.date_of_birth")}
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {t("imports.field.file_number")}
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {t("imports.col.status")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.data.results.map((r) => (
                <tr key={r.row_number} className="border-b border-border align-top last:border-b-0">
                  <td className="px-4 py-3 tabular-nums">{r.row_number}</td>
                  <th scope="row" className="px-4 py-3 text-left font-semibold">
                    {r.full_name || "—"}
                  </th>
                  <td className="px-4 py-3">{r.sex ? t(`imports.sex.${r.sex}`) : "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{r.date_of_birth ?? "—"}</td>
                  <td className="px-4 py-3">{r.file_number ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="flex flex-col items-start gap-1">
                      <Badge tone={ROW_TONE[r.status]}>{t(`imports.rowStatus.${r.status}`)}</Badge>
                      {r.problems.map((p) => (
                        <span key={`${p.field}-${p.code}`} className="text-danger">
                          {t(`imports.field.${p.field}`)}:{" "}
                          {t(`imports.problem.${p.code}`, { defaultValue: p.code })}
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="m-0 text-fg-secondary">{t("imports.noRows")}</p>
      )}
    </section>
  );
}
