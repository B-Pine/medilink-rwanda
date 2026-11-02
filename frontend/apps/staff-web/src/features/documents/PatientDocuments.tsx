import { Alert, EmptyState, LoadingState } from "@medilink/ui";
import { Files } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { DocumentLine, documentsKeys, errorText, useCan } from "./shared";

/**
 * The patient record's Documents tab (S7-F7, FR-DOC-07, D1-D3). Clinicians download under the
 * relationship rule; reception and the pharmacy print what was released to the patient.
 */
export function PatientDocuments({ fpId }: { fpId: string }) {
  const { t } = useTranslation();
  const api = useApi();
  const clinical = useCan("clinical.view");
  const list = useQuery({
    queryKey: documentsKeys.forPatient(fpId),
    queryFn: () => api.documents.list({ facility_patient_id: fpId }),
  });
  const rows = list.data?.results ?? [];
  return (
    <section aria-labelledby="patient-documents-title" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="patient-documents-title" className="m-0 text-h3">
          {t("documents.patient.title")}
        </h2>
        <p className="m-0 text-body-sm text-fg-secondary">
          {clinical ? t("documents.patient.clinicalHint") : t("documents.patient.printHint")}
        </p>
      </div>
      {list.isPending ? (
        <LoadingState label={t("documents.loading")} />
      ) : list.isError ? (
        <Alert tone="danger" role="alert">
          {errorText(list.error, t("errors.generic"))}
        </Alert>
      ) : rows.length ? (
        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg bg-surface px-4 shadow-card">
          {rows.map((d) => (
            <DocumentLine key={d.id} document={d} mode={clinical ? "download" : "print"} />
          ))}
        </ul>
      ) : (
        <EmptyState icon={Files} title={t("documents.patient.none")} />
      )}
    </section>
  );
}
