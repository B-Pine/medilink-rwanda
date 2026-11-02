import type { CalendarBlock, StaffBooking, StaffCalendar } from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  SelectField,
  Skeleton,
  WeekGrid,
  type WeekGridBlock,
} from "@medilink/ui";
import { CalendarBlank, CaretLeft, CaretRight, Warning } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { SetupGate, useDayNames, useLocalName } from "../setup/shared";
import { kigaliDate, slotDay, slotTime } from "./time";

export const calendarKeys = {
  all: ["bookings", "calendar"] as const,
  view: (p: Record<string, string>) => ["bookings", "calendar", p] as const,
};

/** YYYY-MM-DD plus `days`, at noon Kigali so the date never slips. */
export function addDays(date: string, days: number): string {
  return kigaliDate(new Date(new Date(`${date}T12:00:00+02:00`).getTime() + days * 86_400_000));
}

/** The Monday of the week of `date` (weeks start on Monday in Rwanda). */
export function mondayOf(date: string): string {
  const weekday = (new Date(`${date}T12:00:00+02:00`).getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
}

const STATUS_TONE: Record<string, "brand" | "success" | "danger" | "neutral"> = {
  confirmed: "brand",
  checked_in: "success",
  no_show: "danger",
};

function BookingRows({ rows }: { rows: StaffBooking[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  if (!rows.length)
    return <p className="m-0 text-body-sm text-fg-muted">{t("bookings.calendar.noBookings")}</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {rows.map((b) => (
        <li
          key={b.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-border/60 px-3 py-2"
        >
          <span className="font-semibold tabular-nums">{slotTime(b.starts_at, lang)}</span>
          <span className="min-w-0 flex-1">{b.display_name}</span>
          <span className="font-mono text-body-sm text-fg-secondary">{b.booking_code}</span>
          <Badge tone={STATUS_TONE[b.status] ?? "neutral"}>
            {t(`bookings.status.${b.status}`)}
          </Badge>
          {b.has_pending_change && (
            <Badge tone="warning">{t("bookings.calendar.awaitingAnswer")}</Badge>
          )}
        </li>
      ))}
    </ul>
  );
}

function DayView({ data }: { data: StaffCalendar }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const name = useLocalName();
  const service = (id: string) => name(data.services.find((s) => s.id === id)?.name_i18n);
  return (
    <div className="flex flex-col gap-6">
      {data.days.map((day) => (
        <section key={day.date} aria-labelledby={`day-${day.date}`} className="flex flex-col gap-3">
          <h2 id={`day-${day.date}`} className="m-0 font-heading text-h3">
            {slotDay(day.date, lang, "full")}
          </h2>
          {day.blocks.length === 0 && day.other_bookings.length === 0 ? (
            <p className="m-0 text-fg-secondary">{t("bookings.calendar.noSessions")}</p>
          ) : (
            day.blocks.map((block: CalendarBlock) => (
              <article
                key={`${block.service_id}-${block.membership_id}-${block.starts_at}`}
                aria-label={`${block.doctor ?? service(block.service_id)} ${slotTime(block.starts_at, lang)}`}
                className="flex flex-col gap-2 rounded-2xl bg-surface shadow-card p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="m-0 text-h4">
                    {block.doctor ?? t("bookings.calendar.serviceSchedule")}
                    <span className="font-normal text-fg-secondary">
                      {" "}
                      · {service(block.service_id)}
                    </span>
                  </h3>
                  <span className="tabular-nums text-fg-secondary">
                    {slotTime(block.starts_at, lang)}–{slotTime(block.ends_at, lang)} ·{" "}
                    {t("bookings.calendar.booked", {
                      booked: block.booked,
                      capacity: block.capacity,
                    })}
                  </span>
                </div>
                <BookingRows rows={block.bookings} />
              </article>
            ))
          )}
          {day.other_bookings.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="m-0 text-h4">{t("bookings.calendar.outside")}</h3>
              <BookingRows rows={day.other_bookings} />
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function WeekView({ data, onDay }: { data: StaffCalendar; onDay: (date: string) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const { long } = useDayNames();
  const name = useLocalName();
  const blocks: WeekGridBlock[] = data.days.flatMap((day, weekday) =>
    day.blocks.map((block) => ({
      id: `${day.date}|${block.membership_id}|${block.service_id}`,
      weekday,
      start: slotTime(block.starts_at, "en"),
      end: slotTime(block.ends_at, "en"),
      title: `${block.doctor ?? t("bookings.calendar.serviceSchedule")} · ${t(
        "bookings.calendar.booked",
        {
          booked: block.booked,
          capacity: block.capacity,
        },
      )}`,
      subtitle: name(data.services.find((s) => s.id === block.service_id)?.name_i18n),
      tone: block.booked >= block.capacity && block.capacity > 0 ? "pending" : "brand",
    })),
  );
  const today = data.days.findIndex((d) => d.date === kigaliDate());
  return (
    <WeekGrid
      blocks={blocks}
      dayLabels={long}
      today={today >= 0 ? today : undefined}
      onSelect={(block) => onDay(block.id.split("|")[0]!)}
      labels={{
        caption: t("bookings.calendar.weekOf", { date: slotDay(data.from_date, lang, "full") }),
        gridView: t("bookings.calendar.gridView"),
        tableView: t("bookings.calendar.tableView"),
        day: t("bookings.calendar.day"),
        time: t("bookings.calendar.time"),
        session: t("bookings.calendar.session"),
        actions: t("bookings.calendar.actions"),
        add: () => "",
        edit: t("bookings.calendar.openDay"),
        empty: t("bookings.calendar.noSessions"),
      }}
    />
  );
}

/** /calendar (contract S5 §6.2, R9): bookings per service and doctor, by day or week. */
export function CalendarPage() {
  return (
    <SetupGate codes={["schedule.view", "queue.call"]}>
      <Calendar />
    </SetupGate>
  );
}

function Calendar() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const api = useApi();
  const name = useLocalName();
  const [view, setView] = useState<"day" | "week">("week");
  const [date, setDate] = useState(() => kigaliDate());
  const [serviceId, setServiceId] = useState("");
  const [doctor, setDoctor] = useState("");
  const from = view === "week" ? mondayOf(date) : date;
  const params = { view, from, service_id: serviceId, membership_id: doctor };
  const calendar = useQuery({
    queryKey: calendarKeys.view(params),
    queryFn: () =>
      api.booking.staff.calendar({
        view,
        from,
        ...(serviceId ? { service_id: serviceId } : {}),
        ...(doctor ? { membership_id: doctor } : {}),
      }),
  });
  const data = calendar.data;
  const step = view === "week" ? 7 : 1;
  const disruptions = data?.disruptions.filter((d) => d.status === "open") ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={data?.only_own ? t("bookings.calendar.mineTitle") : t("bookings.calendar.title")}
        description={t("bookings.calendar.description")}
      />
      <div className="flex flex-wrap items-end gap-3">
        <div role="group" aria-label={t("bookings.calendar.view")} className="flex gap-1">
          {(["day", "week"] as const).map((v) => (
            <Button
              key={v}
              variant={view === v ? "primary" : "secondary"}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {t(`bookings.calendar.${v}View`)}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            aria-label={t("bookings.calendar.previous")}
            onClick={() => setDate(addDays(date, -step))}
          >
            <CaretLeft aria-hidden="true" />
          </Button>
          <Button variant="secondary" onClick={() => setDate(kigaliDate())}>
            {t("bookings.calendar.today")}
          </Button>
          <Button
            variant="ghost"
            aria-label={t("bookings.calendar.next")}
            onClick={() => setDate(addDays(date, step))}
          >
            <CaretRight aria-hidden="true" />
          </Button>
        </div>
        <p className="m-0 self-center font-semibold" aria-live="polite">
          {view === "week"
            ? t("bookings.calendar.weekOf", { date: slotDay(from, lang, "full") })
            : slotDay(from, lang, "full")}
        </p>
        <SelectField
          label={t("bookings.slot.service")}
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          className="w-56"
        >
          <option value="">{t("bookings.calendar.allServices")}</option>
          {(data?.services ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {name(s.name_i18n)}
            </option>
          ))}
        </SelectField>
        {!data?.only_own && (
          <SelectField
            label={t("bookings.slot.doctor")}
            value={doctor}
            onChange={(e) => setDoctor(e.target.value)}
            className="w-56"
          >
            <option value="">{t("bookings.slot.anyDoctor")}</option>
            {(data?.doctors ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </SelectField>
        )}
      </div>
      {disruptions.length > 0 && (
        <Alert tone="warning" title={t("bookings.calendar.disrupted")}>
          {t("bookings.calendar.disruptedBody", { count: disruptions.length })}
        </Alert>
      )}
      {calendar.isPending ? (
        <Skeleton height="24rem" className="rounded-2xl" />
      ) : calendar.isError || !data ? (
        <Alert tone="danger" role="alert" title={t("bookings.calendar.failed")}>
          <Button variant="secondary" onClick={() => void calendar.refetch()}>
            {t("bookings.slot.retry")}
          </Button>
        </Alert>
      ) : data.days.every((d) => d.blocks.length === 0 && d.other_bookings.length === 0) ? (
        <EmptyState
          icon={CalendarBlank}
          title={t("bookings.calendar.emptyTitle")}
          description={t("bookings.calendar.empty")}
        />
      ) : view === "week" ? (
        <WeekView
          data={data}
          onDay={(day) => {
            setDate(day);
            setView("day");
          }}
        />
      ) : (
        <DayView data={data} />
      )}
      {data?.only_own && (
        <p className="m-0 flex items-center gap-2 text-body-sm text-fg-secondary">
          <Warning aria-hidden="true" />
          {t("bookings.calendar.ownOnly")}
        </p>
      )}
    </div>
  );
}
