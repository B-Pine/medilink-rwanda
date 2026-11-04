import {
  CARE_SCHEDULE_KINDS,
  type CareScheduleEntry,
  type CareScheduleKind,
  type FacilityPatientDetail,
} from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  LoadingState,
  SelectField,
  TextField,
} from "@medilink/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { actionError, fieldErrors, formatDate, useLocale } from "./shared";

/** Today in Kigali as YYYY-MM-DD (the earliest day a plan can have). */
function kigaliToday(): string {
  return new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * W7 (upgrade 13): the patient's planned vaccinations and antenatal visits at this facility. The
 * patient gets a reminder the day before and on the morning; the reminder never says what the
 * visit is for, and the note stays in the app. To change a date, cancel it and add the new one.
 */
export function CareSchedule({ record }: { record: FacilityPatientDetail }) {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const key = ["patients", "care-schedule", record.facility_patient_id];
  const list = useQuery({
    queryKey: key,
    queryFn: () => api.booking.staff.careSchedule(record.facility_patient_id),
  });
  const [kind, setKind] = useState<CareScheduleKind>("vaccination");
  const [dueOn, setDueOn] = useState("");
  const [note, setNote] = useState("");
  const [cancelling, setCancelling] = useState<CareScheduleEntry | null>(null);
  const add = useMutation({
    mutationFn: () =>
      api.booking.staff.addCareSchedule(record.facility_patient_id, {
        kind,
        due_on: dueOn,
        note: note.trim(),
      }),
    onSuccess: () => {
      setDueOn("");
      setNote("");
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const cancel = useMutation({
    mutationFn: (entry: CareScheduleEntry) =>
      api.booking.staff.cancelCareSchedule(entry.id, entry.version),
    onSuccess: () => {
      setCancelling(null);
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const errors = fieldErrors(add.error);
  const rows = list.data?.results ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card padding="md" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-h3">{t("patients.careSchedule.title")}</h2>
          <p className="m-0 text-body-sm text-fg-secondary">{t("patients.careSchedule.intro")}</p>
        </div>
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <Alert tone="danger" role="alert">
            {t("patients.careSchedule.failed")}
          </Alert>
        ) : rows.length ? (
          <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
            {rows.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="min-w-28 font-semibold tabular-nums">
                  {formatDate(entry.due_on, locale)}
                </span>
                <Badge tone={entry.kind === "vaccination" ? "info" : "brand"}>
                  {t(`patients.careSchedule.kinds.${entry.kind}`)}
                </Badge>
                {entry.note && <span className="text-fg-secondary">{entry.note}</span>}
                <Button
                  variant="ghost"
                  className="ms-auto"
                  onClick={() => {
                    cancel.reset();
                    setCancelling(entry);
                  }}
                >
                  {t("patients.careSchedule.cancel")}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-body-sm text-fg-muted">{t("patients.careSchedule.empty")}</p>
        )}
      </Card>

      <Card padding="md" className="flex flex-col gap-3">
        <h2 className="m-0 text-h3">{t("patients.careSchedule.add")}</h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (dueOn) add.mutate();
          }}
        >
          <SelectField
            label={t("patients.careSchedule.kind")}
            value={kind}
            onChange={(e) => setKind(e.target.value as CareScheduleKind)}
            error={errors.kind}
          >
            {CARE_SCHEDULE_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`patients.careSchedule.kinds.${k}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            type="date"
            label={t("patients.careSchedule.dueOn")}
            value={dueOn}
            min={kigaliToday()}
            required
            onChange={(e) => setDueOn(e.target.value)}
            error={errors.due_on}
          />
          <TextField
            label={t("patients.careSchedule.note")}
            hint={t("patients.careSchedule.noteHint")}
            value={note}
            maxLength={80}
            onChange={(e) => setNote(e.target.value)}
            error={errors.note}
          />
          <Button type="submit" disabled={!dueOn || add.isPending}>
            {t("patients.careSchedule.save")}
          </Button>
        </form>
        {add.isError && !Object.keys(errors).length && (
          <Alert tone="danger" role="alert">
            {actionError(add.error, t("errors.generic"))}
          </Alert>
        )}
        {add.isSuccess && (
          <Alert tone="success" role="status">
            {t("patients.careSchedule.saved")}
          </Alert>
        )}
      </Card>

      {cancelling && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setCancelling(null)}
          title={t("patients.careSchedule.cancelTitle")}
          consequences={t("patients.careSchedule.cancelConsequences", {
            date: formatDate(cancelling.due_on, locale),
          })}
          confirmLabel={t("patients.careSchedule.cancel")}
          cancelLabel={t("patients.cancel")}
          closeLabel={t("patients.close")}
          tone="danger"
          busy={cancel.isPending}
          error={cancel.isError ? actionError(cancel.error, t("errors.generic")) : undefined}
          onConfirm={() => cancel.mutate(cancelling)}
        />
      )}
    </div>
  );
}
