import type { PatientPrescriptionItem, PatientPrescriptionRow } from "@medilink/api-client";
import { Alert, Badge, cx, EmptyState, SelectField, Skeleton, type BadgeTone } from "@medilink/ui";
import { Pill } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { paths } from "../../app/paths";
import { useApi } from "../../app/services";
import {
  ErrorBlock,
  PageHeader,
  panelClass,
  RowIcon,
  RowLink,
  RowList,
  RowsSkeleton,
  SegmentedTabs,
} from "../dashboard/kit";
import { useProfiles } from "../profile/ProfileLayout";
import { useDate } from "../records/RecordsPages";
import { medicinesKeys, STATUS_TONE } from "./shared";

type Tab = "active" | "past";

/** /medicines (S7-F5, FR-PHA-03): my and my dependants' prescriptions, active first. */
export function MedicinesPage() {
  const { t } = useTranslation();
  const api = useApi();
  const profiles = useProfiles();
  const [patientId, setPatientId] = useState("");
  const [tab, setTab] = useState<Tab>("active");
  const list = useQuery({
    queryKey: medicinesKeys.list(patientId, tab),
    queryFn: () =>
      api.pharmacy.patient.list({ status: tab, ...(patientId ? { patient_id: patientId } : {}) }),
  });
  const people = profiles.data?.results ?? [];
  const nameOf = (id: string) => people.find((p) => p.patient_id === id)?.display_name;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("dashboard.medications.title")} />
      {people.length > 1 && (
        <SelectField
          label={t("medicines.whose")}
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          className="sm:w-72"
        >
          <option value="">{t("medicines.everyone")}</option>
          {people.map((p) => (
            <option key={p.patient_id} value={p.patient_id}>
              {p.display_name}
            </option>
          ))}
        </SelectField>
      )}
      <SegmentedTabs
        label={t("medicines.which")}
        value={tab}
        onChange={setTab}
        options={(["active", "past"] as const).map((key) => ({
          value: key,
          label: t(`medicines.tab.${key}`),
        }))}
      />
      {list.isPending ? (
        <RowsSkeleton />
      ) : list.isError ? (
        <ErrorBlock message={t("medicines.failed")} onRetry={() => void list.refetch()} />
      ) : list.data.results.length ? (
        <RowList label={t(`medicines.tab.${tab}`)}>
          {list.data.results.map((row) => (
            <PrescriptionRow
              key={row.id}
              row={row}
              who={people.length > 1 ? nameOf(row.patient_id) : undefined}
            />
          ))}
        </RowList>
      ) : (
        <EmptyState
          icon={Pill}
          title={t(`medicines.empty.${tab}`)}
          description={tab === "active" ? t("medicines.emptyBody") : undefined}
        />
      )}
    </div>
  );
}

function PrescriptionRow({ row, who }: { row: PatientPrescriptionRow; who?: string | undefined }) {
  const { t } = useTranslation();
  const date = useDate();
  return (
    <RowLink
      to={paths.medication(row.id)}
      leading={<RowIcon icon={Pill} />}
      title={row.facility_name}
      meta={[
        who,
        t("medicines.count", { count: row.item_count }),
        t("medicines.issued", { date: date(row.issued_at) }),
      ]
        .filter(Boolean)
        .join(" · ")}
      trailing={<Badge tone={STATUS_TONE[row.status]}>{t(`medicines.status.${row.status}`)}</Badge>}
    />
  );
}

/**
 * /medicines/:id (S7-F5, redesign 2026-11-02): each medicine in words (dose, how often, how
 * long, how to take it) and what the pharmacy gave; the code to show at the pharmacy beside.
 */
export function MedicineDetailPage() {
  const { t } = useTranslation();
  const api = useApi();
  const date = useDate();
  const { prescriptionId = "" } = useParams();
  const rx = useQuery({
    queryKey: medicinesKeys.detail(prescriptionId),
    queryFn: () => api.pharmacy.patient.get(prescriptionId),
  });
  const back = { to: paths.medications, label: t("medicines.back") };
  if (rx.isPending)
    return (
      <div className="flex flex-col gap-6">
        <Skeleton height="2.5rem" width="50%" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton height="14rem" className="rounded-2xl" />
          <Skeleton height="10rem" className="rounded-2xl" />
        </div>
      </div>
    );
  if (rx.isError)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("medicines.notFound")} back={back} />
        <Alert tone="danger">{t("medicines.notFound")}</Alert>
      </div>
    );
  const p = rx.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={p.facility_name}
        subtitle={`${t("medicines.byDoctor", { name: p.prescriber_name })} · ${t("medicines.issued", { date: date(p.issued_at) })}`}
        back={back}
        actions={<Badge tone={STATUS_TONE[p.status]}>{t(`medicines.status.${p.status}`)}</Badge>}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="rx-items" className="flex min-w-0 flex-col gap-3">
          <h2 id="rx-items" className="m-0 font-heading text-h3 font-bold">
            {t("medicines.count", { count: p.items.length })}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {p.items.map((item) => (
              <li key={item.id}>
                <ItemCard item={item} expires={date(p.expires_at)} />
              </li>
            ))}
          </ul>
        </section>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <div className="ml-ticket-stub flex flex-col items-center gap-1.5 rounded-2xl border border-brand/30 bg-brand-subtle px-5 py-6 text-center">
            <span className="text-caption font-semibold tracking-[0.14em] text-on-brand-subtle uppercase">
              {t("medicines.codeLabel")}
            </span>
            <span className="font-mono text-h2 font-bold tracking-wider text-fg">{p.number}</span>
            <span className="text-body-sm text-fg-secondary">
              {t("medicines.codeHint", { date: date(p.expires_at) })}
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}

const ITEM_TONE: Record<PatientPrescriptionItem["status"], BadgeTone> = {
  draft: "neutral",
  issued: "brand",
  partly_dispensed: "warning",
  dispensed: "success",
  not_available: "danger",
  cancelled: "neutral",
  expired: "neutral",
};

/** One medicine: name and status, the four facts as labelled tiles, instructions, what was given. */
function ItemCard({ item, expires }: { item: PatientPrescriptionItem; expires: string }) {
  const { t } = useTranslation();
  const status =
    item.status === "partly_dispensed"
      ? t("medicines.item.partly", { given: item.dispensed_quantity, total: item.quantity })
      : item.status === "not_available"
        ? t("medicines.item.not_available", { date: expires })
        : t(`medicines.item.${item.status}`);
  const facts = [
    [t("medicines.facts.dose"), item.dose],
    [t("medicines.facts.often"), t(`medicines.frequency.${item.frequency_code}`)],
    [
      t("medicines.facts.long"),
      item.duration_days ? t("medicines.days", { count: item.duration_days }) : null,
    ],
    [t("medicines.facts.how"), t(`medicines.route.${item.route}`)],
  ].filter((fact): fact is [string, string] => Boolean(fact[1]));
  const given = item.quantity > 0 ? Math.min(1, item.dispensed_quantity / item.quantity) : 0;
  return (
    <article
      aria-labelledby={`rx-${item.id}`}
      className={cx(panelClass, "flex flex-col overflow-hidden")}
    >
      <div className="flex items-start gap-3 p-5">
        <RowIcon icon={Pill} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 id={`rx-${item.id}`} className="m-0 font-heading text-h3 font-bold text-fg">
            {item.drug_display}
          </h3>
          {item.substitute_display && (
            <p className="m-0 text-body-sm text-fg-secondary">
              {t("medicines.item.givenAs", { name: item.substitute_display })}
            </p>
          )}
        </div>
        <Badge tone={ITEM_TONE[item.status]}>{status}</Badge>
      </div>
      <dl className="m-0 grid grid-cols-2 gap-px border-y border-border bg-border sm:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 bg-surface px-5 py-3">
            <dt className="text-caption font-semibold text-fg-muted">{label}</dt>
            <dd className="m-0 text-body-sm font-semibold text-fg first-letter:uppercase">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {item.instructions && (
        <p className="m-0 border-b border-border bg-brand-subtle/60 px-5 py-3 font-semibold text-fg">
          {item.instructions}
        </p>
      )}
      {/* what the pharmacy has given so far; the badge says it in words */}
      <div className="flex items-center gap-3 px-5 py-3">
        <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
          <span
            className="block h-full rounded-full bg-primary"
            style={{ width: `${given * 100}%` }}
          />
        </span>
        <span className="text-caption text-fg-muted tabular-nums">
          {item.dispensed_quantity}/{item.quantity}
        </span>
      </div>
    </article>
  );
}
