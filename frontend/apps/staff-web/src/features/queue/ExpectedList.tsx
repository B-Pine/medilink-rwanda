import type { NoShowReversalReason, StaffBooking } from "@medilink/api-client";
import { newIdempotencyKey, NO_SHOW_REVERSAL_REASONS } from "@medilink/api-client";
import { Alert, Badge, Button, EmptyState } from "@medilink/ui";
import { CalendarCheck } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { kigaliDate as kigaliToday, slotTime } from "../bookings/time";
import { queueKeys, usePollInterval } from "./live";
import { actionError, ReasonDialog, useCan, useServiceNames } from "./shared";

export const expectedKey = ["queue", "expected"] as const;

/** Today's confirmed and no-show bookings in one request, shared by Expected and Missed today. */
function useTodayBookings(enabled = true) {
  const api = useApi();
  const refetchInterval = usePollInterval();
  const today = kigaliToday();
  return useQuery({
    queryKey: [...expectedKey, today],
    queryFn: () => api.booking.staff.bookings({ date: today, status: "confirmed,no_show" }),
    refetchInterval,
    enabled,
  });
}

/**
 * Expected (design 04 §3.1, contract S5 R1): today's confirmed bookings by slot time, until the
 * patient is checked in (R6). `serviceId` follows the board's service filter.
 */
export function ExpectedList({
  serviceId,
  onNewTime,
}: {
  serviceId: string | null;
  /** Offer another time (contract S5 §6.2 "Late: offer a new time", R4). */
  onNewTime?: (booking: StaffBooking) => void;
}) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const serviceName = useServiceNames();
  const canCheckIn = useCan("queue.operate");
  const language = i18n.resolvedLanguage ?? "en";
  const bookings = useTodayBookings();

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
    (booking) => booking.status === "confirmed" && (!serviceId || booking.service_id === serviceId),
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
                {booking.symptoms.length > 0 && (
                  <span className="text-body-sm text-fg-secondary break-words">
                    {booking.symptoms.map((symptom) => symptom.label).join(", ")}
                  </span>
                )}
              </span>
              {booking.late && (
                <Badge tone="warning" className="shrink-0">
                  {t("queue.board.expectedLate")}
                </Badge>
              )}
            </div>
            {canCheckIn && (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  loading={checkIn.isPending && checkIn.variables?.id === booking.id}
                  disabled={checkIn.isPending}
                  onClick={() => checkIn.mutate(booking)}
                >
                  {t("queue.board.expectedCheckIn")}
                </Button>
                {onNewTime && (
                  <Button variant="ghost" onClick={() => onNewTime(booking)}>
                    {t("bookings.expected.newTime")}
                  </Button>
                )}
              </div>
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
  const language = i18n.resolvedLanguage ?? "en";
  const [undoing, setUndoing] = useState<StaffBooking | null>(null);
  const missed = useTodayBookings(canUndo);

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
    (booking) => booking.status === "no_show" && (!serviceId || booking.service_id === serviceId),
  );
  if (!canUndo || rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 id="missed-today" className="m-0 font-heading text-body font-semibold">
        {t("queue.board.missed")}
      </h3>
      <p className="m-0 text-body-sm text-fg-muted">{t("queue.board.missedHint")}</p>
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
          onClose={() => {
            setUndoing(null);
            undo.reset();
          }}
          busy={undo.isPending}
          error={undo.isError ? actionError(undo.error, t("queue.board.undoNoShowError")) : null}
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
