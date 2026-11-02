import type { PatientPrescriptionItem, PatientPrescriptionRow } from "@medilink/api-client";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  SelectField,
  Skeleton,
  type BadgeTone,
} from "@medilink/ui";
import { ArrowLeft, Pill } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { paths } from "../../app/paths";
import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";
import {
  ErrorBlock,
  PageHeader,
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
      <PageHeader title={t("dashboard.medications.title")} subtitle={t("medicines.intro")} />
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

/** /medicines/:id (S7-F5): each medicine in words and what the pharmacy gave. */
export function MedicineDetailPage() {
  const { t } = useTranslation();
  const api = useApi();
  const date = useDate();
  const { prescriptionId = "" } = useParams();
  const rx = useQuery({
    queryKey: medicinesKeys.detail(prescriptionId),
    queryFn: () => api.pharmacy.patient.get(prescriptionId),
  });
  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-6">
      <Link
        to={paths.medications}
        className="inline-flex items-center gap-2 self-start font-semibold"
      >
        <ArrowLeft aria-hidden="true" className="size-icon" />
        {t("medicines.back")}
      </Link>
      {rx.isPending ? (
        <Skeleton height="10rem" className="rounded-lg" />
      ) : rx.isError ? (
        <Alert tone="danger">{t("medicines.notFound")}</Alert>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <PageHeading title={rx.data.facility_name}>{rx.data.facility_name}</PageHeading>
            <p className="m-0 flex flex-wrap items-center gap-2 text-fg-secondary">
              <Badge tone={STATUS_TONE[rx.data.status]}>
                {t(`medicines.status.${rx.data.status}`)}
              </Badge>
              <span>
                {t("medicines.byDoctor", { name: rx.data.prescriber_name })} ·{" "}
                {t("medicines.issued", { date: date(rx.data.issued_at) })}
              </span>
            </p>
          </div>
          <Card className="flex flex-col gap-1">
            <span className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
              {t("medicines.codeLabel")}
            </span>
            <span className="font-mono text-h2 font-bold tracking-wider">{rx.data.number}</span>
            <span className="text-body-sm text-fg-muted">
              {t("medicines.codeHint", { date: date(rx.data.expires_at) })}
            </span>
          </Card>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {rx.data.items.map((item) => (
              <li key={item.id}>
                <ItemCard item={item} expires={date(rx.data.expires_at)} />
              </li>
            ))}
          </ul>
        </>
      )}
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

function ItemCard({ item, expires }: { item: PatientPrescriptionItem; expires: string }) {
  const { t } = useTranslation();
  const status =
    item.status === "partly_dispensed"
      ? t("medicines.item.partly", { given: item.dispensed_quantity, total: item.quantity })
      : item.status === "not_available"
        ? t("medicines.item.not_available", { date: expires })
        : t(`medicines.item.${item.status}`);
  return (
    <article className="flex flex-col gap-2 rounded-xl bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="m-0 text-h3">{item.drug_display}</h2>
        <Badge tone={ITEM_TONE[item.status]}>{status}</Badge>
      </div>
      <p className="m-0 text-body text-fg">
        {[
          item.dose,
          t(`medicines.frequency.${item.frequency_code}`),
          item.duration_days ? t("medicines.days", { count: item.duration_days }) : null,
        ]
          .filter(Boolean)
          .join(", ")}
      </p>
      <p className="m-0 text-body-sm text-fg-muted">{t(`medicines.route.${item.route}`)}</p>
      {item.instructions && <p className="m-0 font-semibold">{item.instructions}</p>}
      {item.substitute_display && (
        <p className="m-0 text-body-sm text-fg-secondary">
          {t("medicines.item.givenAs", { name: item.substitute_display })}
        </p>
      )}
    </article>
  );
}
