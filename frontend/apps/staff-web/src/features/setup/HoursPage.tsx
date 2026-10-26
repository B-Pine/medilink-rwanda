import type { CalendarEventKind, OpeningDay, OpeningHours } from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  cx,
  Dialog,
  EmptyState,
  SelectField,
  SwitchField,
  TextField,
  TimeRangeField,
  timeBefore,
} from "@medilink/ui";
import { CalendarX, CopySimple, Plus, Trash } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import {
  addDays,
  ConflictNotice,
  errorText,
  fieldErrors,
  formatDate,
  isConflict,
  isoDate,
  mondayOf,
  QueryState,
  SetupGate,
  setupKeys,
  useCan,
  useDayNames,
  useLocale,
  useLocalName,
} from "./shared";

interface DayDraft {
  open: boolean;
  opens_at: string;
  closes_at: string;
  hasBreak: boolean;
  break_starts_at: string;
  break_ends_at: string;
}

const toDrafts = (hours: OpeningHours): DayDraft[] =>
  Array.from({ length: 7 }, (_, weekday) => {
    const day = hours.days.find((d) => d.weekday === weekday);
    return {
      open: Boolean(day),
      opens_at: day?.opens_at.slice(0, 5) ?? "08:00",
      closes_at: day?.closes_at.slice(0, 5) ?? "17:00",
      hasBreak: Boolean(day?.break_starts_at),
      break_starts_at: day?.break_starts_at?.slice(0, 5) ?? "12:30",
      break_ends_at: day?.break_ends_at?.slice(0, 5) ?? "13:30",
    };
  });

const dayValid = (d: DayDraft) =>
  !d.open ||
  (timeBefore(d.opens_at, d.closes_at) &&
    (!d.hasBreak ||
      (timeBefore(d.opens_at, d.break_starts_at) &&
        timeBefore(d.break_starts_at, d.break_ends_at) &&
        timeBefore(d.break_ends_at, d.closes_at))));

/** /settings/hours (S2-F4): opening hours per service, closures, and the effective calendar. */
export function HoursPage() {
  const { t } = useTranslation();
  const api = useApi();
  const name = useLocalName();
  const canConfigure = useCan("facility.configure");
  const services = useQuery({ queryKey: setupKeys.services, queryFn: () => api.setup.services() });
  const [serviceId, setServiceId] = useState<string | null>(null);
  return (
    <SetupGate codes={["facility.configure", "schedule.manage"]}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("setup.settings.sections.hours.title")}
          description={t("setup.hours.intro")}
          back={{ to: "/settings", label: t("setup.settings.title") }}
        />
        {canConfigure && (
          <>
            <div
              role="tablist"
              aria-label={t("setup.hours.scope")}
              className="flex flex-wrap gap-2"
            >
              {[
                { id: null, label: t("setup.hours.wholeFacility") },
                ...(services.data?.results ?? [])
                  .filter((s) => s.is_active)
                  .map((s) => ({ id: s.id, label: name(s.name_i18n) })),
              ].map((tab) => (
                <button
                  key={tab.id ?? "facility"}
                  type="button"
                  role="tab"
                  aria-selected={serviceId === tab.id}
                  onClick={() => setServiceId(tab.id)}
                  className={cx(
                    "min-h-target cursor-pointer rounded-full border px-4 text-body-sm font-semibold",
                    serviceId === tab.id
                      ? "border-primary bg-brand-subtle text-on-brand-subtle"
                      : "border-border bg-surface text-fg-secondary hover:text-fg",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <WeekEditor key={serviceId ?? "facility"} serviceId={serviceId} />
              <CalendarPreview serviceId={serviceId} />
            </div>
          </>
        )}
        <EventsSection />
      </div>
    </SetupGate>
  );
}

function WeekEditor({ serviceId }: { serviceId: string | null }) {
  const api = useApi();
  const [reloads, setReloads] = useState(0);
  const hours = useQuery({
    queryKey: setupKeys.hours(serviceId),
    queryFn: () => api.setup.hours(serviceId),
  });
  return (
    <QueryState query={hours}>
      {(data) => (
        <WeekForm
          key={reloads}
          hours={data}
          serviceId={serviceId}
          onReload={() => void hours.refetch().then(() => setReloads((n) => n + 1))}
        />
      )}
    </QueryState>
  );
}

function WeekForm({
  hours,
  serviceId,
  onReload,
}: {
  hours: OpeningHours;
  serviceId: string | null;
  onReload: () => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { long } = useDayNames();
  const [days, setDays] = useState<DayDraft[]>(() => toDrafts(hours));
  const [saved, setSaved] = useState(false);
  const update = (weekday: number, patch: Partial<DayDraft>) => {
    setSaved(false);
    setDays((all) => all.map((d, i) => (i === weekday ? { ...d, ...patch } : d)));
  };
  const copyToWeekdays = () => {
    setSaved(false);
    setDays((all) => all.map((d, i) => (i > 0 && i < 5 ? { ...all[0]! } : d)));
  };
  const save = useMutation({
    mutationFn: () =>
      api.setup.saveHours({
        service_id: serviceId,
        version: hours.version,
        days: days.flatMap((d, weekday): OpeningDay[] =>
          d.open
            ? [
                {
                  weekday,
                  opens_at: d.opens_at,
                  closes_at: d.closes_at,
                  break_starts_at: d.hasBreak ? d.break_starts_at : null,
                  break_ends_at: d.hasBreak ? d.break_ends_at : null,
                },
              ]
            : [],
        ),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(setupKeys.hours(serviceId), data);
      void queryClient.invalidateQueries({ queryKey: ["setup", "calendar"] });
      void queryClient.invalidateQueries({ queryKey: setupKeys.checklist });
      setSaved(true);
    },
  });
  const errors = fieldErrors(save.error);
  const valid = days.every(dayValid);
  const rangeLabels = {
    start: t("setup.hours.opens"),
    end: t("setup.hours.closes"),
    order: t("setup.hours.order"),
  };
  const breakLabels = {
    start: t("setup.hours.breakStarts"),
    end: t("setup.hours.breakEnds"),
    order: t("setup.hours.breakOrder"),
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate();
      }}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 font-heading text-h3">{t("setup.hours.week")}</h2>
        <Button type="button" variant="secondary" onClick={copyToWeekdays}>
          <CopySimple aria-hidden="true" />
          {t("setup.hours.copyMonday")}
        </Button>
      </div>
      {serviceId && hours.version === 0 && (
        <p className="m-0 text-body-sm text-fg-secondary">{t("setup.hours.inherits")}</p>
      )}
      {isConflict(save.error) && <ConflictNotice onReload={onReload} />}
      <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
        {days.map((day, weekday) => {
          const breakInside =
            !day.hasBreak ||
            (timeBefore(day.opens_at, day.break_starts_at) &&
              timeBefore(day.break_ends_at, day.closes_at));
          return (
            <li
              key={weekday}
              className="grid gap-3 py-3 first:pt-0 last:pb-0 lg:grid-cols-[9rem_minmax(0,1fr)] lg:items-start"
            >
              <SwitchField
                label={long[weekday]}
                checked={day.open}
                onCheckedChange={(open) => update(weekday, { open })}
              />
              {day.open ? (
                <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                  <TimeRangeField
                    label={t("setup.hours.openingFor", { day: long[weekday] })}
                    start={day.opens_at}
                    end={day.closes_at}
                    onChange={({ start, end }) =>
                      update(weekday, { opens_at: start, closes_at: end })
                    }
                    labels={rangeLabels}
                    error={errors[`days.${weekday}`]}
                  />
                  {day.hasBreak ? (
                    <div className="flex items-end gap-2">
                      <TimeRangeField
                        label={t("setup.hours.breakFor", { day: long[weekday] })}
                        start={day.break_starts_at}
                        end={day.break_ends_at}
                        onChange={({ start, end }) =>
                          update(weekday, { break_starts_at: start, break_ends_at: end })
                        }
                        labels={breakLabels}
                        error={breakInside ? undefined : t("setup.hours.breakInside")}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => update(weekday, { hasBreak: false })}
                        aria-label={t("setup.hours.removeBreak", { day: long[weekday] })}
                      >
                        <Trash aria-hidden="true" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => update(weekday, { hasBreak: true })}
                      className="self-end"
                    >
                      <Plus aria-hidden="true" />
                      {t("setup.hours.addBreak")}
                    </Button>
                  )}
                </div>
              ) : (
                <p className="m-0 self-center text-fg-muted">{t("setup.hours.closed")}</p>
              )}
            </li>
          );
        })}
      </ul>
      {save.isError && !isConflict(save.error) && Object.keys(errors).length === 0 && (
        <Alert tone="danger" role="alert">
          {errorText(save.error, t("setup.failed"))}
        </Alert>
      )}
      {saved && (
        <Alert tone="success" role="status">
          {t("setup.saved")}
        </Alert>
      )}
      <div className="flex justify-end border-t border-border pt-4">
        <Button type="submit" disabled={!valid || save.isPending}>
          {t("setup.hours.save")}
        </Button>
      </div>
    </form>
  );
}

/** Four weeks of the effective calendar (hours minus closures, holidays, Umuganda). */
function CalendarPreview({ serviceId }: { serviceId: string | null }) {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const { short } = useDayNames();
  const from = isoDate(mondayOf(new Date()));
  const to = isoDate(addDays(new Date(`${from}T00:00:00Z`), 27));
  const calendar = useQuery({
    queryKey: setupKeys.calendar(from, serviceId),
    queryFn: () => api.setup.calendar({ from, to, service_id: serviceId }),
  });
  const today = isoDate(new Date());
  return (
    <section
      aria-labelledby="preview"
      className="flex flex-col gap-3 self-start rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="preview" className="m-0 font-heading text-h3">
        {t("setup.hours.preview")}
      </h2>
      <p className="m-0 text-body-sm text-fg-secondary">{t("setup.hours.previewHint")}</p>
      <QueryState query={calendar}>
        {(data) => (
          <>
            <div
              className="grid grid-cols-7 gap-1"
              role="list"
              aria-label={t("setup.hours.preview")}
            >
              {short.map((d) => (
                <span
                  key={d}
                  aria-hidden="true"
                  className="pb-1 text-center text-caption font-semibold text-fg-muted"
                >
                  {d}
                </span>
              ))}
              {data.days.map((day) => {
                const open = day.open.length > 0;
                const label = `${formatDate(day.date, locale)}: ${
                  open
                    ? day.open
                        .map((r) => `${r.starts.slice(0, 5)}–${r.ends.slice(0, 5)}`)
                        .join(", ")
                    : day.umuganda
                      ? t("setup.hours.umuganda")
                      : (day.holiday_name ?? t("setup.hours.closed"))
                }`;
                return (
                  <span
                    key={day.date}
                    role="listitem"
                    title={label}
                    aria-label={label}
                    className={cx(
                      "flex aspect-square items-center justify-center rounded-sm text-caption font-semibold tabular-nums",
                      open
                        ? "bg-brand-subtle text-on-brand-subtle"
                        : day.umuganda
                          ? "bg-warning-bg text-warning"
                          : "bg-subtle text-fg-muted",
                      day.date === today && "ring-2 ring-primary",
                    )}
                    style={
                      open
                        ? undefined
                        : {
                            backgroundImage:
                              "repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, currentColor 16%, transparent) 4px 5px)",
                          }
                    }
                  >
                    {Number(day.date.slice(8))}
                  </span>
                );
              })}
            </div>
            <ul className="m-0 flex list-none flex-wrap gap-3 p-0 text-caption text-fg-secondary">
              <li className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-3 rounded-sm bg-brand-subtle" />
                {t("setup.hours.legendOpen")}
              </li>
              <li className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-3 rounded-sm bg-subtle" />
                {t("setup.hours.closed")}
              </li>
              <li className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-3 rounded-sm bg-warning-bg" />
                {t("setup.hours.umuganda")}
              </li>
            </ul>
          </>
        )}
      </QueryState>
    </section>
  );
}

const EVENT_KINDS: CalendarEventKind[] = ["closure", "special_day", "holiday_override"];

function EventsSection() {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const events = useQuery({ queryKey: setupKeys.events, queryFn: () => api.setup.events() });
  const [adding, setAdding] = useState(false);
  const remove = useMutation({
    mutationFn: (id: string) => api.setup.removeEvent(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: setupKeys.events });
      void queryClient.invalidateQueries({ queryKey: ["setup", "calendar"] });
    },
  });
  return (
    <section aria-labelledby="events" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="events" className="m-0 font-heading text-h2">
            {t("setup.hours.events")}
          </h2>
          <p className="m-0 text-body-sm text-fg-secondary">{t("setup.hours.eventsHint")}</p>
        </div>
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" weight="bold" />
          {t("setup.hours.addEvent")}
        </Button>
      </div>
      <QueryState query={events}>
        {(data) =>
          data.results.length === 0 ? (
            <EmptyState
              size="inline"
              icon={CalendarX}
              title={t("setup.hours.noEventsTitle")}
              description={t("setup.hours.noEvents")}
              className="rounded-lg border border-dashed border-border"
            />
          ) : (
            <ul className="m-0 list-none overflow-hidden rounded-lg border border-border bg-surface p-0">
              {data.results.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-0"
                >
                  <Badge tone={e.kind === "closure" ? "warning" : "info"}>
                    {t(`setup.hours.kinds.${e.kind}`)}
                  </Badge>
                  <span className="flex-1 font-semibold">
                    {e.reason || t(`setup.hours.kinds.${e.kind}`)}
                  </span>
                  <span className="text-body-sm text-fg-secondary tabular-nums">
                    {formatDate(e.starts_at, locale)} – {formatDate(e.ends_at, locale)}
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => remove.mutate(e.id)}
                    aria-label={`${t("setup.remove")}: ${e.reason || t(`setup.hours.kinds.${e.kind}`)}`}
                  >
                    <Trash aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
      {remove.isError && (
        <Alert tone="danger" role="alert">
          {errorText(remove.error, t("setup.failed"))}
        </Alert>
      )}
      {adding && <EventDialog onClose={() => setAdding(false)} />}
    </section>
  );
}

function EventDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    kind: "closure" as CalendarEventKind,
    starts: isoDate(new Date()),
    ends: isoDate(new Date()),
    reason: "",
  });
  const save = useMutation({
    mutationFn: () =>
      api.setup.addEvent({
        kind: form.kind,
        starts_at: `${form.starts}T00:00:00+02:00`,
        ends_at: `${form.ends}T23:59:00+02:00`,
        reason: form.reason,
        is_open: form.kind !== "closure",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: setupKeys.events });
      void queryClient.invalidateQueries({ queryKey: ["setup", "calendar"] });
      onClose();
    },
  });
  const errors = fieldErrors(save.error);
  const order = form.ends < form.starts ? t("setup.hours.dateOrder") : undefined;
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("setup.hours.addEvent")}
      closeLabel={t("setup.close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("setup.cancel")}
          </Button>
          <Button type="submit" form="event-form" disabled={save.isPending || Boolean(order)}>
            {t("setup.save")}
          </Button>
        </>
      }
    >
      <form
        id="event-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <SelectField
          label={t("setup.hours.kind")}
          value={form.kind}
          onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as CalendarEventKind }))}
        >
          {EVENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`setup.hours.kinds.${k}`)}
            </option>
          ))}
        </SelectField>
        <div className="flex flex-wrap gap-4">
          <TextField
            type="date"
            label={t("setup.hours.from")}
            value={form.starts}
            onChange={(e) => setForm((f) => ({ ...f, starts: e.target.value }))}
            className="w-48"
          />
          <TextField
            type="date"
            label={t("setup.hours.to")}
            value={form.ends}
            onChange={(e) => setForm((f) => ({ ...f, ends: e.target.value }))}
            error={order ?? errors.ends_at}
            className="w-48"
          />
        </div>
        <TextField
          label={t("setup.hours.reason")}
          value={form.reason}
          maxLength={200}
          onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          optional
        />
        {save.isError && Object.keys(errors).length === 0 && (
          <Alert tone="danger" role="alert">
            {errorText(save.error, t("setup.failed"))}
          </Alert>
        )}
      </form>
    </Dialog>
  );
}
