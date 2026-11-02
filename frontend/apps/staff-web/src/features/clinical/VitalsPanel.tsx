import {
  VITAL_FIELDS,
  VITAL_RANGES,
  type VitalField,
  type Vitals,
  type VitalsInput,
} from "@medilink/api-client";
import { Alert, Button, ConfirmDialog, TextField } from "@medilink/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { clinicalKeys, errorText, useCan, useVitalsLine, useWhen } from "./shared";

const DECIMAL: VitalField[] = ["temperature_c", "weight_kg", "height_cm"];

function toInput(values: Record<VitalField, string>): VitalsInput {
  const body: Record<string, string | number> = {};
  for (const field of VITAL_FIELDS) {
    const raw = values[field].trim().replace(",", ".");
    if (!raw) continue;
    body[field] = DECIMAL.includes(field) ? raw : Number(raw);
  }
  return body;
}

function localErrors(values: Record<VitalField, string>): Partial<Record<VitalField, true>> {
  const errors: Partial<Record<VitalField, true>> = {};
  for (const field of VITAL_FIELDS) {
    const raw = values[field].trim().replace(",", ".");
    if (!raw) continue;
    const n = Number(raw);
    const [low, high] = VITAL_RANGES[field];
    if (!Number.isFinite(n) || n < low || n > high) errors[field] = true;
  }
  return errors;
}

const EMPTY = Object.fromEntries(VITAL_FIELDS.map((f) => [f, ""])) as Record<VitalField, string>;

/**
 * Vitals of one visit (contract V1, V2): reception and doctors record; plausible ranges are
 * checked before sending (same limits as the server); a wrong row is marked entered in error.
 */
export function VitalsPanel({ visitId, onRecorded }: { visitId: string; onRecorded?: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const when = useWhen();
  const line = useVitalsLine();
  const canRecord = useCan("vitals.record");
  const [values, setValues] = useState(EMPTY);
  const [tried, setTried] = useState(false);
  const [wrong, setWrong] = useState<Vitals | null>(null);
  const list = useQuery({
    queryKey: clinicalKeys.vitals(visitId),
    queryFn: () => api.clinical.vitals(visitId),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: clinicalKeys.all }).then(() => onRecorded?.());
  const record = useMutation({
    mutationFn: () => api.clinical.recordVitals(visitId, toInput(values)),
    onSuccess: async () => {
      setValues(EMPTY);
      setTried(false);
      await refresh();
    },
  });
  const markWrong = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.clinical.vitalsEnteredInError(id, reason),
    onSuccess: async () => {
      setWrong(null);
      await refresh();
    },
  });
  const errors = localErrors(values);
  const empty = VITAL_FIELDS.every((f) => !values[f].trim());
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (!empty && !Object.keys(errors).length) record.mutate();
  };
  const rows = (list.data?.results ?? []).filter((v) => !v.is_entered_in_error);

  return (
    <div className="flex flex-col gap-4">
      {rows.length > 0 ? (
        <ul
          aria-label={t("clinical.vitals.recorded")}
          className="m-0 flex list-none flex-col gap-2 p-0"
        >
          {rows.map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 p-3"
            >
              <span className="font-semibold tabular-nums">{line(v)}</span>
              <span className="text-body-sm text-fg-muted">
                {t("clinical.vitals.by", {
                  name: v.recorded_by_name ?? "—",
                  time: when.time(v.recorded_at),
                })}
              </span>
              {canRecord && (
                <Button variant="ghost" className="ms-auto" onClick={() => setWrong(v)}>
                  {t("clinical.vitals.markWrong")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-fg-muted">{t("clinical.vitals.none")}</p>
      )}

      {canRecord && (
        <form
          onSubmit={submit}
          noValidate
          className="flex flex-col gap-3"
          aria-label={t("clinical.vitals.form")}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {VITAL_FIELDS.map((field) => {
              const [low, high] = VITAL_RANGES[field];
              return (
                <TextField
                  key={field}
                  label={t(`clinical.vitals.fields.${field}`)}
                  hint={t("clinical.vitals.range", { low, high })}
                  inputMode="decimal"
                  value={values[field]}
                  onChange={(e) => setValues({ ...values, [field]: e.target.value })}
                  error={errors[field] ? t("clinical.vitals.outOfRange", { low, high }) : undefined}
                />
              );
            })}
          </div>
          {tried && empty && (
            <Alert tone="warning" role="alert">
              {t("clinical.vitals.enterOne")}
            </Alert>
          )}
          {record.isError && (
            <Alert tone="danger" role="alert">
              {errorText(record.error, t("errors.generic"))}
            </Alert>
          )}
          <Button
            type="submit"
            variant="secondary"
            className="self-start"
            disabled={record.isPending}
          >
            {t("clinical.vitals.save")}
          </Button>
        </form>
      )}

      <ConfirmDialog
        open={wrong !== null}
        onOpenChange={(open) => !open && setWrong(null)}
        title={t("clinical.vitals.markWrongTitle")}
        consequences={wrong ? line(wrong) : ""}
        confirmLabel={t("clinical.vitals.markWrong")}
        cancelLabel={t("clinical.cancel")}
        closeLabel={t("clinical.close")}
        tone="danger"
        reasonLabel={t("clinical.reason")}
        reasonRequired
        reasonRequiredMessage={t("clinical.reasonRequired")}
        busy={markWrong.isPending}
        error={errorText(markWrong.error, t("errors.generic"))}
        onConfirm={(reason) => wrong && markWrong.mutate({ id: wrong.id, reason })}
      />
    </div>
  );
}
