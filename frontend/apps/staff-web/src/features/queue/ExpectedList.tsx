import type { NoShowReversalReason, StaffBooking } from "@medilink/api-client";
import { newIdempotencyKey, NO_SHOW_REVERSAL_REASONS } from "@medilink/api-client";
import { Alert, Badge, Button, EmptyState } from "@medilink/ui";
import { CalendarCheck } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { queueKeys, usePollInterval } from "./live";
import { actionError, ReasonDialog, useCan, useServiceNames } from "./shared";

export const expectedKey = ["queue", "expected"] as const;

/** Today's date in Kigali as YYYY-MM-DD, the `date` filter of `GET /staff/bookings/`. */
export function kigaliToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali" }).format(now);
}

function slotTime(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Africa/Kigali",
  }).format(new Date(iso));
}

/**
 * Expected (design 04 §3.1, contract S5 R1): today's confirmed bookings by slot time, until the
 * patient is checked in (R6). `serviceId` follows the board's service filter.
 */
export function ExpectedList({ serviceId }: { serviceId: string | null }) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const serviceName = useServiceNames();
  const canCheckIn = useCan("queue.operate");
  const refetchInterval = usePollInterval();
  const language = i18n.resolvedLanguage ?? "en";
  const today = kigaliToday();

  const bookings = useQuery({
    queryKey: [...expectedKey, today],
    queryFn: () => api.booking.staff.bookings({ date: today, status: "confirmed" }),
    refetchInterval,
  });

  const checkIn = useMutation({
    mutationFn: (booking: StaffBooking) =>
      api.queue.checkIn({ booking_id: booking.id }, newIdempotencyKey()),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: expectedKey });
      void queryClient.invalidateQueries({ queryKey: queueKeys.board });
    },
  });

  if (bookings.isError) {
    return (
      <Alert tone="danger">
        <span className="flex flex-col items-start gap-2">
          {t("queue.board.expectedError")}
          <Button variant="secondary" onClick={() => void bookings.refetch()}>
            {t("queue.board.expectedRetry")}
          </Button>
        </span>
      </Alert>
    );
  }

  const rows = (bookings.data?.results ?? []).filter(
    (booking) => !serviceId || booking.service_id === serviceId,
  );

  if (bookings.isSuccess && rows.length === 0) {
    return (
      <EmptyState
        size="inline"
        icon={CalendarCheck}
        title={t("queue.board.expectedEmptyTitle")}
        description={t("queue.board.expectedEmpty")}
        className="rounded-lg border border-dashed border-border"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {checkIn.isError && (
        <Alert tone="danger">
          {actionError(checkIn.error, t("queue.board.expectedCheckInError"))}
        </Alert>
      )}
      <ul
        aria-label={t("queue.board.expected")}
        aria-busy={bookings.isPending}
        className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border bg-surface p-0"
      >
        {rows.map((booking) => (
          <li key={booking.id} className="flex flex-col gap-2.5 px-3 py-3">
            <div className="flex items-start gap-3">
              <time
                dateTime={booking.starts_at}
                className="shrink-0 font-semibold tabular-nums leading-6"
              >
                {slotTime(booking.starts_at, language)}
              </time>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold leading-6 break-words">{booking.display_name}</span>
                <span className="text-body-sm text-fg-muted break-words">
                  {serviceName(booking.service_id)}
                </span>
                <span className="text-body-sm text-fg-muted break-words">
                  {booking.doctor ?? t("queue.board.expectedAnyDoctor")}
                </span>
              </span>
              {booking.late && (
                <Badge tone="warning" className="shrink-0">
                  {t("queue.board.expectedLate")}
                </Badge>
              )}
            </div>
            {canCheckIn && (
              <Button
                variant="secondary"
                fullWidth
                loading={checkIn.isPending && checkIn.variables?.id === booking.id}
                disabled={checkIn.isPending}
                onClick={() => checkIn.mutate(booking)}
              >
                {t("queue.board.expectedCheckIn")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Missed today (contract S5 R5, FR-SCH-13): bookings the no-show job closed today. Reception can
 * undo one with a reason (`patient_was_present`, `facility_delay`, `other` with text), which
 * removes the patient's strike. Hidden when there is none.
 */
export function MissedList({ serviceId }: { serviceId: string | null }) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const serviceName = useServiceNames();
  const canUndo = useCan("queue.operate");
  const refetchInterval = usePollInterval();
  const language = i18n.resolvedLanguage ?? "en";
  const today = kigaliToday();
  const [undoing, setUndoing] = useState<StaffBooking | null>(null);

  const missed = useQuery({
    queryKey: [...expectedKey, "no_show", today],
    queryFn: () => api.booking.staff.bookings({ date: today, status: "no_show" }),
    refetchInterval,
    enabled: canUndo,
  });

  const undo = useMutation({
    mutationFn: (input: { booking: StaffBooking; reason: NoShowReversalReason; text: string }) =>
      api.booking.staff.reverseNoShow(
        input.booking.id,
        input.booking.version,
        input.reason,
        input.text,
      ),
    onSuccess: () => setUndoing(null),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: expectedKey }),
  });

  const rows = (missed.data?.results ?? []).filter(
    (booking) => !serviceId || booking.service_id === serviceId,
  );
  if (!canUndo || rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 id="missed-today" className="m-0 font-heading text-body font-semibold">
        {t("queue.board.missed")}
      </h3>
      <p className="m-0 text-body-sm text-fg-muted">{t("queue.board.missedHint")}</p>
      {undo.isError && (
        <Alert tone="danger">{actionError(undo.error, t("queue.board.undoNoShowError"))}</Alert>
      )}
      <ul
        aria-labelledby="missed-today"
        className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-dashed border-border p-0"
      >
        {rows.map((booking) => (
          <li key={booking.id} className="flex flex-col gap-2 px-3 py-3">
            <div className="flex items-start gap-3">
              <time
                dateTime={booking.starts_at}
                className="shrink-0 tabular-nums leading-6 text-fg-muted"
              >
                {slotTime(booking.starts_at, language)}
              </time>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold leading-6 break-words">{booking.display_name}</span>
                <span className="text-body-sm text-fg-muted break-words">
                  {serviceName(booking.service_id)}
                </span>
              </span>
            </div>
            <Button variant="ghost" className="self-start" onClick={() => setUndoing(booking)}>
              {t("queue.board.undoNoShow")}
            </Button>
          </li>
        ))}
      </ul>
      {undoing && (
        <ReasonDialog
          title={t("queue.board.undoNoShow")}
          description={t("queue.board.undoNoShowHelp")}
          onClose={() => setUndoing(null)}
          busy={undo.isPending}
          choice={null}
          reasons={[...NO_SHOW_REVERSAL_REASONS]}
          onSubmit={(_choice, reason, text) =>
            undo.mutate({ booking: undoing, reason: reason as NoShowReversalReason, text })
          }
        />
      )}
    </div>
  );
}
