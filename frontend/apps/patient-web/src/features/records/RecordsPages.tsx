import type { PatientLabResult } from "@medilink/api-client";
import { Badge, cx, EmptyState, SelectField, Skeleton, TextField } from "@medilink/ui";
import { dateFormat } from "@medilink/ui/i18n";
import { FileText, ListChecks, SealCheck, Stethoscope, TestTube } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { paths } from "../../app/paths";
import { useApi } from "../../app/services";
import {
  DateBlock,
  ErrorBlock,
  PageHeader,
  panelClass,
  RowIcon,
  RowLink,
  RowList,
  RowsSkeleton,
  WidgetCard,
} from "../dashboard/kit";
import { useProfiles } from "../profile/ProfileLayout";

export const recordsKeys = {
  list: (patientId: string) => ["records", "list", patientId] as const,
  labResults: (patientId: string) => ["records", "lab", patientId] as const,
  detail: (id: string) => ["records", "detail", id] as const,
};

export function useDate() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  return (iso: string, withTime = false) => {
    try {
      return dateFormat(lang, {
        timeZone: "Africa/Kigali",
        day: "numeric",
        month: "long",
        year: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
      }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));
    } catch {
      return iso;
    }
  };
}

/** /records: signed records of my profiles, newest first (contract PR1). */
export function RecordsPage() {
  const { t } = useTranslation();
  const api = useApi();
  const date = useDate();
  const profiles = useProfiles();
  const [patientId, setPatientId] = useState("");
  const list = useQuery({
    queryKey: recordsKeys.list(patientId),
    queryFn: () => api.clinical.patient.records(patientId ? { patient_id: patientId } : {}),
  });
  const [query, setQuery] = useState("");
  const people = profiles.data?.results ?? [];
  const nameOf = (id: string) => people.find((p) => p.patient_id === id)?.display_name;
  const q = query.trim().toLocaleLowerCase();
  const rows = (list.data?.results ?? []).filter(
    (r) =>
      !q ||
      [r.facility_name, r.doctor_name, ...r.diagnoses.map((d) => d.plain_language || d.display)]
        .filter(Boolean)
        .some((text) => text.toLocaleLowerCase().includes(q)),
  );
  const years = [...new Set(rows.map((r) => r.service_date.slice(0, 4)))];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("records.title")} subtitle={t("records.intro")} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <TextField
          type="search"
          label={t("dashboard.records.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
        />
        {people.length > 1 && (
          <SelectField
            label={t("records.whose")}
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            className="sm:w-64"
          >
            <option value="">{t("records.everyone")}</option>
            {people.map((p) => (
              <option key={p.patient_id} value={p.patient_id}>
                {p.display_name}
              </option>
            ))}
          </SelectField>
        )}
      </div>
      {/* W7: released results first, they are what the patient waits for */}
      <LabResults patientId={patientId} showWhose={people.length > 1} nameOf={nameOf} />
      {list.isPending ? (
        <RowsSkeleton rows={4} />
      ) : list.isError ? (
        <ErrorBlock message={t("records.loadFailed")} onRetry={() => void list.refetch()} />
      ) : rows.length ? (
        // newest first, under a heading per year
        <div className={cx(panelClass, "flex flex-col divide-y divide-border overflow-hidden")}>
          {years.map((year) => (
            <section key={year} aria-labelledby={`year-${year}`}>
              <div className="flex items-center justify-between gap-3 border-b border-border bg-subtle/60 px-4 py-2 sm:px-5">
                <h2
                  id={`year-${year}`}
                  className="m-0 text-caption font-semibold tracking-wide text-fg-secondary tabular-nums"
                >
                  {year}
                </h2>
                <span aria-hidden="true" className="text-caption text-fg-muted tabular-nums">
                  {rows.filter((r) => r.service_date.startsWith(year)).length}
                </span>
              </div>
              <RowList bare label={year}>
                {rows
                  .filter((r) => r.service_date.startsWith(year))
                  .map((r) => {
                    const main = r.diagnoses[0];
                    return (
                      <RowLink
                        key={r.id}
                        to={paths.record(r.id)}
                        leading={<DateBlock iso={r.service_date} />}
                        title={
                          main
                            ? main.plain_language || main.display
                            : t("records.visitOn", { date: date(r.service_date) })
                        }
                        meta={[
                          r.facility_name,
                          t("records.doctor", { name: r.doctor_name }),
                          people.length > 1 ? nameOf(r.patient_id) : null,
                          main?.certainty === "provisional" ? t("records.provisional") : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        trailing={
                          <Badge tone="success" icon={SealCheck}>
                            {t("dashboard.records.signed")}
                          </Badge>
                        }
                      />
                    );
                  })}
              </RowList>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title={q ? t("dashboard.records.noMatch") : t("records.empty")}
          description={q ? undefined : t("dashboard.records.emptyBody")}
        />
      )}
    </div>
  );
}

/**
 * Lab results the doctor released (upgrade 06 §3, #201, FR-CLN-11), with the doctor's note. A
 * result never shows before the doctor reviewed and released it.
 */
function LabResults({
  patientId,
  showWhose,
  nameOf,
}: {
  patientId: string;
  showWhose: boolean;
  nameOf: (id: string) => string | undefined;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const date = useDate();
  const results = useQuery({
    queryKey: recordsKeys.labResults(patientId),
    queryFn: () => api.clinical.patient.labResults(patientId ? { patient_id: patientId } : {}),
  });
  if (results.isError)
    return <ErrorBlock message={t("records.lab.failed")} onRetry={() => void results.refetch()} />;
  if (!results.data?.length) return null;
  const value = (item: PatientLabResult["items"][number]) =>
    item.kind === "number"
      ? `${item.value}${item.unit ? ` ${item.unit}` : ""}`
      : t(`records.lab.choices.${item.value}`, { defaultValue: item.value });
  return (
    <section aria-labelledby="lab-results" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="lab-results" className="m-0 font-heading text-h2 tracking-tight">
          {t("records.lab.title")}
        </h2>
        <p className="m-0 text-fg-secondary">{t("records.lab.intro")}</p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {results.data.map((r) => (
          <li key={r.id} className={cx(panelClass, "flex flex-col gap-4 p-4 sm:p-5")}>
            <div className="flex flex-wrap items-start gap-3">
              <RowIcon icon={TestTube} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <h3 className="m-0 font-heading text-h3">{r.test_name}</h3>
                <p className="m-0 text-body-sm text-fg-secondary">
                  {[
                    date(r.released_at),
                    r.facility_name,
                    r.doctor_name ? t("records.doctor", { name: r.doctor_name }) : null,
                    showWhose ? nameOf(r.patient_id) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
            <table className="w-full border-collapse text-body-sm">
              <caption className="sr-only">{r.test_name}</caption>
              <thead>
                <tr className="text-caption text-fg-muted">
                  <th scope="col" className="py-1 pe-3 text-start font-semibold">
                    {t("records.lab.item")}
                  </th>
                  <th scope="col" className="py-1 pe-3 text-start font-semibold">
                    {t("records.lab.value")}
                  </th>
                  <th scope="col" className="py-1 text-start font-semibold">
                    {t("records.lab.normal")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.items.map((item) => (
                  <tr key={item.code} className="border-t border-border/60">
                    <th scope="row" className="py-2 pe-3 text-start font-normal text-fg-secondary">
                      {item.label}
                    </th>
                    <td className="py-2 pe-3">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold tabular-nums">{value(item)}</span>
                        {item.flag && (
                          <Badge tone="warning">{t(`records.lab.flags.${item.flag}`)}</Badge>
                        )}
                      </span>
                    </td>
                    <td className="py-2 text-fg-muted tabular-nums">
                      {item.low !== null && item.high !== null
                        ? `${Number(item.low)}–${Number(item.high)} ${item.unit}`.trim()
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {r.note && (
              <p className="m-0 rounded-xl bg-brand-subtle/60 px-4 py-3">
                <span className="font-semibold">{t("records.lab.note")}</span> {r.note}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * /records/:recordId: one signed record in plain language (contract PR2). No private notes.
 * Redesign 2026-11-02: what the doctor found and what to do first; the visit, its measurements
 * (as recorded, never judged) and later additions beside.
 */
export function RecordDetailPage() {
  const { t } = useTranslation();
  const api = useApi();
  const date = useDate();
  const { recordId = "" } = useParams();
  const record = useQuery({
    queryKey: recordsKeys.detail(recordId),
    queryFn: () => api.clinical.patient.record(recordId),
  });
  const back = { to: paths.records, label: t("records.back") };
  if (record.isPending)
    return (
      <div className="flex flex-col gap-6">
        <Skeleton height="2.5rem" width="50%" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton height="14rem" className="rounded-2xl" />
          <Skeleton height="12rem" className="rounded-2xl" />
        </div>
      </div>
    );
  if (record.isError)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("records.notFound")} back={back} />
      </div>
    );
  const r = record.data;
  const reading = [...r.vitals].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
  const tiles = (row: (typeof r.vitals)[number]) =>
    (
      [
        ["temperature", row.temperature_c, "°C"],
        [
          "bloodPressure",
          row.systolic_mmhg && row.diastolic_mmhg
            ? `${row.systolic_mmhg}/${row.diastolic_mmhg}`
            : null,
          "mmHg",
        ],
        ["pulse", row.pulse_bpm, "/min"],
        ["spo2", row.spo2_pct, "%"],
        ["weight", row.weight_kg, "kg"],
        ["height", row.height_cm, "cm"],
      ] as const
    ).filter(([, value]) => value !== null && value !== undefined && value !== "");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("records.visitOn", { date: date(r.service_date) })}
        subtitle={`${r.facility_name} · ${t("records.doctor", { name: r.doctor_name })}`}
        back={back}
        actions={
          <Badge tone="success" icon={SealCheck}>
            {t("dashboard.records.signed")}
          </Badge>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <WidgetCard id="record-diagnosis" title={t("records.diagnosis")}>
            <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
              {r.diagnoses.map((d) => (
                <li key={d.code} className="flex items-start gap-3 px-5 py-4">
                  <RowIcon icon={Stethoscope} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-semibold text-fg">{d.plain_language || d.display}</span>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-subtle px-2 py-0.5 font-mono text-caption text-fg-secondary">
                        {d.code}
                      </span>
                      {d.plain_language && d.display !== d.plain_language && (
                        <span className="text-caption text-fg-muted">{d.display}</span>
                      )}
                      {d.certainty === "provisional" && (
                        <Badge tone="warning">{t("records.provisional")}</Badge>
                      )}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </WidgetCard>

          {r.patient_instructions_text && (
            // what the patient has to do: the one block on a tint
            <section
              aria-labelledby="record-instructions"
              className="flex flex-col gap-2 rounded-2xl border border-brand/25 bg-brand-subtle p-5"
            >
              <h2
                id="record-instructions"
                className="m-0 flex items-center gap-2 font-heading text-body font-bold text-on-brand-subtle"
              >
                <ListChecks aria-hidden="true" weight="bold" className="size-5" />
                {t("records.instructions")}
              </h2>
              <p className="m-0 whitespace-pre-wrap text-fg">{r.patient_instructions_text}</p>
            </section>
          )}

          {r.plan_text && (
            <WidgetCard id="record-plan" title={t("records.plan")}>
              <p className="m-0 p-5 whitespace-pre-wrap text-fg-secondary">{r.plan_text}</p>
            </WidgetCard>
          )}
          {r.history_text && (
            <WidgetCard id="record-history" title={t("records.history")}>
              <p className="m-0 p-5 whitespace-pre-wrap text-fg-secondary">{r.history_text}</p>
            </WidgetCard>
          )}
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-24">
          <WidgetCard id="record-visit" title={t("records.about")}>
            <dl className="m-0 flex flex-col divide-y divide-border">
              {[
                [t("records.date"), date(r.service_date)],
                [t("records.facility"), r.facility_name],
                [t("records.doctorLabel"), r.doctor_name],
                [
                  t("records.signedOn"),
                  `${date(r.signed_at, true)}${r.is_late_entry ? ` · ${t("records.lateEntry")}` : ""}`,
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5 px-5 py-3">
                  <dt className="text-caption font-semibold text-fg-muted">{label}</dt>
                  <dd className="m-0 text-body-sm font-semibold text-fg">{value}</dd>
                </div>
              ))}
            </dl>
          </WidgetCard>

          {reading.length > 0 && (
            <WidgetCard id="record-vitals" title={t("records.vitals")}>
              {reading.map((row) => (
                <div key={row.recorded_at} className="border-b border-border last:border-b-0">
                  {reading.length > 1 && (
                    <p className="m-0 px-5 pt-3 text-caption text-fg-muted tabular-nums">
                      {date(row.recorded_at, true)}
                    </p>
                  )}
                  <dl className="m-0 grid grid-cols-2 gap-px bg-border">
                    {tiles(row).map(([key, value, unit]) => (
                      <div key={key} className="flex flex-col gap-1 bg-surface px-5 py-3">
                        <dt className="text-caption font-semibold text-fg-muted">
                          {t(`records.vitalsFields.${key}`)}
                        </dt>
                        <dd className="m-0 flex items-baseline gap-1">
                          <span className="font-heading text-h3 leading-none font-bold text-fg tabular-nums">
                            {value}
                          </span>
                          <span className="text-caption text-fg-muted">{unit}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </WidgetCard>
          )}

          {r.addenda.length > 0 && (
            <WidgetCard id="record-addenda" title={t("records.addenda")}>
              <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
                {r.addenda.map((a) => (
                  <li key={a.signed_at} className="flex flex-col gap-1 px-5 py-4">
                    <p className="m-0 text-caption text-fg-muted tabular-nums">
                      {date(a.signed_at, true)} · {a.author_name}
                    </p>
                    <p className="m-0 font-semibold">{a.reason}</p>
                    <p className="m-0 text-body-sm whitespace-pre-wrap text-fg-secondary">
                      {a.body}
                    </p>
                  </li>
                ))}
              </ul>
            </WidgetCard>
          )}
        </aside>
      </div>
    </div>
  );
}
