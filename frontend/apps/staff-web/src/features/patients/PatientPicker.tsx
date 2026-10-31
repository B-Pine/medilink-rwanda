import type { FacilityPatientDetail, PatientSummary } from "@medilink/api-client";
import { Button, PersonSearch } from "@medilink/ui";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { WalkInForm } from "./WalkInForm";

export interface PickedPatient {
  /** The facility record (S3 `FacilityPatient`) used by check-in and phone booking. */
  id: string;
  name: string;
}

/**
 * Find a patient of this facility, or register a new one (S3 walk-in form, design 04 §3.1).
 * Shared by the board's check-in and the phone booking panel.
 */
export function PatientPicker({ onPicked }: { onPicked: (patient: PickedPatient) => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const [mode, setMode] = useState<"find" | "new">("find");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientSummary[] | null>(null);
  const search = useMutation({
    mutationFn: (value: string) => api.patients.search({ query: value }),
    onSuccess: (data) => setResults(data.results),
  });
  const chosen = (p: FacilityPatientDetail | PatientSummary) =>
    onPicked({ id: p.facility_patient_id, name: p.full_name });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2" role="group" aria-label={t("patients.picker.mode")}>
        <Button
          variant={mode === "find" ? "primary" : "secondary"}
          aria-pressed={mode === "find"}
          onClick={() => setMode("find")}
        >
          {t("patients.picker.find")}
        </Button>
        <Button
          variant={mode === "new" ? "primary" : "secondary"}
          aria-pressed={mode === "new"}
          onClick={() => setMode("new")}
        >
          {t("patients.picker.new")}
        </Button>
      </div>
      {mode === "find" ? (
        <>
          <PersonSearch
            value={query}
            onChange={setQuery}
            onSearch={(value) => search.mutate(value)}
            busy={search.isPending}
            labels={{
              label: t("patients.search.label"),
              placeholder: t("patients.search.placeholder"),
              types: {
                medilink_number: t("patients.search.types.medilink_number"),
                national_id: t("patients.search.types.national_id"),
                phone: t("patients.search.types.phone"),
                file_number: t("patients.search.types.file_number"),
                name: t("patients.search.types.name"),
              },
              resultCount: (count) => t("patients.search.resultCount", { count }),
            }}
          />
          {results && results.length === 0 && (
            <p className="m-0 text-fg-secondary">{t("patients.picker.noMatch")}</p>
          )}
          {results && results.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {results.map((r) => (
                <li key={r.facility_patient_id}>
                  <button
                    type="button"
                    onClick={() => chosen(r)}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left transition-colors duration-150 hover:border-primary hover:bg-brand-subtle motion-reduce:transition-none"
                  >
                    <span className="flex flex-col">
                      <span className="font-semibold">{r.full_name}</span>
                      <span className="text-body-sm text-fg-secondary">
                        {[
                          r.medilink_number,
                          r.age_years !== null ? t("patients.age", { count: r.age_years }) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="text-body-sm font-semibold text-link">
                      {t("patients.picker.choose")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <WalkInForm onRegistered={chosen} />
      )}
    </div>
  );
}
