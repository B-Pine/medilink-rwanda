import { isApiError, type Booking, type RespondInput } from "@medilink/api-client";
import { Alert, Button, Card, Dialog, SelectField, SwitchField, TextField } from "@medilink/ui";
import { CalendarDots, Copy } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { bookingsKey } from "./BookPage";
import { day, time } from "./discovery";

function useRespond(booking: Booking, onDone?: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RespondInput) => api.booking.respond(booking.id, body),
    onSuccess: () => {
      onDone?.();
      void queryClient.invalidateQueries({ queryKey: bookingsKey });
    },
  });
}

/** "Choose another time": a day, a free time, then the hold answers the offer (B10). */
function OtherTime({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const api = useApi();
  const [date, setDate] = useState("");
  const week = useQuery({
    queryKey: ["booking", "offer-slots", booking.facility_slug, booking.service_id],
    queryFn: () => api.booking.slots(booking.facility_slug, { service_id: booking.service_id }),
  });
  const respond = useRespond(booking, onClose);
  const pick = useMutation({
    mutationFn: async (slotId: string) => {
      const hold = await api.booking.hold(slotId);
      return respond.mutateAsync({ hold_id: hold.hold_id });
    },
  });
  const days = (week.data?.days ?? []).filter((d) => d.slots.length > 0);
  const chosen = days.find((d) => d.date === date) ?? days[0];
  const error = pick.error ?? respond.error;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("booking.offer.otherTitle")}
      closeLabel={t("booking.upcoming.keep")}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t("booking.upcoming.keep")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {week.isPending ? (
          <p className="m-0">{t("booking.offer.loading")}</p>
        ) : days.length === 0 ? (
          <Alert tone="info">{t("booking.offer.noTimes")}</Alert>
        ) : (
          <>
            <SelectField
              label={t("booking.offer.day")}
              value={chosen?.date ?? ""}
              onChange={(e) => setDate(e.target.value)}
            >
              {days.map((d) => (
                <option key={d.date} value={d.date}>
                  {day(`${d.date}T12:00:00+02:00`, lang)}
                </option>
              ))}
            </SelectField>
            <div
              role="group"
              aria-label={t("booking.offer.times")}
              className="flex flex-wrap gap-2"
            >
              {(chosen?.slots ?? []).map((s) => (
                <Button
                  key={s.id}
                  variant="secondary"
                  loading={pick.isPending && pick.variables === s.id}
                  onClick={() => pick.mutate(s.id)}
                >
                  {time(s.starts_at, lang)}
                </Button>
              ))}
            </div>
          </>
        )}
        {error && (
          <Alert tone="danger" role="alert">
            {isApiError(error) ? error.message : t("booking.flow.failed")}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}

/**
 * A disruption offer on a booking (contract S5 §6.1, B10): the facility moved it; keep the new
 * time, choose another one, or cancel (never a late cancellation).
 */
export function OfferBanner({ booking }: { booking: Booking }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const [other, setOther] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const respond = useRespond(booking, () => setCancelling(false));
  const change = booking.pending_change;
  if (!change) return null;
  const when = (iso: string) => `${day(iso, lang, "short")} ${time(iso, lang)}`;
  return (
    <Alert tone="warning" title={t("booking.offer.title")}>
      <div className="flex flex-col gap-3">
        <p className="m-0">
          {change.previous_starts_at
            ? t("booking.offer.moved", {
                from: when(change.previous_starts_at),
                to: when(booking.starts_at),
              })
            : t("booking.offer.movedTo", { to: when(booking.starts_at) })}
          {change.previous_doctor && booking.doctor && change.previous_doctor !== booking.doctor
            ? ` ${t("booking.offer.doctor", { doctor: booking.doctor })}`
            : ""}
        </p>
        <p className="m-0 text-body-sm">
          {change.auto_accept
            ? t("booking.offer.autoAccept", { time: when(change.reply_by) })
            : t("booking.offer.answer")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            loading={respond.isPending && !cancelling}
            onClick={() => respond.mutate({ response: "accept", version: booking.version })}
          >
            {t("booking.offer.keep")}
          </Button>
          <Button variant="secondary" onClick={() => setOther(true)}>
            {t("booking.offer.other")}
          </Button>
          <Button variant="ghost" onClick={() => setCancelling(true)}>
            {t("booking.offer.cancel")}
          </Button>
        </div>
        {respond.isError && !cancelling && (
          <p role="alert" className="m-0 text-danger">
            {isApiError(respond.error) ? respond.error.message : t("booking.flow.failed")}
          </p>
        )}
      </div>
      {other && <OtherTime booking={booking} onClose={() => setOther(false)} />}
      {cancelling && (
        <Dialog
          open
          onOpenChange={(o) => !o && setCancelling(false)}
          title={t("booking.upcoming.cancelTitle")}
          description={t("booking.offer.cancelBody", { code: booking.booking_code })}
          closeLabel={t("booking.upcoming.keep")}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCancelling(false)}>
                {t("booking.upcoming.keep")}
              </Button>
              <Button
                variant="danger"
                loading={respond.isPending}
                onClick={() => respond.mutate({ response: "cancel", version: booking.version })}
              >
                {t("booking.upcoming.cancelConfirm")}
              </Button>
            </>
          }
        >
          {respond.isError && (
            <Alert tone="danger" role="alert">
              {isApiError(respond.error) ? respond.error.message : t("booking.flow.failed")}
            </Alert>
          )}
        </Dialog>
      )}
    </Alert>
  );
}

const feedKey = ["booking", "calendar-feed"] as const;

/**
 * Calendar subscription (contract S5 §6.1, B11): a private link for a calendar app, with the
 * family's bookings. The link is shown once; turning it off revokes it.
 */
export function CalendarFeedCard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const api = useApi();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const status = useQuery({ queryKey: feedKey, queryFn: () => api.booking.calendarFeed.get() });
  const turnOn = useMutation({
    mutationFn: () => api.booking.calendarFeed.create(),
    onSuccess: (out) => {
      setUrl(out.url);
      void queryClient.invalidateQueries({ queryKey: feedKey });
    },
  });
  const turnOff = useMutation({
    mutationFn: () => api.booking.calendarFeed.revoke(),
    onSuccess: () => {
      setUrl(null);
      void queryClient.invalidateQueries({ queryKey: feedKey });
    },
  });
  const active = status.data?.is_active ?? false;
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Card as="section" aria-labelledby="calendar-feed" className="flex flex-col gap-3">
      <h2 id="calendar-feed" className="m-0 flex items-center gap-2 text-h3">
        <CalendarDots aria-hidden="true" weight="duotone" className="size-6 text-brand" />
        {t("booking.feed.title")}
      </h2>
      <p className="m-0 text-fg-secondary">{t("booking.feed.body")}</p>
      <SwitchField
        label={t("booking.feed.toggle")}
        checked={active}
        disabled={status.isPending || turnOn.isPending || turnOff.isPending}
        onCheckedChange={(on) => (on ? turnOn.mutate() : turnOff.mutate())}
        stateLabel={active ? t("booking.feed.on") : t("booking.feed.off")}
      />
      {url && (
        <div className="flex flex-col gap-2">
          <TextField
            label={t("booking.feed.link")}
            value={url}
            readOnly
            hint={t("booking.feed.once")}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void copy()}>
              <Copy aria-hidden="true" />
              {t("booking.feed.copy")}
            </Button>
            <a
              className="self-center font-semibold text-link"
              href={url.replace(/^https?:/, "webcal:")}
            >
              {t("booking.feed.open")}
            </a>
          </div>
          <p role="status" className="m-0 text-body-sm text-success">
            {copied ? t("booking.feed.copied") : ""}
          </p>
        </div>
      )}
      {active && !url && status.data?.created_at && (
        <p className="m-0 text-body-sm text-fg-muted">
          {t("booking.feed.since", { day: day(status.data.created_at, lang) })}
        </p>
      )}
      {(turnOn.isError || turnOff.isError || status.isError) && (
        <Alert tone="danger" role="alert">
          {t("booking.feed.failed")}
        </Alert>
      )}
    </Card>
  );
}
