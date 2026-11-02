import type { DisputeStatus, StaffDisputeRow } from "@medilink/api-client";
import { Badge, type BadgeTone } from "@medilink/ui";
import { ArrowRight, Flag, Storefront, WarningCircle } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useWhen } from "../clinical/shared";

export { errorText, useCan, useWhen } from "../clinical/shared";
export { Pager } from "../pharmacy/shared";

export const disputesKeys = {
  all: ["disputes"] as const,
  list: (scope: string, tab: string, page: number) => ["disputes", scope, tab, page] as const,
  one: (scope: string, id: string) => ["disputes", scope, "one", id] as const,
};

export const STATUS_TONE: Record<DisputeStatus, BadgeTone> = {
  open: "warning",
  acknowledged: "info",
  under_review: "info",
  info_requested: "warning",
  resolved: "brand",
  escalated: "danger",
  final_decision: "brand",
  closed: "neutral",
  reopened: "warning",
};

/** One row of a dispute queue: who, about what, the next deadline, flags. */
export function DisputeLine({ row, to }: { row: StaffDisputeRow; to: string }) {
  const { t } = useTranslation();
  const when = useWhen();
  const deadline =
    row.status === "open" || row.status === "reopened" ? row.acknowledge_by : row.decide_by;
  return (
    <li className="group relative flex flex-wrap items-center gap-4 rounded-lg bg-surface p-4 shadow-card transition-shadow hover:shadow-raised">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          to={to}
          className="font-heading text-h3 font-bold text-fg no-underline after:absolute after:inset-0 after:rounded-lg group-hover:underline"
        >
          {row.patient_display_name}
        </Link>
        <p className="m-0 flex flex-wrap gap-x-3 text-body-sm text-fg-muted">
          <span>{t(`disputes.type.${row.type}`)}</span>
          <span>{t(`disputes.subject.${row.subject_type}`)}</span>
          {deadline && (
            <span className={row.is_overdue ? "font-semibold text-danger" : undefined}>
              {t(row.is_overdue ? "disputes.overdueSince" : "disputes.dueBy", {
                time: when.dateTime(deadline),
              })}
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={STATUS_TONE[row.status]}>{t(`disputes.status.${row.status}`)}</Badge>
          {row.is_overdue && (
            <Badge tone="danger" icon={WarningCircle}>
              {t("disputes.overdue")}
            </Badge>
          )}
          {row.channel === "counter" && (
            <Badge tone="neutral" icon={Storefront}>
              {t("disputes.atCounter")}
            </Badge>
          )}
          {row.flagged && (
            <Badge tone="warning" icon={Flag}>
              {t("disputes.flagged")}
            </Badge>
          )}
        </div>
      </div>
      <ArrowRight aria-hidden="true" className="size-icon text-fg-muted" />
    </li>
  );
}
