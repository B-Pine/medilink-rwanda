import type { CheckInResult, StaffBooking } from "@medilink/api-client";
import { isApiError, newIdempotencyKey } from "@medilink/api-client";
import { Alert, Badge, Button, cx, TextField } from "@medilink/ui";
import { CheckCircle, QrCode, Ticket } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { kigaliDate, slotTime } from "../bookings/time";
import { expectedKey } from "./ExpectedList";
import { queueKeys } from "./live";
import { actionError, useServiceNames } from "./shared";

/**
 * Check in by booking code (upgrade 05 §2): the patient shows the code on their phone (or reads it
 * out); reception types it, sees who it is and checks them in with one tap. Today's and later
 * bookings only; a future booking says so instead of checking in.
 */
export function CodeCheckIn({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const serviceName = useServiceNames();
  const language = i18n.resolvedLanguage ?? "en";
  const [code, setCode] = useState("");
  const [done, setDone] = useState<{ booking: StaffBooking; result: CheckInResult } | null>(null);

  const find = useMutation({
    mutationFn: (value: string) => api.booking.staff.bookings({ code: value }),
  });
  const checkIn = useMutation({
    mutationFn: (booking: StaffBooking) =>
      api.queue.checkIn({ booking_id: booking.id }, newIdempotencyKey()),
    onSuccess: (result, booking) => {
      setDone({ booking, result });
      setCode("");
      find.reset();
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: expectedKey });
      void queryClient.invalidateQueries({ queryKey: queueKeys.board });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = code.trim().toUpperCase().replace(/\s/g, "");
    if (value.length < 4) return;
    setDone(null);
    checkIn.reset();
    find.mutate(value);
  };

  const today = kigaliDate();
  const match = find.data?.results[0];
  const isToday = match ? match.starts_at.slice(0, 10) <= today : false;

  return (
    <section
      aria-labelledby="code-check-in"
      className={cx("flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-card", className)}
    >
      <h2
        id="code-check-in"
        className="m-0 flex items-center gap-2 font-heading text-body font-semibold"
      >
        <QrCode aria-hidden="true" weight="bold" className="size-5 text-primary" />
        {t("queue.code.title")}
      </h2>
      <form noValidate onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <TextField
          label={t("queue.code.label")}
          hideLabel
          placeholder={t("queue.code.placeholder")}
          value={code}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={12}
          onChange={(e) => setCode(e.target.value)}
          className="min-w-0 flex-1 basis-40"
          inputClassName="font-heading font-bold tracking-[0.2em] uppercase"
        />
        <Button type="submit" pill loading={find.isPending} disabled={code.trim().length < 4}>
          {t("queue.code.find")}
        </Button>
      </form>

      {find.isError && (
        <Alert tone="danger" role="alert">
          {isApiError(find.error) ? find.error.message : t("queue.failed")}
        </Alert>
      )}
      {find.isSuccess && !match && (
        <p role="status" className="m-0 rounded-xl bg-subtle px-3 py-2.5 text-body-sm">
          {t("queue.code.notFound")}
        </p>
      )}
      {match && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl bg-brand-subtle/60 p-3 animate-enter"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">{match.display_name}</span>
            <span className="text-body-sm text-fg-secondary tabular-nums">
              {isToday
                ? slotTime(match.starts_at, language)
                : t("queue.code.onDay", { date: match.starts_at.slice(0, 10) })}{" "}
              · {serviceName(match.service_id)}
              {match.doctor ? ` · ${match.doctor}` : ""}
            </span>
          </span>
          {match.late && <Badge tone="warning">{t("queue.board.expectedLate")}</Badge>}
          {match.status !== "confirmed" ? (
            <Badge tone="neutral">{t(`queue.code.status.${match.status}`, match.status)}</Badge>
          ) : isToday ? (
            <Button
              pill
              loading={checkIn.isPending}
              onClick={() => checkIn.mutate(match)}
              aria-label={`${t("queue.board.expectedCheckIn")}: ${match.display_name}`}
            >
              <Ticket aria-hidden="true" weight="bold" />
              {t("queue.board.expectedCheckIn")}
            </Button>
          ) : (
            <Badge tone="info">{t("queue.code.notToday")}</Badge>
          )}
        </div>
      )}
      {checkIn.isError && (
        <Alert tone="danger" role="alert">
          {actionError(checkIn.error, t("queue.board.expectedCheckInError"))}
        </Alert>
      )}
      {done && (
        <p
          role="status"
          className="m-0 flex items-center gap-2 rounded-xl bg-success-bg px-3 py-2.5 text-body-sm font-semibold"
        >
          <CheckCircle aria-hidden="true" weight="fill" className="size-5 text-success" />
          {t("queue.board.expectedCheckedIn", {
            name: done.booking.display_name,
            ticket: done.result.ticket.number,
          })}
        </p>
      )}
    </section>
  );
}
