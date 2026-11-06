import type { CashShift } from "@medilink/api-client";
import { isApiError, shiftCollected } from "@medilink/api-client";
import { buttonClassName, cx } from "@medilink/ui";
import {
  CalendarCheck,
  CaretRight,
  CashRegister,
  HandWaving,
  MagnifyingGlass,
  Phone,
  Plus,
  UserMinus,
  type Icon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { CodeCheckIn } from "./CodeCheckIn";
import { ExpectedList, useTodayBookings } from "./ExpectedList";
import { DeskFlow } from "./FrontDesk";
import { queueKeys, usePollInterval, useQueueSocket } from "./live";
import { RemoteList, unconfirmedRemote } from "./RemoteList";
import { useCan } from "./shared";

/** My open cash shift, or null (a receptionist who also takes payments, upgrade 05 §2). */
function useMyShift(enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: ["billing", "shift"],
    queryFn: async (): Promise<CashShift | null> => {
      try {
        return await api.billing.currentShift();
      } catch (error) {
        if (isApiError(error) && (error.status === 404 || error.status === 403)) return null;
        throw error;
      }
    },
    enabled,
    retry: false,
  });
}

function Stat({
  icon: StatIcon,
  label,
  value,
  tone = "brand",
}: {
  icon: Icon;
  label: string;
  value: string | number;
  tone?: "brand" | "attention" | "danger";
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-surface px-3.5 py-3 shadow-card">
      <span
        className={cx(
          "grid size-10 shrink-0 place-items-center rounded-lg",
          tone === "attention"
            ? "bg-attention-bg text-attention"
            : tone === "danger"
              ? "bg-danger-bg text-danger"
              : "bg-brand-subtle text-on-brand-subtle",
        )}
      >
        <StatIcon aria-hidden="true" weight="bold" className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-heading text-h2 leading-none font-semibold tabular-nums">
          {value}
        </span>
        <span className="truncate text-caption text-fg-secondary">{label}</span>
      </span>
    </li>
  );
}

/**
 * Reception Today (upgrade 05 §2): the front desk at a glance. Find or check in, check in by booking
 * code, the patient flow, today's numbers, the next arrivals and the arrivals to confirm; the full
 * board is one tap away.
 */
export function ReceptionTodayCard() {
  const { t } = useTranslation();
  const api = useApi();
  const reception = useCan("queue.operate");
  const admin = useCan("reports.view");
  const clinician = useCan("clinical.write");
  const allowed = reception && !admin && !clinician;
  const takesPayments = useCan("billing.record_payment");
  useQueueSocket(allowed);
  const refetchInterval = usePollInterval();
  const board = useQuery({
    queryKey: queueKeys.board,
    queryFn: () => api.queue.board(),
    enabled: allowed,
    refetchInterval,
  });
  const bookings = useTodayBookings(allowed);
  const shift = useMyShift(allowed && takesPayments);
  if (!allowed) return null;

  const queues = board.data?.queues ?? [];
  const rows = bookings.data?.results ?? [];
  const expected = rows.filter((b) => b.status === "confirmed").length;
  const late = rows.filter((b) => b.status === "confirmed" && b.late).length;
  const missed = rows.filter((b) => b.status === "no_show").length;
  const claims = unconfirmedRemote(queues, null).length;
  const myShift: CashShift | null | undefined = shift.data;
  // payments only: the expected totals also hold the opening float
  const collected: number | null = myShift ? shiftCollected(myShift) : null;

  const deskLink =
    "inline-flex min-h-11 items-center gap-2 rounded-xl px-4 font-semibold no-underline transition-[transform,filter,background-color] duration-150 active:scale-[0.97]";

  return (
    <section aria-labelledby="reception-today" className="flex flex-col gap-4 lg:col-span-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="reception-today" className="m-0 font-heading text-h2 tracking-tight">
          {t("queue.reception.title")}
        </h2>
        <Link to="/queue" className={buttonClassName({ variant: "secondary", pill: true })}>
          {t("queue.reception.openBoard")}
          <CaretRight aria-hidden="true" weight="bold" />
        </Link>
      </div>

      {/* the desk bar: find a patient, new walk-in, book by phone (they open on the board) */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-forest p-3.5 text-on-forest">
        <Link
          to="/queue?find=1"
          className={cx(
            deskLink,
            "min-w-0 flex-1 basis-72 border border-on-forest/15 bg-on-forest/[0.07] font-normal text-on-forest-muted hover:bg-on-forest/[0.11]",
          )}
        >
          <MagnifyingGlass aria-hidden="true" weight="bold" className="size-5 shrink-0" />
          <span className="truncate">{t("queue.board.findPatient")}</span>
        </Link>
        <Link
          to="/queue?find=1"
          className={cx(deskLink, "bg-on-forest-accent text-forest hover:brightness-105")}
        >
          <Plus aria-hidden="true" weight="bold" className="size-4" />
          {t("queue.board.checkIn")}
        </Link>
        <Link
          to="/queue?book=new"
          className={cx(
            deskLink,
            "border border-on-forest/25 text-on-forest hover:bg-on-forest/[0.08]",
          )}
        >
          <Phone aria-hidden="true" weight="bold" className="size-4" />
          {t("bookings.phone.open")}
        </Link>
      </div>

      <DeskFlow queues={queues} expected={bookings.data?.results} />

      <ul
        aria-label={t("queue.reception.numbers")}
        className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3"
      >
        {/* waiting and expected are in the flow strip above; these are the desk's own counts */}
        <Stat
          icon={HandWaving}
          label={t("queue.reception.claims")}
          value={claims}
          tone={claims > 0 ? "attention" : "brand"}
        />
        <Stat
          icon={UserMinus}
          label={
            late > 0 ? t("queue.reception.late", { count: late }) : t("queue.reception.missed")
          }
          value={missed}
          tone={missed > 0 ? "danger" : "brand"}
        />
        {takesPayments && (
          <Stat
            icon={CashRegister}
            label={
              collected === null ? t("queue.reception.noShift") : t("queue.reception.collected")
            }
            value={collected === null ? "—" : collected.toLocaleString("en-US")}
          />
        )}
      </ul>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <CodeCheckIn />
          <section aria-labelledby="reception-claims" className="flex flex-col gap-3">
            <h3 id="reception-claims" className="sr-only">
              {t("queue.reception.claims")}
            </h3>
            {claims > 0 ? (
              <RemoteList queues={queues} serviceId={null} />
            ) : (
              <p className="m-0 rounded-2xl bg-surface p-4 text-body-sm text-fg-secondary shadow-card">
                {t("queue.reception.noClaims")}
              </p>
            )}
            {takesPayments && shift.isSuccess && shift.data === null && (
              <Link
                to="/payments"
                className="flex min-h-target items-center gap-3 rounded-2xl bg-attention-bg px-4 py-3 text-fg no-underline"
              >
                <CashRegister aria-hidden="true" weight="bold" className="size-5 text-attention" />
                <span className="flex-1 text-body-sm font-semibold">
                  {t("queue.reception.openShift")}
                </span>
                <CaretRight aria-hidden="true" className="size-4 text-fg-muted" />
              </Link>
            )}
          </section>
        </div>
        <section aria-labelledby="reception-next" className="flex flex-col gap-3">
          <h3
            id="reception-next"
            className="m-0 flex items-center gap-2 font-heading text-body font-semibold"
          >
            <CalendarCheck aria-hidden="true" weight="bold" className="size-5 text-primary" />
            {t("queue.reception.next")}
          </h3>
          <ExpectedList serviceId={null} limit={5} />
          {expected > 5 && (
            <Link to="/queue" className="self-start text-body-sm font-semibold text-link">
              {t("queue.reception.more", { count: expected - 5 })}
            </Link>
          )}
        </section>
      </div>
    </section>
  );
}
