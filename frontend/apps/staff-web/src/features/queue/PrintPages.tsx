import { Alert, Button, LoadingState } from "@medilink/ui";
import { formatTime } from "@medilink/ui/i18n";
import { Printer } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { useApi } from "../../app/services";
import { useStaffMe } from "../../auth/queries";
import { slotDay } from "../bookings/time";
import { queueKeys } from "./live";
import { useServiceNames } from "./shared";

/**
 * A thermal print (upgrade 08 §3): 80 mm wide, black on white, the key number very large, in
 * the patient's language. The buttons never print.
 */
function Slip({ children, ready }: { children: ReactNode; ready: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Button pill onClick={() => window.print()} disabled={!ready}>
          <Printer aria-hidden="true" weight="bold" />
          {t("queue.print.print")}
        </Button>
        <p className="m-0 text-body-sm text-fg-secondary">{t("queue.print.hint")}</p>
      </div>
      <article className="flex w-[80mm] flex-col items-center gap-2 rounded-xl border border-dashed border-border-input bg-white p-4 text-center text-[11pt] leading-snug text-black print:rounded-none print:border-0 print:p-0">
        {children}
      </article>
    </div>
  );
}

function useFacilityName(): string {
  const { data: me } = useStaffMe();
  return me?.memberships.find((m) => m.facility.id === me.active_facility_id)?.facility.name ?? "";
}

/** /queue/visits/:visitId/slip: the ticket slip for a patient without a phone. */
export function TicketSlipPage() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const { visitId = "" } = useParams();
  const facility = useFacilityName();
  const serviceName = useServiceNames();
  const language = i18n.resolvedLanguage ?? "rw";
  const visit = useQuery({
    queryKey: queueKeys.visit(visitId),
    queryFn: () => api.queue.visit(visitId),
  });
  const board = useQuery({ queryKey: queueKeys.board, queryFn: () => api.queue.board() });
  if (visit.isPending) return <LoadingState />;
  if (visit.isError) return <Alert tone="danger">{t("queue.loadFailed")}</Alert>;
  const ticket =
    visit.data.tickets.find((x) => ["waiting", "called", "in_service"].includes(x.state)) ??
    visit.data.tickets.at(-1);
  if (!ticket) return <Alert tone="warning">{t("queue.print.noTicket")}</Alert>;
  const est = board.data?.queues.find(
    (q) => q.service_id === ticket.service_id && q.stage === ticket.stage,
  )?.estimate_next;
  const now = new Date().toISOString();
  return (
    <Slip ready>
      <p className="m-0 font-bold">{facility}</p>
      <p className="m-0">
        {slotDay(now.slice(0, 10), language, "full")} · {formatTime(now, language)}
      </p>
      <p className="m-0 mt-1 text-[10pt] tracking-wide uppercase">{t("queue.print.yourNumber")}</p>
      <p className="m-0 font-heading text-[44pt] leading-none font-black">{ticket.number}</p>
      <p className="m-0 font-semibold">{serviceName(ticket.service_id)}</p>
      <p className="m-0">{t("queue.panel.ahead", { count: ticket.position ?? 0 })}</p>
      {est && est.min !== null && est.max !== null && (
        <p className="m-0">{t("queue.print.wait", { min: est.min, max: est.max })}</p>
      )}
      <p className="m-0 mt-2 border-t border-black pt-2 font-bold">{t("queue.print.watch")}</p>
    </Slip>
  );
}

/** /bookings/card/:code: the appointment card (proposed FR-DOC-08) for the next visit. */
export function AppointmentCardPage() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const { code = "" } = useParams();
  const facility = useFacilityName();
  const serviceName = useServiceNames();
  const language = i18n.resolvedLanguage ?? "rw";
  const found = useQuery({
    queryKey: ["bookings", "card", code],
    queryFn: () => api.booking.staff.bookings({ code }),
  });
  if (found.isPending) return <LoadingState />;
  const booking = found.data?.results[0];
  if (!booking) return <Alert tone="warning">{t("queue.code.notFound")}</Alert>;
  return (
    <Slip ready>
      <p className="m-0 font-bold">{facility}</p>
      <p className="m-0 text-[10pt] tracking-wide uppercase">{t("queue.print.appointment")}</p>
      <p className="m-0 font-heading text-[20pt] leading-tight font-black">
        {slotDay(booking.starts_at.slice(0, 10), language, "full")}
      </p>
      <p className="m-0 font-heading text-[32pt] leading-none font-black tabular-nums">
        {formatTime(booking.starts_at, language)}
      </p>
      <p className="m-0 font-semibold">{booking.display_name}</p>
      <p className="m-0">
        {serviceName(booking.service_id)}
        {booking.doctor ? ` · ${booking.doctor}` : ""}
      </p>
      <p className="m-0 mt-1 text-[10pt]">{t("queue.print.code")}</p>
      <p className="m-0 font-heading text-[22pt] leading-none font-black tracking-[0.2em]">
        {booking.booking_code}
      </p>
      <p className="m-0 mt-2 border-t border-black pt-2">{t("queue.print.bring")}</p>
    </Slip>
  );
}
