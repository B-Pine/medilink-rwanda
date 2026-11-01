import { isApiError, type FollowUp, type FollowUpMode } from "@medilink/api-client";
import { Alert, Button, Dialog, SelectField, TextField } from "@medilink/ui";
import { CalendarPlus } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { slotDay, slotTime, text } from "./time";

const followUpKey = (visitId: string) => ["bookings", "follow-up", visitId] as const;

function Result({ followUp }: { followUp: FollowUp }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const b = followUp.booking;
  if (b)
    return (
      <Alert tone="success" role="status" title={t("bookings.followUp.booked")}>
        {t("bookings.followUp.bookedBody", {
          when: `${slotDay(followUp.due_on, lang, "full")}`,
          time: slotTime(b.starts_at, lang),
          day: slotDay(b.starts_at.slice(0, 10), lang, "full"),
          doctor: b.doctor ?? "—",
          code: b.booking_code,
        })}
      </Alert>
    );
  return (
    <Alert tone={followUp.status === "no_slot" ? "warning" : "info"} role="status">
      {followUp.status === "no_slot"
        ? t("bookings.followUp.noSlot", { day: slotDay(followUp.due_on, lang, "full") })
        : t("bookings.followUp.reminder", { day: slotDay(followUp.due_on, lang, "full") })}
    </Alert>
  );
}

/**
 * Follow-up on the current visit (contract S5 R8, D-4): "come back in N days or weeks", booked at
 * the first open time with this doctor when possible, or a reminder. S6 moves it into the
 * consultation screen.
 */
export function FollowUpAction({ visitId, name }: { visitId: string; name: string }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const existing = useQuery({
    queryKey: followUpKey(visitId),
    queryFn: async () => {
      try {
        return await api.booking.staff.followUp(visitId);
      } catch (error) {
        if (isApiError(error) && error.status === 404) return null;
        throw error;
      }
    },
    enabled: open,
  });
  const save = useMutation({
    mutationFn: (body: { in_days: number; mode: FollowUpMode }) =>
      api.booking.staff.createFollowUp(visitId, body),
    onSuccess: (out) => queryClient.setQueryData(followUpKey(visitId), out),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const count = Number(text(form, "count"));
    const unit = text(form, "unit");
    save.mutate({
      in_days: unit === "weeks" ? count * 7 : count,
      mode: text(form, "mode") as FollowUpMode,
    });
  };
  const done = existing.data ?? null;
  const fields = isApiError(save.error) ? save.error.fields : {};
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <CalendarPlus aria-hidden="true" />
        {t("bookings.followUp.open")}
      </Button>
      {open && (
        <Dialog
          open
          onOpenChange={(o) => !o && setOpen(false)}
          title={t("bookings.followUp.title", { name })}
          closeLabel={t("bookings.phone.close")}
          footer={
            done ? (
              <Button onClick={() => setOpen(false)}>{t("bookings.done.finish")}</Button>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  {t("bookings.followUp.cancel")}
                </Button>
                <Button type="submit" form="follow-up-form" loading={save.isPending}>
                  {t("bookings.followUp.save")}
                </Button>
              </>
            )
          }
        >
          {done ? (
            <Result followUp={done} />
          ) : (
            <form id="follow-up-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label={t("bookings.followUp.in")}
                  name="count"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={52}
                  defaultValue={2}
                  required
                  error={fields.in_days?.[0]}
                />
                <SelectField label={t("bookings.followUp.unit")} name="unit" defaultValue="weeks">
                  <option value="days">{t("bookings.followUp.days")}</option>
                  <option value="weeks">{t("bookings.followUp.weeks")}</option>
                </SelectField>
              </div>
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="mb-1 font-semibold">{t("bookings.followUp.how")}</legend>
                {(["booking", "reminder"] as const).map((mode) => (
                  <label key={mode} className="flex min-h-target items-center gap-2">
                    <input
                      type="radio"
                      name="mode"
                      value={mode}
                      defaultChecked={mode === "booking"}
                    />
                    {t(`bookings.followUp.mode.${mode}`)}
                  </label>
                ))}
              </fieldset>
              {save.isError && (
                <Alert tone="danger" role="alert">
                  {isApiError(save.error) ? save.error.message : t("bookings.review.failed")}
                </Alert>
              )}
            </form>
          )}
        </Dialog>
      )}
    </>
  );
}
