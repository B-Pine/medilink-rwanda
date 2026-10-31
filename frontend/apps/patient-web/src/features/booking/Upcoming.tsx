import { isApiError, type Booking } from "@medilink/api-client";
import {
  CalendarBlank,
  CalendarCheck,
  CalendarPlus,
  CaretRight,
  MapPin,
  Stethoscope,
} from "@phosphor-icons/react";
import {
  Alert,
  Badge,
  Button,
  buttonClassName,
  Card,
  Dialog,
  EmptyState,
  Skeleton,
} from "@medilink/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { bookingsKey } from "./BookPage";
import { day, pick, rwf, time } from "./discovery";

export function useUpcoming() {
  const api = useApi();
  return useQuery({
    queryKey: [...bookingsKey, "upcoming"],
    queryFn: () => api.booking.bookings(),
  });
}

function DateTile({ iso }: { iso: string }) {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const date = new Date(iso);
  const part = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(lang, { ...o, timeZone: "Africa/Kigali" }).format(date);
  return (
    <span
      aria-hidden="true"
      className="flex w-16 shrink-0 flex-col items-center overflow-hidden rounded-md border border-border bg-surface text-center"
    >
      <span className="w-full bg-brand py-0.5 text-caption font-semibold uppercase text-on-primary">
        {part({ month: "short" })}
      </span>
      <span className="font-heading text-h1 leading-tight tabular-nums">
        {part({ day: "numeric" })}
      </span>
      <span className="pb-1 text-caption text-fg-muted">{part({ weekday: "short" })}</span>
    </span>
  );
}

function CancelBooking({ booking }: { booking: Booking }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const api = useApi();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const cancel = useMutation({
    mutationFn: () => api.booking.cancel(booking.id, booking.version),
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: bookingsKey });
    },
  });
  return (
    <>
      <Button variant="ghost" size="md" onClick={() => setOpen(true)}>
        {t("booking.upcoming.cancel")}
      </Button>
      {open && (
        <Dialog
          open
          onOpenChange={(o) => !o && setOpen(false)}
          title={t("booking.upcoming.cancelTitle")}
          description={
            booking.can_change
              ? t("booking.upcoming.cancelBody", { code: booking.booking_code })
              : t("booking.upcoming.cancelLate", {
                  time: `${day(booking.change_until, lang, "short")} ${time(booking.change_until, lang)}`,
                })
          }
          closeLabel={t("booking.upcoming.keep")}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {t("booking.upcoming.keep")}
              </Button>
              <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
                {t("booking.upcoming.cancelConfirm")}
              </Button>
            </>
          }
        >
          {cancel.isError && (
            <Alert tone="danger" role="alert">
              {isApiError(cancel.error) ? cancel.error.message : t("booking.flow.failed")}
            </Alert>
          )}
        </Dialog>
      )}
    </>
  );
}

export function BookingCard({ booking }: { booking: Booking }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const api = useApi();
  const pay = booking.cost.patient_share_rwf;
  return (
    <article
      aria-labelledby={`bk-${booking.id}`}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-raised"
    >
      <div className="flex items-start gap-4">
        <DateTile iso={booking.starts_at} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 id={`bk-${booking.id}`} className="m-0 text-h3">
            {pick(booking.service_name_i18n, lang)}
          </h3>
          <p className="m-0 font-semibold tabular-nums">
            {time(booking.starts_at, lang)}
            {booking.doctor && (
              <span className="font-normal text-fg-secondary"> · {booking.doctor}</span>
            )}
          </p>
          <p className="m-0 flex items-center gap-1 text-body-sm text-fg-secondary">
            <MapPin aria-hidden="true" className="size-4" />
            {booking.facility_name}
          </p>
          <p className="m-0 flex flex-wrap items-center gap-2 text-body-sm">
            <Badge tone="brand">
              {t("booking.upcoming.forWhom", { name: booking.patient_display_name })}
            </Badge>
            <span className="text-fg-muted">
              {t("booking.flow.code")}:{" "}
              <span className="font-mono font-semibold text-fg">{booking.booking_code}</span>
            </span>
            {pay !== null && <span className="text-fg-muted">· {rwf(pay, lang)}</span>}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <a
          href={api.booking.icsUrl(booking.id)}
          download
          className={buttonClassName({ variant: "secondary", size: "md" })}
        >
          <CalendarPlus aria-hidden="true" className="size-icon" />
          {t("booking.flow.addToCalendar")}
        </a>
        <Link
          to={`/facilities/${booking.facility_slug}`}
          className={buttonClassName({ variant: "ghost", size: "md" })}
        >
          {t("booking.upcoming.facility")}
        </Link>
        {booking.status === "confirmed" && <CancelBooking booking={booking} />}
      </div>
    </article>
  );
}

/** My visits: upcoming bookings (design 07 §3.4). */
export function UpcomingSection() {
  const { t } = useTranslation();
  const upcoming = useUpcoming();
  const rows = upcoming.data?.results ?? [];
  return (
    <section aria-labelledby="visits-upcoming" className="flex flex-col gap-3">
      <h2 id="visits-upcoming" className="m-0 text-h3">
        {t("booking.upcoming.title")}
      </h2>
      {upcoming.isPending ? (
        <Skeleton height="9rem" className="rounded-lg" />
      ) : upcoming.isError ? (
        <Alert tone="danger" role="alert" title={t("booking.upcoming.failed")}>
          <Button variant="secondary" onClick={() => void upcoming.refetch()}>
            {t("common.retry")}
          </Button>
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyState
          size="inline"
          icon={CalendarBlank}
          title={t("booking.upcoming.none")}
          description={t("booking.upcoming.noneBody")}
          action={
            <Link to="/search" className={buttonClassName({})}>
              <CalendarPlus aria-hidden="true" className="size-icon" />
              {t("booking.upcoming.book")}
            </Link>
          }
        />
      ) : (
        rows.map((b) => <BookingCard key={b.id} booking={b} />)
      )}
    </section>
  );
}

/** Home (design 07 §3.1): the next appointment. */
export function NextVisitCard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const upcoming = useUpcoming();
  const next = upcoming.data?.results[0];
  return (
    <Card as="section" aria-labelledby="next-visit" className="flex flex-col gap-3">
      <h2 id="next-visit" className="m-0 flex items-center gap-2 text-h3">
        <CalendarCheck aria-hidden="true" weight="duotone" className="size-6 text-brand" />
        {t("home.nextVisitTitle")}
      </h2>
      {upcoming.isPending ? (
        <Skeleton height="4.5rem" className="rounded-md" />
      ) : next ? (
        <Link
          to="/visits"
          className="flex items-center gap-4 rounded-md p-1 text-fg no-underline hover:bg-subtle"
        >
          <DateTile iso={next.starts_at} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-semibold">{pick(next.service_name_i18n, lang)}</span>
            <span className="tabular-nums text-fg-secondary">
              {time(next.starts_at, lang)} · {next.facility_name}
            </span>
            {next.doctor && (
              <span className="inline-flex items-center gap-1 text-body-sm text-fg-muted">
                <Stethoscope aria-hidden="true" className="size-4" />
                {next.doctor}
              </span>
            )}
          </span>
          <CaretRight aria-hidden="true" className="size-5 text-fg-muted" />
        </Link>
      ) : (
        <EmptyState
          size="inline"
          icon={CalendarBlank}
          title={t("home.nextVisitEmptyTitle")}
          description={t("home.nextVisitEmpty")}
        />
      )}
    </Card>
  );
}
