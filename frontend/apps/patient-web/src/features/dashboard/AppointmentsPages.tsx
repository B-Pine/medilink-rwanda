import { isApiError, type Booking, type Hold, type PublicSlot } from "@medilink/api-client";
import {
  ArrowSquareOut,
  CalendarBlank,
  CalendarPlus,
  CaretLeft,
  CaretRight,
  Clock,
  DotsThree,
  IdentificationBadge,
  MapPin,
  NavigationArrow,
  Phone,
  Stethoscope,
  type Icon,
} from "@phosphor-icons/react";
import {
  Alert,
  Button,
  buttonClassName,
  ConfirmDialog,
  cx,
  Dialog,
  EmptyState,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Skeleton,
} from "@medilink/ui";
import { formatDate, kigaliDate } from "@medilink/ui/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

import { paths } from "../../app/paths";
import { useApi } from "../../app/services";
import { useToast } from "../../layout/Toasts";
import { bookingsKey } from "../booking/BookPage";
import { day, directionsUrl, pick, time } from "../booking/discovery";
import { CalendarFeedCard, OfferBanner } from "../booking/Offer";
import { useUpcoming } from "../booking/Upcoming";
import { useProfiles } from "../profile/ProfileLayout";
import {
  AppointmentBadge,
  DateBlock,
  ErrorBlock,
  isCancelled,
  PageHeader,
  Panel,
  RowLink,
  RowList,
  RowsSkeleton,
  SegmentedTabs,
  useFacilityProfile,
} from "./kit";

type Tab = "upcoming" | "past" | "cancelled";

export function usePastBookings(enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: [...bookingsKey, "past"],
    queryFn: () => api.booking.bookings("past"),
    enabled,
  });
}

export const canReschedule = (b: Booking) =>
  b.status === "confirmed" && b.can_change && !b.pending_change;
export const canCancel = (b: Booking) => b.status === "confirmed";

// ---- cancel ----------------------------------------------------------------------------------

/** Cancel with its consequences spelled out; the badge changes only after the server agrees. */
export function CancelAppointmentDialog({
  booking,
  onClose,
}: {
  booking: Booking;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => api.booking.cancel(booking.id, booking.version),
    onSuccess: (updated) => {
      queryClient.setQueryData([...bookingsKey, "detail", booking.id], updated);
      void queryClient.invalidateQueries({ queryKey: bookingsKey });
      toast({ title: t("dashboard.appointments.cancelled"), tone: "success" });
      onClose();
    },
  });
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("booking.upcoming.cancelTitle")}
      consequences={
        booking.can_change
          ? t("booking.upcoming.cancelBody", { code: booking.booking_code })
          : t("booking.upcoming.cancelLate", {
              time: `${day(booking.change_until, lang, "short")} ${time(booking.change_until, lang)}`,
            })
      }
      confirmLabel={t("booking.upcoming.cancelConfirm")}
      cancelLabel={t("booking.upcoming.keep")}
      closeLabel={t("dashboard.close")}
      tone="danger"
      busy={cancel.isPending}
      error={
        cancel.isError
          ? isApiError(cancel.error)
            ? cancel.error.message
            : t("dashboard.appointments.actionFailed")
          : undefined
      }
      onConfirm={() => cancel.mutate()}
    />
  );
}

// ---- reschedule ------------------------------------------------------------------------------

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

function useSecondsLeft(until: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [until]);
  return until ? Math.max(0, Math.round((Date.parse(until) - now) / 1000)) : 0;
}

/**
 * Reschedule (upgrade 12 §5A): the facility's free times for the same service, week by week; a
 * chosen time is held for a few minutes (countdown) while the patient reviews; the new booking
 * exists only once the server confirms it.
 */
export function RescheduleDialog({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const api = useApi();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = kigaliDate();
  const [week, setWeek] = useState(today);
  const [dayIso, setDayIso] = useState<string | null>(null);
  const [slot, setSlot] = useState<PublicSlot | null>(null);
  const [hold, setHold] = useState<Hold | null>(null);
  const secondsLeft = useSecondsLeft(hold?.expires_at ?? null);
  const expired = hold !== null && secondsLeft === 0;

  const slots = useQuery({
    queryKey: ["discovery", "slots", booking.facility_slug, booking.service_id, week],
    queryFn: () =>
      api.booking.slots(booking.facility_slug, { service_id: booking.service_id, date: week }),
  });
  const days = (slots.data?.days ?? []).filter((d) =>
    d.slots.some((s) => s.open_places > 0 && s.starts_at !== booking.starts_at),
  );
  const shownDay = days.find((d) => d.date === dayIso) ?? days[0];

  const take = useMutation({
    mutationFn: (chosen: PublicSlot) => api.booking.hold(chosen.id),
    onSuccess: (held, chosen) => {
      setSlot(chosen);
      setHold(held);
    },
  });
  const release = () => {
    if (hold && !expired) void api.booking.release(hold.hold_id).catch(() => undefined);
  };
  const confirm = useMutation({
    mutationFn: () => api.booking.reschedule(booking.id, booking.version, hold!.hold_id),
    onSuccess: (made) => {
      void queryClient.invalidateQueries({ queryKey: bookingsKey });
      toast({
        title: t("dashboard.appointments.rescheduled"),
        description: `${day(made.starts_at, lang)} · ${time(made.starts_at, lang)}`,
        action: { label: t("dashboard.appointments.view"), to: paths.appointment(made.id) },
      });
      onClose();
      void navigate(paths.appointment(made.id), { replace: true });
    },
  });
  const close = () => {
    release();
    onClose();
  };
  const back = () => {
    release();
    setHold(null);
    setSlot(null);
    confirm.reset();
  };
  const failure = (error: unknown) =>
    isApiError(error) ? error.message : t("dashboard.appointments.actionFailed");

  const reviewing = hold !== null && slot !== null;
  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(open) => !open && close()}
      title={reviewing ? t("dashboard.reschedule.reviewTitle") : t("dashboard.reschedule.title")}
      description={
        reviewing
          ? undefined
          : t("dashboard.reschedule.body", {
              service: pick(booking.service_name_i18n, lang),
              facility: booking.facility_name,
            })
      }
      closeLabel={t("dashboard.close")}
      footer={
        reviewing ? (
          <>
            <Button variant="secondary" onClick={back}>
              {t("dashboard.reschedule.otherTime")}
            </Button>
            <Button loading={confirm.isPending} disabled={expired} onClick={() => confirm.mutate()}>
              {t("dashboard.reschedule.confirm")}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={close}>
            {t("dashboard.cancel")}
          </Button>
        )
      }
    >
      {reviewing ? (
        <div className="flex flex-col gap-4">
          <dl className="m-0 grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1 rounded-xl border border-border p-4">
              <dt className="text-body-sm text-fg-muted">{t("dashboard.reschedule.from")}</dt>
              <dd className="m-0 font-semibold text-fg-secondary tabular-nums line-through">
                {day(booking.starts_at, lang)} · {time(booking.starts_at, lang)}
              </dd>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-brand/40 bg-brand-subtle p-4">
              <dt className="text-body-sm text-on-brand-subtle">{t("dashboard.reschedule.to")}</dt>
              <dd className="m-0 font-semibold tabular-nums text-fg">
                {day(slot.starts_at, lang)} · {time(slot.starts_at, lang)}
                {slot.doctor && (
                  <span className="block text-body-sm font-normal text-fg-secondary">
                    {slot.doctor}
                  </span>
                )}
              </dd>
            </div>
          </dl>
          {expired ? (
            <Alert tone="warning" role="alert">
              {t("dashboard.reschedule.expired")}
            </Alert>
          ) : (
            <p
              className="m-0 flex items-center gap-2 rounded-xl bg-attention-bg px-4 py-3 text-body-sm text-fg"
              aria-live="off"
            >
              <Clock aria-hidden="true" weight="bold" className="size-5 shrink-0 text-attention" />
              <span>
                {t("dashboard.reschedule.held")}{" "}
                <strong className="tabular-nums text-attention">
                  {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
                </strong>
              </span>
            </p>
          )}
          <p className="m-0 text-body-sm text-fg-secondary">{t("dashboard.reschedule.oldFreed")}</p>
          {confirm.isError && (
            <Alert tone="danger" role="alert">
              {failure(confirm.error)}
            </Alert>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={week <= today}
              onClick={() => {
                setWeek(addDays(week, -7) < today ? today : addDays(week, -7));
                setDayIso(null);
              }}
              iconStart={<CaretLeft aria-hidden="true" className="size-4" />}
            >
              {t("dashboard.reschedule.earlier")}
            </Button>
            <span className="text-body-sm font-semibold tabular-nums text-fg-secondary">
              {formatDate(week, lang, { day: "numeric", month: "short" })} –{" "}
              {formatDate(addDays(week, 6), lang, { day: "numeric", month: "short" })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setWeek(addDays(week, 7));
                setDayIso(null);
              }}
              iconEnd={<CaretRight aria-hidden="true" className="size-4" />}
            >
              {t("dashboard.reschedule.later")}
            </Button>
          </div>
          {slots.isPending ? (
            <Skeleton height="8rem" className="rounded-xl" />
          ) : slots.isError ? (
            <ErrorBlock
              message={t("dashboard.reschedule.loadFailed")}
              onRetry={() => void slots.refetch()}
            />
          ) : !shownDay ? (
            <p className="m-0 rounded-xl border border-dashed border-border p-6 text-center text-fg-secondary">
              {t("dashboard.reschedule.none")}
            </p>
          ) : (
            <>
              <div
                role="group"
                aria-label={t("dashboard.reschedule.days")}
                className="flex gap-2 overflow-x-auto pb-1"
              >
                {days.map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    aria-pressed={d.date === shownDay.date}
                    onClick={() => setDayIso(d.date)}
                    className="flex min-w-16 shrink-0 cursor-pointer flex-col items-center rounded-xl border border-border px-3 py-2 text-fg transition-colors duration-150 hover:border-brand/50 aria-pressed:border-brand aria-pressed:bg-brand-subtle"
                  >
                    <span className="text-caption font-semibold uppercase text-fg-secondary">
                      {formatDate(d.date, lang, { weekday: "short" })}
                    </span>
                    <span className="font-heading text-h3 font-bold tabular-nums">
                      {formatDate(d.date, lang, { day: "numeric" })}
                    </span>
                  </button>
                ))}
              </div>
              <div
                role="group"
                aria-label={t("dashboard.reschedule.times")}
                className="grid grid-cols-3 gap-2 sm:grid-cols-4"
              >
                {shownDay.slots
                  .filter((s) => s.open_places > 0 && s.starts_at !== booking.starts_at)
                  .map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={take.isPending}
                      onClick={() => take.mutate(s)}
                      title={s.doctor ?? undefined}
                      className="min-h-11 cursor-pointer rounded-[10px] border border-border bg-surface font-semibold tabular-nums text-fg transition-colors duration-150 hover:border-brand hover:bg-brand-subtle disabled:cursor-wait disabled:opacity-60"
                    >
                      {time(s.starts_at, lang)}
                    </button>
                  ))}
              </div>
            </>
          )}
          {take.isError && (
            <Alert tone="danger" role="alert">
              {failure(take.error)}
            </Alert>
          )}
        </div>
      )}
    </Dialog>
  );
}

// ---- actions menu ----------------------------------------------------------------------------

/** "More actions" for one appointment: calendar, facility, reschedule, cancel. */
export function AppointmentMenu({
  booking,
  trigger = "icon",
}: {
  booking: Booking;
  trigger?: "icon" | "button";
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const api = useApi();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<"cancel" | "reschedule" | null>(null);
  const live = !isCancelled(booking) && booking.status !== "superseded";
  return (
    <>
      <Menu>
        <MenuTrigger
          aria-label={t("dashboard.appointments.more", {
            service: pick(booking.service_name_i18n, lang),
          })}
          className={
            trigger === "icon"
              ? "inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-fg-secondary transition-colors duration-150 hover:bg-subtle hover:text-fg data-[state=open]:bg-subtle"
              : buttonClassName({ variant: "ghost" })
          }
        >
          <DotsThree aria-hidden="true" weight="bold" className="size-6" />
          {trigger === "button" && t("dashboard.appointments.manage")}
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={() => void navigate(paths.appointment(booking.id))}>
            <IdentificationBadge aria-hidden="true" className="size-5 text-fg-muted" />
            {t("dashboard.appointments.view")}
          </MenuItem>
          {live && (
            <MenuItem
              onSelect={() => {
                window.location.assign(api.booking.icsUrl(booking.id));
              }}
            >
              <CalendarPlus aria-hidden="true" className="size-5 text-fg-muted" />
              {t("booking.flow.addToCalendar")}
            </MenuItem>
          )}
          <MenuItem onSelect={() => void navigate(paths.facility(booking.facility_slug))}>
            <MapPin aria-hidden="true" className="size-5 text-fg-muted" />
            {t("dashboard.appointments.facilityPage")}
          </MenuItem>
          {(canReschedule(booking) || canCancel(booking)) && <MenuSeparator />}
          {canReschedule(booking) && (
            <MenuItem onSelect={() => setDialog("reschedule")}>
              <CalendarBlank aria-hidden="true" className="size-5 text-fg-muted" />
              {t("dashboard.appointments.reschedule")}
            </MenuItem>
          )}
          {canCancel(booking) && (
            <MenuItem onSelect={() => setDialog("cancel")} className="text-danger">
              <CalendarBlank aria-hidden="true" className="size-5" />
              {t("dashboard.appointments.cancel")}
            </MenuItem>
          )}
        </MenuContent>
      </Menu>
      {dialog === "cancel" && (
        <CancelAppointmentDialog booking={booking} onClose={() => setDialog(null)} />
      )}
      {dialog === "reschedule" && (
        <RescheduleDialog booking={booking} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

// ---- rows ------------------------------------------------------------------------------------

export function AppointmentRow({ booking, showWho }: { booking: Booking; showWho: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  return (
    <RowLink
      to={paths.appointment(booking.id)}
      leading={<DateBlock iso={booking.starts_at} />}
      title={pick(booking.service_name_i18n, lang)}
      meta={[
        time(booking.starts_at, lang),
        booking.facility_name,
        booking.doctor,
        showWho ? t("dashboard.appointments.for", { name: booking.patient_display_name }) : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      trailing={<AppointmentBadge booking={booking} />}
      after={<AppointmentMenu booking={booking} />}
    />
  );
}

// ---- list page -------------------------------------------------------------------------------

/** My appointments (upgrade 12 §6): Upcoming, Past and Cancelled, each a list of rows. */
export function AppointmentsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("upcoming");
  const upcoming = useUpcoming();
  const past = usePastBookings(tab !== "upcoming");
  const profiles = useProfiles();
  const showWho = (profiles.data?.results.length ?? 0) > 1;

  const upcomingRows = (upcoming.data?.results ?? []).filter(
    (b) => !isCancelled(b) && b.status !== "superseded",
  );
  const pastRows = (past.data?.results ?? []).filter(
    (b) => !isCancelled(b) && b.status !== "superseded",
  );
  const seen = new Set<string>();
  const cancelledRows = [...(upcoming.data?.results ?? []), ...(past.data?.results ?? [])]
    .filter((b) => isCancelled(b) && !seen.has(b.id) && seen.add(b.id))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));

  const rows = tab === "upcoming" ? upcomingRows : tab === "past" ? pastRows : cancelledRows;
  // Cancelled ones can be in either list, so that view waits for both
  const sources = tab === "upcoming" ? [upcoming] : tab === "past" ? [past] : [upcoming, past];
  const loading = sources.some((source) => source.isPending);
  const failed = sources.some((source) => source.isError);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("dashboard.appointments.title")}
        subtitle={t("dashboard.appointments.subtitle")}
        actions={
          <Link to={`${paths.findCare}?mode=booking`} className={buttonClassName({})}>
            <CalendarPlus aria-hidden="true" className="size-icon" />
            {t("dashboard.appointments.book")}
          </Link>
        }
      />
      <SegmentedTabs
        label={t("dashboard.appointments.views")}
        value={tab}
        onChange={setTab}
        options={[
          {
            value: "upcoming",
            label: t("dashboard.appointments.tabs.upcoming"),
            count: upcoming.data ? upcomingRows.length : undefined,
          },
          { value: "past", label: t("dashboard.appointments.tabs.past") },
          { value: "cancelled", label: t("dashboard.appointments.tabs.cancelled") },
        ]}
      />
      <div aria-live="polite" className="flex flex-col gap-6">
        {loading ? (
          <RowsSkeleton rows={3} />
        ) : failed ? (
          <ErrorBlock
            message={t("dashboard.appointments.failed")}
            onRetry={() => {
              void upcoming.refetch();
              if (tab !== "upcoming") void past.refetch();
            }}
          />
        ) : rows.length ? (
          <RowList label={t(`dashboard.appointments.tabs.${tab}`)}>
            {rows.map((b) => (
              <AppointmentRow key={b.id} booking={b} showWho={showWho} />
            ))}
          </RowList>
        ) : (
          <EmptyState
            icon={CalendarBlank}
            title={t(`dashboard.appointments.empty.${tab}`)}
            description={tab === "upcoming" ? t("dashboard.appointments.emptyBody") : undefined}
            action={
              tab === "upcoming" ? (
                <Link to={paths.findCare} className={buttonClassName({})}>
                  {t("dashboard.findCare")}
                </Link>
              ) : undefined
            }
          />
        )}
        {tab === "upcoming" && <CalendarFeedCard />}
      </div>
    </div>
  );
}

// ---- detail page -----------------------------------------------------------------------------

function Fact({
  icon: FactIcon,
  label,
  children,
}: {
  icon: Icon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <FactIcon aria-hidden="true" weight="duotone" className="mt-0.5 size-5 shrink-0 text-brand" />
      <div className="flex min-w-0 flex-col">
        <dt className="text-body-sm text-fg-muted">{label}</dt>
        <dd className="m-0 font-semibold text-fg">{children}</dd>
      </div>
    </div>
  );
}

function PanelTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="m-0 mb-4 font-heading text-h3 font-bold text-fg">
      {children}
    </h2>
  );
}

const TIMELINE_END: Partial<Record<Booking["status"], string>> = {
  checked_in: "checkedIn",
  cancelled: "cancelled",
  late_cancelled: "cancelled",
  no_show: "missed",
  superseded: "rescheduled",
};

/** /dashboard/appointments/:id (upgrade 12 §6): details on the left, reference and actions right. */
export function AppointmentDetailPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const api = useApi();
  const { bookingId = "" } = useParams();
  const [dialog, setDialog] = useState<"cancel" | "reschedule" | null>(null);
  const appointment = useQuery({
    queryKey: [...bookingsKey, "detail", bookingId],
    queryFn: () => api.booking.booking(bookingId),
  });
  const b = appointment.data;
  const facility = useFacilityProfile(b?.facility_slug);
  const f = facility.data;
  const todayHours = f?.hours.find(([date]) => date === kigaliDate());
  const back = { to: paths.appointments, label: t("dashboard.appointments.back") };

  if (appointment.isPending)
    return (
      <div className="flex flex-col gap-6">
        <Skeleton height="2.5rem" width="50%" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton height="16rem" className="rounded-2xl" />
          <Skeleton height="12rem" className="rounded-2xl" />
        </div>
      </div>
    );
  if (appointment.isError || !b)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("dashboard.appointments.notFound")} back={back} />
        <ErrorBlock
          message={t("dashboard.appointments.notFoundBody")}
          onRetry={() => void appointment.refetch()}
        />
      </div>
    );

  const end = TIMELINE_END[b.status];
  const steps = [
    { key: "booked", done: true },
    { key: "day", done: end === "checkedIn" || end === "missed", date: b.starts_at },
    ...(end ? [{ key: end, done: true }] : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pick(b.service_name_i18n, lang)}
        subtitle={b.facility_name}
        back={back}
        actions={<AppointmentBadge booking={b} />}
      />
      {b.pending_change && <OfferBanner booking={b} />}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel as="section" aria-labelledby="appt-info">
            <PanelTitle id="appt-info">{t("dashboard.appointments.info")}</PanelTitle>
            <dl className="m-0 grid gap-5 sm:grid-cols-2">
              <Fact icon={CalendarBlank} label={t("dashboard.appointments.date")}>
                {day(b.starts_at, lang)}
              </Fact>
              <Fact icon={Clock} label={t("dashboard.appointments.time")}>
                <span className="tabular-nums text-attention">
                  {time(b.starts_at, lang)}
                  {b.ends_at ? ` – ${time(b.ends_at, lang)}` : ""}
                </span>
              </Fact>
              {b.doctor && (
                <Fact icon={Stethoscope} label={t("dashboard.appointments.doctor")}>
                  {b.doctor}
                </Fact>
              )}
              <Fact icon={IdentificationBadge} label={t("dashboard.appointments.patient")}>
                {b.patient_display_name}
              </Fact>
              {b.service_point && (
                <Fact icon={MapPin} label={t("dashboard.appointments.room")}>
                  {b.service_point}
                </Fact>
              )}
            </dl>
            {b.symptoms.length > 0 && (
              <div className="mt-5 border-t border-border pt-4">
                <p className="m-0 mb-2 text-body-sm text-fg-muted">
                  {t("dashboard.appointments.reason")}
                </p>
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {b.symptoms.map((s) => (
                    <li key={s.code} className="rounded-full bg-subtle px-3 py-1 text-body-sm">
                      {s.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          <Panel as="section" aria-labelledby="appt-facility">
            <PanelTitle id="appt-facility">{t("dashboard.appointments.facility")}</PanelTitle>
            {facility.isPending ? (
              <Skeleton height="4rem" />
            ) : f ? (
              <dl className="m-0 grid gap-5 sm:grid-cols-2">
                <Fact icon={MapPin} label={f.name}>
                  <span className="font-normal text-fg-secondary">
                    {[f.address, f.sector, f.district].filter(Boolean).join(", ")}
                  </span>
                </Fact>
                {todayHours && (
                  <Fact icon={Clock} label={t("dashboard.appointments.hoursToday")}>
                    <span className="tabular-nums">
                      {todayHours[1]} – {todayHours[2]}
                    </span>
                  </Fact>
                )}
                {f.phone && (
                  <Fact icon={Phone} label={t("dashboard.appointments.phone")}>
                    <a href={`tel:${f.phone}`} className="tabular-nums text-link">
                      {f.phone}
                    </a>
                  </Fact>
                )}
              </dl>
            ) : (
              <p className="m-0 text-fg-secondary">{b.facility_name}</p>
            )}
            <Link
              to={paths.facility(b.facility_slug)}
              className="mt-4 inline-flex text-body-sm font-semibold text-link"
            >
              {t("dashboard.appointments.facilityPage")}
            </Link>
          </Panel>

          <Panel as="section" aria-labelledby="appt-timeline">
            <PanelTitle id="appt-timeline">{t("dashboard.appointments.timeline")}</PanelTitle>
            <ol className="m-0 flex list-none flex-col p-0">
              {steps.map((step, index) => (
                <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
                  {index < steps.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute top-5 left-[0.6875rem] h-full w-px bg-border"
                    />
                  )}
                  <span
                    aria-hidden="true"
                    className={cx(
                      "relative mt-0.5 size-6 shrink-0 rounded-full border-2",
                      step.done ? "border-brand bg-brand" : "border-border bg-surface",
                    )}
                  />
                  <span className="flex flex-col">
                    <span className="font-semibold">
                      {t(`dashboard.appointments.steps.${step.key}`)}
                    </span>
                    {"date" in step && step.date && (
                      <span className="text-body-sm tabular-nums text-fg-secondary">
                        {day(step.date, lang)} · {time(step.date, lang)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel as="section" aria-labelledby="appt-bring">
            <PanelTitle id="appt-bring">{t("dashboard.appointments.bring")}</PanelTitle>
            <ul className="m-0 flex flex-col gap-2 pl-5 text-fg-secondary">
              <li>{t("dashboard.appointments.bringItems.id")}</li>
              {b.cost.insurer_code && <li>{t("dashboard.appointments.bringItems.insurance")}</li>}
              <li>{t("dashboard.appointments.bringItems.code", { code: b.booking_code })}</li>
              <li>{t("dashboard.appointments.bringItems.papers")}</li>
            </ul>
          </Panel>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <Panel className="flex flex-col items-center gap-2 text-center">
            <span className="text-caption font-semibold tracking-[0.14em] text-fg-muted uppercase">
              {t("dashboard.appointments.reference")}
            </span>
            <span className="font-mono text-h1 font-bold tracking-[0.2em] tabular-nums text-fg">
              {b.booking_code}
            </span>
            <span className="text-body-sm text-fg-secondary">
              {t("dashboard.appointments.showCode")}
            </span>
          </Panel>

          <Panel className="flex flex-col gap-3">
            <p className="m-0 text-body-sm text-fg-secondary">
              {b.status === "confirmed"
                ? b.can_change
                  ? t("dashboard.appointments.changeUntil", {
                      time: `${day(b.change_until, lang, "short")} ${time(b.change_until, lang)}`,
                    })
                  : t("dashboard.appointments.changeClosed")
                : t(`dashboard.status.${b.status === "superseded" ? "rescheduled" : b.status}`)}
            </p>
            {f?.lat != null && f.lng != null ? (
              <a
                href={directionsUrl(f.lat, f.lng)}
                target="_blank"
                rel="noreferrer"
                className={buttonClassName({ variant: "secondary", fullWidth: true })}
              >
                <NavigationArrow aria-hidden="true" className="size-icon" />
                {t("dashboard.appointments.directions")}
                <ArrowSquareOut aria-hidden="true" className="size-4" />
              </a>
            ) : null}
            {!isCancelled(b) && b.status !== "superseded" && (
              <a
                href={api.booking.icsUrl(b.id)}
                download
                className={buttonClassName({ variant: "secondary", fullWidth: true })}
              >
                <CalendarPlus aria-hidden="true" className="size-icon" />
                {t("booking.flow.addToCalendar")}
              </a>
            )}
            {canReschedule(b) && (
              <Button fullWidth onClick={() => setDialog("reschedule")}>
                {t("dashboard.appointments.reschedule")}
              </Button>
            )}
            {canCancel(b) && (
              <Button
                variant="ghost"
                fullWidth
                onClick={() => setDialog("cancel")}
                className="text-danger"
              >
                {t("dashboard.appointments.cancel")}
              </Button>
            )}
          </Panel>
        </aside>
      </div>

      {dialog === "cancel" && (
        <CancelAppointmentDialog booking={b} onClose={() => setDialog(null)} />
      )}
      {dialog === "reschedule" && <RescheduleDialog booking={b} onClose={() => setDialog(null)} />}
    </div>
  );
}
