import {
  newIdempotencyKey,
  type ExternalMatch,
  type PatientSummary,
  type SearchResult,
} from "@medilink/api-client";
import {
  Alert,
  Button,
  Card,
  CheckboxField,
  Dialog,
  PersonSearch,
  TextField,
  type SearchType,
} from "@medilink/ui";
import { Plus } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";
import { actionError, CONSENT_VERSION, Gate, InsuranceBadge, useAge, useCan } from "./shared";

/** /patients: find a patient of this facility, or add one already on MediLink (ST1, ST4). */
export function SearchPage() {
  return (
    <Gate codes={["patients.view"]}>
      <Search />
    </Gate>
  );
}

function useNewWalkInShortcut(enabled: boolean) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if (!typing && (event.key === "n" || event.key === "N") && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        void navigate("/patients/register");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled, navigate]);
}

function Search() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const canRegister = useCan("patient.register");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [adding, setAdding] = useState<ExternalMatch | null>(null);
  useNewWalkInShortcut(canRegister);

  const search = useMutation({
    mutationFn: ({ value, type }: { value: string; type: SearchType }) =>
      api.patients.search({ query: value, by: type }),
    onSuccess: setResult,
  });

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading title={t("patients.search.title")}>{t("patients.search.title")}</PageHeading>
        {canRegister && (
          <Button onClick={() => void navigate("/patients/register")}>
            <Plus aria-hidden="true" />
            {t("patients.search.register")}
          </Button>
        )}
      </div>
      <PersonSearch
        value={query}
        onChange={setQuery}
        onSearch={(value, type) => search.mutate({ value, type })}
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
      <p className="m-0 text-small text-fg-muted">{t("patients.search.shortcuts")}</p>
      {search.isError && (
        <Alert tone="danger" role="alert">
          {actionError(search.error, t("errors.generic"))}
        </Alert>
      )}
      {result && (
        <Results
          results={result.results}
          external={result.external_match}
          onAdd={setAdding}
          canRegister={canRegister}
        />
      )}
      {adding && <AddExistingDialog match={adding} onClose={() => setAdding(null)} />}
    </div>
  );
}

function Results({
  results,
  external,
  onAdd,
  canRegister,
}: {
  results: PatientSummary[];
  external: ExternalMatch | null;
  onAdd: (match: ExternalMatch) => void;
  canRegister: boolean;
}) {
  const { t } = useTranslation();
  const age = useAge();
  return (
    <section aria-label={t("patients.search.results")} className="flex flex-col gap-3">
      {results.length === 0 && !external && (
        <Card padding="md">
          <p className="m-0">{t("patients.search.noResults")}</p>
        </Card>
      )}
      {results.length > 0 && (
        <div className="overflow-x-auto">
          <table className="hidden w-full border-collapse text-left sm:table">
            <caption className="sr-only">{t("patients.search.results")}</caption>
            <thead>
              <tr className="border-b border-border text-small text-fg-muted">
                <th scope="col" className="p-2">
                  {t("patients.fields.name")}
                </th>
                <th scope="col" className="p-2">
                  {t("patients.fields.age")}
                </th>
                <th scope="col" className="p-2">
                  {t("patients.fields.phone")}
                </th>
                <th scope="col" className="p-2">
                  {t("patients.fields.nationalId")}
                </th>
                <th scope="col" className="p-2">
                  {t("patients.fields.fileNumber")}
                </th>
                <th scope="col" className="p-2">
                  {t("patients.fields.insurance")}
                </th>
              </tr>
            </thead>
            <tbody>
              {results.map((row) => (
                <tr key={row.facility_patient_id} className="border-b border-border">
                  <td className="p-2">
                    <Link to={`/patients/${row.facility_patient_id}`} className="font-medium">
                      {row.full_name}
                    </Link>
                    <div className="text-small text-fg-muted">{row.medilink_number}</div>
                  </td>
                  <td className="p-2">{age(row.age_years, row.is_birth_date_estimated)}</td>
                  <td className="p-2 font-mono">{row.phone_masked ?? "—"}</td>
                  <td className="p-2 font-mono">{row.national_id_masked ?? "—"}</td>
                  <td className="p-2">{row.file_number ?? "—"}</td>
                  <td className="p-2">
                    {row.insurance.map((ins) => (
                      <span key={ins.insurer_code} className="mr-1">
                        {ins.insurer_code}{" "}
                        <InsuranceBadge status={ins.status} expired={ins.is_expired} />
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 sm:hidden">
            {results.map((row) => (
              <li key={row.facility_patient_id}>
                <Card padding="md">
                  <Link to={`/patients/${row.facility_patient_id}`} className="font-medium">
                    {row.full_name}
                  </Link>
                  <div className="text-small text-fg-muted">
                    {age(row.age_years, row.is_birth_date_estimated)} · {row.phone_masked ?? "—"} ·{" "}
                    {row.file_number ?? "—"}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      )}
      {external && (
        <Card padding="md" className="flex flex-col gap-2">
          <h2 className="m-0 text-h3">{t("patients.external.title")}</h2>
          <p className="m-0">
            {external.full_name} · {external.birth_year ?? "—"} ·{" "}
            {external.sex ? t(`patients.sex.${external.sex}`) : "—"} · {external.medilink_number}
          </p>
          <p className="m-0 text-small text-fg-muted">{t("patients.external.hint")}</p>
          {canRegister && (
            <div>
              <Button variant="secondary" onClick={() => onAdd(external)}>
                {t("patients.external.add")}
              </Button>
            </div>
          )}
        </Card>
      )}
    </section>
  );
}

function AddExistingDialog({ match, onClose }: { match: ExternalMatch; onClose: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const [number, setNumber] = useState(match.medilink_number ?? "");
  const [fileNumber, setFileNumber] = useState("");
  const [consent, setConsent] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const add = useMutation({
    mutationFn: () =>
      api.patients.addExisting(
        {
          patient_ref: match.patient_ref,
          proof: { medilink_number: number },
          file_number: fileNumber || null,
          care_consent: { version: CONSENT_VERSION, granted: consent },
        },
        key,
      ),
    onSuccess: (record) => void navigate(`/patients/${record.facility_patient_id}`),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("patients.external.dialogTitle", { name: match.full_name })}
      closeLabel={t("patients.close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("patients.cancel")}
          </Button>
          <Button onClick={() => add.mutate()} disabled={!consent || !number || add.isPending}>
            {t("patients.external.add")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="m-0">{t("patients.external.proofHint")}</p>
        <TextField
          label={t("patients.fields.medilinkNumber")}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
        />
        <TextField
          label={t("patients.fields.fileNumber")}
          optional
          value={fileNumber}
          onChange={(e) => setFileNumber(e.target.value)}
        />
        <CheckboxField
          label={t("patients.register.consent")}
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        {add.isError && (
          <Alert tone="danger" role="alert">
            {actionError(add.error, t("errors.generic"))}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}
