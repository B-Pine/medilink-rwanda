import type { PatientRecordDiagnosis } from "@medilink/api-client";
import { Alert, Button, Card, EmptyState, SelectField, Skeleton } from "@medilink/ui";
import { dateFormat } from "@medilink/ui/i18n";
import { ArrowLeft, CaretRight, FileText } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";
import { useProfiles } from "../profile/ProfileLayout";

export const recordsKeys = {
  list: (patientId: string) => ["records", "list", patientId] as const,
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

/** Plain language first, the code after (design 07 §3.4). */
function DiagnosisLine({ d }: { d: PatientRecordDiagnosis }) {
  const { t } = useTranslation();
  return (
    <span>
      <span className="font-semibold">{d.plain_language || d.display}</span>
      <span className="text-fg-muted">
        {" "}
        · {d.code}
        {d.certainty === "provisional" ? ` · ${t("records.provisional")}` : ""}
      </span>
    </span>
  );
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
  const people = profiles.data?.results ?? [];
  const nameOf = (id: string) => people.find((p) => p.patient_id === id)?.display_name;
  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-6">
      <PageHeading title={t("records.title")}>{t("records.title")}</PageHeading>
      <p className="m-0 text-fg-secondary">{t("records.intro")}</p>
      {people.length > 1 && (
        <SelectField
          label={t("records.whose")}
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
        >
          <option value="">{t("records.everyone")}</option>
          {people.map((p) => (
            <option key={p.patient_id} value={p.patient_id}>
              {p.display_name}
            </option>
          ))}
        </SelectField>
      )}
      {list.isPending ? (
        <Skeleton height="7rem" className="rounded-lg" />
      ) : list.isError ? (
        <Alert tone="danger" role="alert" title={t("records.loadFailed")}>
          <Button variant="secondary" onClick={() => void list.refetch()}>
            {t("common.retry")}
          </Button>
        </Alert>
      ) : list.data.results.length ? (
        <ul aria-label={t("records.title")} className="m-0 flex list-none flex-col gap-3 p-0">
          {list.data.results.map((r) => (
            <li key={r.id}>
              <Link
                to={`/records/${r.id}`}
                className="flex min-h-target items-center gap-3 rounded-lg border border-border bg-surface p-4 text-fg no-underline hover:bg-subtle"
              >
                <FileText
                  aria-hidden="true"
                  weight="duotone"
                  className="size-6 shrink-0 text-brand"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-body-sm text-fg-muted">
                    {date(r.service_date)} · {r.facility_name}
                    {people.length > 1 && nameOf(r.patient_id) ? ` · ${nameOf(r.patient_id)}` : ""}
                  </span>
                  {r.diagnoses.map((d) => (
                    <DiagnosisLine key={d.code} d={d} />
                  ))}
                  <span className="text-body-sm text-fg-muted">
                    {t("records.doctor", { name: r.doctor_name })}
                  </span>
                </span>
                <CaretRight aria-hidden="true" className="size-icon shrink-0 text-fg-muted" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={FileText}
          title={t("records.empty")}
          description={t("records.emptyBody")}
        />
      )}
    </div>
  );
}

/** /records/:recordId: one signed record in plain language (contract PR2). No private notes. */
export function RecordDetailPage() {
  const { t } = useTranslation();
  const api = useApi();
  const date = useDate();
  const { recordId = "" } = useParams();
  const record = useQuery({
    queryKey: recordsKeys.detail(recordId),
    queryFn: () => api.clinical.patient.record(recordId),
  });
  const back = (
    <Link
      to="/records"
      className="inline-flex items-center gap-1.5 self-start font-semibold text-link"
    >
      <ArrowLeft aria-hidden="true" className="size-icon" />
      {t("records.back")}
    </Link>
  );
  if (record.isPending)
    return (
      <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-6">
        <Skeleton height="12rem" className="rounded-lg" />
      </div>
    );
  if (record.isError)
    return (
      <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-6">
        {back}
        <PageHeading title={t("records.notFound")}>{t("records.notFound")}</PageHeading>
      </div>
    );
  const r = record.data;
  const v = r.vitals;
  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-5">
      {back}
      <PageHeading title={t("records.visitOn", { date: date(r.service_date) })}>
        {t("records.visitOn", { date: date(r.service_date) })}
      </PageHeading>
      <p className="m-0 text-fg-secondary">
        {r.facility_name} · {t("records.doctor", { name: r.doctor_name })}
        {r.is_late_entry ? ` · ${t("records.lateEntry")}` : ""}
      </p>
      <Card as="section" aria-labelledby="record-diagnosis" className="flex flex-col gap-2">
        <h2 id="record-diagnosis" className="m-0 text-h3">
          {t("records.diagnosis")}
        </h2>
        {r.diagnoses.map((d) => (
          <p key={d.code} className="m-0">
            <DiagnosisLine d={d} />
          </p>
        ))}
      </Card>
      {r.patient_instructions_text && (
        <Card as="section" aria-labelledby="record-instructions" className="flex flex-col gap-2">
          <h2 id="record-instructions" className="m-0 text-h3">
            {t("records.instructions")}
          </h2>
          <p className="m-0 whitespace-pre-wrap text-body-lg">{r.patient_instructions_text}</p>
        </Card>
      )}
      {r.plan_text && (
        <Card as="section" aria-labelledby="record-plan" className="flex flex-col gap-2">
          <h2 id="record-plan" className="m-0 text-h3">
            {t("records.plan")}
          </h2>
          <p className="m-0 whitespace-pre-wrap">{r.plan_text}</p>
        </Card>
      )}
      {r.history_text && (
        <Card as="section" aria-labelledby="record-history" className="flex flex-col gap-2">
          <h2 id="record-history" className="m-0 text-h3">
            {t("records.history")}
          </h2>
          <p className="m-0 whitespace-pre-wrap">{r.history_text}</p>
        </Card>
      )}
      {v.length > 0 && (
        <Card as="section" aria-labelledby="record-vitals" className="flex flex-col gap-2">
          <h2 id="record-vitals" className="m-0 text-h3">
            {t("records.vitals")}
          </h2>
          <dl className="m-0 grid grid-cols-2 gap-2">
            {v.flatMap((row) =>
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
              )
                .filter(([, value]) => value !== null && value !== undefined)
                .map(([key, value, unit]) => (
                  <div key={`${row.recorded_at}-${key}`}>
                    <dt className="text-body-sm text-fg-muted">
                      {t(`records.vitalsFields.${key}`)}
                    </dt>
                    <dd className="m-0 font-semibold tabular-nums">
                      {value} {unit}
                    </dd>
                  </div>
                )),
            )}
          </dl>
        </Card>
      )}
      {r.addenda.length > 0 && (
        <Card as="section" aria-labelledby="record-addenda" className="flex flex-col gap-3">
          <h2 id="record-addenda" className="m-0 text-h3">
            {t("records.addenda")}
          </h2>
          {r.addenda.map((a) => (
            <div key={a.signed_at} className="flex flex-col gap-1">
              <p className="m-0 text-body-sm text-fg-muted">
                {date(a.signed_at, true)} · {a.author_name}
              </p>
              <p className="m-0 font-semibold">{a.reason}</p>
              <p className="m-0 whitespace-pre-wrap">{a.body}</p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
