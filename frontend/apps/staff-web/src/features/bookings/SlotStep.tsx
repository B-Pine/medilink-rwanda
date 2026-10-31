import { isApiError, type Hold, type PublicSlot, type Uuid } from "@medilink/api-client";
import { Alert, Button, cx, SelectField } from "@medilink/ui";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { kigaliDate, slotDay, slotTime } from "./time";

const DAY_MS = 86_400_000;
const isMorning = (iso: string) =>
  Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: "Africa/Kigali",
    }).format(new Date(iso)),
  ) < 12;

/**
 * Free times of one service for 7 days (contract S5 R2), with a doctor filter, and an atomic
 * 5-minute hold on the chosen time (R3). A taken time shows the server's nearby alternatives.
 */
export function SlotStep({
  serviceId,
  onHeld,
}: {
  serviceId: Uuid;
  onHeld: (slot: PublicSlot, hold: Hold) => void;
}) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const language = i18n.resolvedLanguage ?? "en";
  const [week, setWeek] = useState(0);
  const [doctor, setDoctor] = useState("");
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const [taken, setTaken] = useState<PublicSlot[] | null>(null);
  const [now] = useState(() => Date.now());
  const date = kigaliDate(new Date(now + week * 7 * DAY_MS));

  const slots = useQuery({
    queryKey: ["bookings", "staff-slots", serviceId, date],
    queryFn: () => api.booking.staff.slots({ service_id: serviceId, date }),
  });

  const hold = useMutation({
    mutationFn: (slot: PublicSlot) =>
      api.booking.staff.hold(slot.id).then((h) => ({ slot, hold: h })),
    onSuccess: ({ slot, hold: h }) => onHeld(slot, h),
    onError: (error) => {
      if (isApiError(error) && error.status === 409) {
        setTaken((error.extra.alternatives as PublicSlot[] | undefined) ?? []);
        void slots.refetch();
      }
    },
  });

  if (slots.isError) {
    return (
      <Alert tone="danger">
        <span className="flex flex-col items-start gap-2">
          {t("bookings.slot.loadError")}
          <Button variant="secondary" onClick={() => void slots.refetch()}>
            {t("bookings.slot.retry")}
          </Button>
        </span>
      </Alert>
    );
  }

  const days = slots.data?.days ?? [];
  const doctors = new Map<string, string>();
  for (const day of days)
    for (const s of day.slots)
      if (s.membership_id && s.doctor) doctors.set(s.membership_id, s.doctor);
  const visible = (list: PublicSlot[]) =>
    list.filter((s) => s.open_places > 0 && (!doctor || s.membership_id === doctor));
  const activeDay =
    days.find((d) => d.date === chosenDay) ??
    days.find((d) => visible(d.slots).length > 0) ??
    days[0];
  const free = activeDay ? visible(activeDay.slots) : [];
  const groups = [
    { key: "morning", slots: free.filter((s) => isMorning(s.starts_at)) },
    { key: "afternoon", slots: free.filter((s) => !isMorning(s.starts_at)) },
  ].filter((g) => g.slots.length > 0);

  const chip = (slot: PublicSlot) => (
    <li key={slot.id}>
      <button
        type="button"
        onClick={() => hold.mutate(slot)}
        disabled={hold.isPending}
        className="flex min-h-control min-w-20 cursor-pointer flex-col items-center justify-center rounded-md border border-border-input bg-surface px-3 py-1 font-semibold tabular-nums text-fg transition-colors duration-150 hover:border-brand hover:bg-brand-subtle disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none"
      >
        {slotTime(slot.starts_at, language)}
        {slot.doctor && !doctor && doctors.size > 1 && (
          <span className="max-w-28 truncate text-caption font-normal text-fg-muted">
            {slot.doctor}
          </span>
        )}
      </button>
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      {doctors.size > 1 && (
        <SelectField
          label={t("bookings.slot.doctor")}
          value={doctor}
          onChange={(e) => setDoctor(e.target.value)}
        >
          <option value="">{t("bookings.slot.anyDoctor")}</option>
          {[...doctors].map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </SelectField>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          aria-label={t("bookings.slot.earlier")}
          disabled={week === 0}
          onClick={() => {
            setWeek((w) => w - 1);
            setChosenDay(null);
          }}
          className="px-2"
        >
          <CaretLeft aria-hidden="true" weight="bold" />
        </Button>
        <ul
          aria-label={t("bookings.slot.days")}
          className="m-0 grid flex-1 list-none grid-cols-7 gap-1 p-0"
        >
          {days.map((day) => {
            const count = visible(day.slots).length;
            const on = day.date === activeDay?.date;
            return (
              <li key={day.date}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setChosenDay(day.date)}
                  className={cx(
                    "flex w-full cursor-pointer flex-col items-center rounded-md border px-1 py-1.5 text-caption transition-colors duration-150 motion-reduce:transition-none",
                    on
                      ? "border-brand bg-brand-subtle font-semibold text-on-brand-subtle"
                      : "border-border bg-surface text-fg-secondary hover:bg-subtle",
                    count === 0 && !on && "opacity-60",
                  )}
                >
                  <span>{slotDay(day.date, language, "weekday")}</span>
                  <span className="text-body font-semibold tabular-nums">
                    {slotDay(day.date, language, "day")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <Button
          variant="ghost"
          aria-label={t("bookings.slot.later")}
          onClick={() => {
            setWeek((w) => w + 1);
            setChosenDay(null);
          }}
          className="px-2"
        >
          <CaretRight aria-hidden="true" weight="bold" />
        </Button>
      </div>

      {taken && (
        <Alert tone="warning">
          <span className="flex flex-col gap-2">
            {t("bookings.slot.taken")}
            {taken.length > 0 && (
              <span className="flex flex-col gap-1">
                <span className="text-body-sm font-semibold">
                  {t("bookings.slot.alternatives")}
                </span>
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">{taken.map(chip)}</ul>
              </span>
            )}
          </span>
        </Alert>
      )}

      <div
        role="group"
        aria-label={t("bookings.slot.times")}
        aria-busy={slots.isPending}
        className="flex flex-col gap-3"
      >
        {slots.isSuccess && groups.length === 0 && (
          <p className="m-0 text-fg-secondary">{t("bookings.slot.noTimes")}</p>
        )}
        {groups.map((group) => (
          <div key={group.key} className="flex flex-col gap-2">
            <span className="text-body-sm font-semibold text-fg-muted">
              {t(`bookings.slot.${group.key}`)}
            </span>
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">{group.slots.map(chip)}</ul>
          </div>
        ))}
      </div>
    </div>
  );
}
