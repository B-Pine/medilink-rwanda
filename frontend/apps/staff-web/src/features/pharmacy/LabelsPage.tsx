import type { LanguageCode } from "@medilink/api-client";
import { Alert, Button, EmptyState, LoadingState, SelectField } from "@medilink/ui";
import { Printer, Tag } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { NoAccessContent } from "../../pages/NotFoundPage";
import { DoseSchedule, MealPictogram } from "./LabelPictograms";
import { errorText, pharmacyKeys, useCan, useWhen } from "./shared";

const LANGUAGES: LanguageCode[] = ["rw", "en", "fr"];

/**
 * /pharmacy/prescriptions/:id/labels (S7-F4, FR-PHA-05): one dosing label per dispensed line, in
 * Kinyarwanda by default, printed from the browser at 62 mm (one label per page).
 */
export function LabelsPage() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const { prescriptionId = "" } = useParams();
  const allowed = useCan("pharmacy.dispense");
  const when = useWhen();
  const [language, setLanguage] = useState<LanguageCode>("rw");
  const labels = useQuery({
    queryKey: pharmacyKeys.labels(prescriptionId, language),
    queryFn: () => api.pharmacy.labels(prescriptionId, language),
    enabled: allowed,
  });
  if (!allowed) return <NoAccessContent />;
  const list = labels.data?.labels ?? [];
  // the pictogram words follow the label language, not the screen language
  const labelT = i18n.getFixedT(language);

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="print:hidden">
        <PageHeader
          title={t("pharmacy.labels.title")}
          back={{
            to: `/pharmacy/prescriptions/${prescriptionId}`,
            label: t("pharmacy.dispense.title"),
          }}
          actions={
            <Button onClick={() => window.print()} disabled={!list.length}>
              <Printer aria-hidden="true" className="size-icon" />
              {t("pharmacy.labels.print")}
            </Button>
          }
        />
        <SelectField
          label={t("pharmacy.labels.language")}
          value={language}
          onChange={(event) => setLanguage(event.target.value as LanguageCode)}
          className="mt-4 sm:w-56"
        >
          {LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {t(`pharmacy.labels.languages.${code}`)}
            </option>
          ))}
        </SelectField>
      </div>
      {labels.isPending ? (
        <LoadingState label={t("pharmacy.loading")} />
      ) : labels.isError ? (
        <Alert tone="danger" role="alert">
          {errorText(labels.error, t("errors.generic"))}
        </Alert>
      ) : list.length ? (
        <ul className="m-0 flex list-none flex-wrap gap-4 p-0 print:block">
          {list.map((label) => (
            <li
              key={label.line_id}
              lang={label.language}
              className="flex w-[62mm] flex-col gap-1 rounded-2xl border border-dashed border-border-input bg-white p-3 text-[11pt] leading-snug text-black print:break-after-page print:rounded-none print:border-0"
            >
              <span className="text-[9pt] font-semibold uppercase">{label.facility_name}</span>
              <strong className="text-[12pt]">{label.drug}</strong>
              <span>
                {label.dose} · {label.frequency}
              </span>
              <DoseSchedule label={label} t={labelT} />
              <MealPictogram label={label} />
              <span>{[label.route, label.duration].filter(Boolean).join(" · ")}</span>
              {label.instructions && <span className="font-semibold">{label.instructions}</span>}
              <span className="mt-1 border-t border-black/30 pt-1 text-[9pt]">
                {label.patient_name} · {when.date(`${label.dispensed_on}T12:00:00Z`)} · ×
                {label.quantity}
              </span>
              <span className="font-mono text-[8pt]">{label.prescription_number}</span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Tag} title={t("pharmacy.labels.none")} />
      )}
    </div>
  );
}
