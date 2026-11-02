import type { PatientVisit, TicketState } from "@medilink/api-client";
import { Clock, Users } from "@phosphor-icons/react";
import { Badge, cx, type BadgeTone } from "@medilink/ui";
import { formatTime } from "@medilink/ui/i18n";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { paths } from "../../app/paths";

const STATE_TONE: Partial<Record<TicketState, BadgeTone>> = {
  waiting: "warning",
  called: "success",
  in_service: "brand",
  on_hold: "violet",
  no_response: "warning",
};

/** Queue state in words, with its icon (never colour alone). */
export function VisitBadge({ visit }: { visit: PatientVisit }) {
  const { t } = useTranslation();
  return (
    <Badge tone={STATE_TONE[visit.state] ?? "neutral"}>
      {t(`dashboard.queue.state.${visit.state}`)}
    </Badge>
  );
}

/** Reception confirms arrival; "I'm here" from the phone is only a claim (decision 2026-10). */
export function arrivalKey(visit: PatientVisit): "confirmed" | "claimed" | "notYet" {
  if (!visit.is_remote || visit.remote_arrival_confirmed_at) return "confirmed";
  return visit.remote_arrival_claimed_at ? "claimed" : "notYet";
}

/** The facility's own estimate, or why there is none. Never a number we made up. */
export function useEstimateText() {
  const { t } = useTranslation();
  return (visit: PatientVisit): string | null => {
    if (visit.estimate.min !== null && visit.estimate.max !== null)
      return t("dashboard.queue.wait", { min: visit.estimate.min, max: visit.estimate.max });
    if (visit.estimate.status) return t(`dashboard.queue.noEstimate.${visit.estimate.status}`);
    return null;
  };
}

/**
 * A digital waiting-room ticket (upgrade 12 §8): the number on a soft green stub, a perforated
 * edge, then the facility, people ahead, the estimate and when it was last updated. Optional
 * `label` and `actions` turn it into the overview's "Current visit" panel.
 */
export function QueueTicketCard({
  visit,
  label,
  actions,
  headingLevel = 3,
}: {
  visit: PatientVisit;
  label?: string;
  actions?: ReactNode;
  headingLevel?: 2 | 3;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const estimate = useEstimateText()(visit);
  const called = visit.state === "called";
  const service = visit.service_name_i18n[lang as "rw"] || visit.service_name_i18n.en || "";
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const titleId = `ticket-${visit.visit_id}`;
  return (
    <article
      aria-labelledby={titleId}
      className={cx(
        "relative flex flex-col overflow-hidden rounded-[20px] border bg-surface shadow-card sm:flex-row",
        called ? "border-attention-solid" : "border-border",
      )}
    >
      <div
        className={cx(
          "flex flex-col items-center justify-center gap-2 px-6 py-6 text-center sm:w-52 sm:shrink-0",
          called ? "bg-attention-bg" : "bg-brand-subtle",
        )}
      >
        <span className="text-caption font-semibold tracking-[0.14em] text-fg-secondary uppercase">
          {t("dashboard.queue.ticket")}
        </span>
        <span className="font-heading text-display leading-none font-extrabold tracking-tight text-fg tabular-nums">
          {visit.ticket_number}
        </span>
        <VisitBadge visit={visit} />
      </div>

      {/* perforation: dashed edge with two notches cut out of the card */}
      <div
        aria-hidden="true"
        className="relative border-t-2 border-dashed border-border sm:border-t-0 sm:border-l-2"
      >
        <span className="absolute -top-2.5 -left-px hidden size-5 -translate-x-1/2 rounded-full border border-border bg-page sm:block" />
        <span className="absolute -bottom-2.5 -left-px hidden size-5 -translate-x-1/2 rounded-full border border-border bg-page sm:block" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-0.5">
          {label && (
            <span className="text-caption font-semibold tracking-[0.14em] text-brand uppercase">
              {label}
            </span>
          )}
          <Heading id={titleId} className="m-0 font-heading text-h3 font-bold text-fg">
            {visit.facility_name}
          </Heading>
          {service && <p className="m-0 text-body-sm text-fg-secondary">{service}</p>}
        </div>

        {called ? (
          <p className="m-0 font-heading text-h3 font-bold text-attention" aria-live="assertive">
            {t("tracker.calledTo", { room: visit.service_point ?? "" })}
          </p>
        ) : visit.state === "waiting" ? (
          <dl className="m-0 grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-0.5">
              <dt className="flex items-center gap-1.5 text-body-sm text-fg-secondary">
                <Users aria-hidden="true" className="size-4" />
                {t("dashboard.queue.ahead")}
              </dt>
              <dd className="m-0 font-heading text-h1 leading-tight font-bold tabular-nums text-fg">
                {visit.ahead}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="flex items-center gap-1.5 text-body-sm text-fg-secondary">
                <Clock aria-hidden="true" className="size-4" />
                {t("dashboard.queue.estimate")}
              </dt>
              <dd className="m-0 font-semibold tabular-nums text-attention">
                {estimate ?? t("dashboard.queue.noEstimate.none")}
              </dd>
            </div>
          </dl>
        ) : null}

        <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-body-sm text-fg-muted">
          <span className="tabular-nums">
            {t("dashboard.queue.updated", { time: formatTime(visit.updated_at, lang) })}
          </span>
          <span aria-hidden="true">·</span>
          <span>{t(`dashboard.queue.arrival.${arrivalKey(visit)}`)}</span>
        </p>

        {actions ?? (
          <Link
            to={paths.ticket(visit.visit_id)}
            className="self-start text-body-sm font-semibold text-link"
          >
            {t("dashboard.queue.viewLive")}
            <span className="sr-only"> · {visit.ticket_number}</span>
          </Link>
        )}
      </div>
    </article>
  );
}
