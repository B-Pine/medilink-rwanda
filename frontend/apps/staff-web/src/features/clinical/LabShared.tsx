import type { LabFlag, LabOrder, LabOrderState, LabResultItem } from "@medilink/api-client";
import { Badge, cx, type BadgeTone } from "@medilink/ui";
import { ArrowDown, ArrowUp, WarningCircle } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";

/** Upgrade 06 §3 (#201): what the doctor's consultation and the lab station share. */
export const labKeys = {
  all: ["lab"] as const,
  tests: ["lab", "tests"] as const,
  queue: ["lab", "queue"] as const,
  inbox: ["lab", "inbox"] as const,
  orders: (consultationId: string) => ["lab", "orders", consultationId] as const,
};

/** The test catalogue changes with a release only. */
export function useLabTests(enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: labKeys.tests,
    queryFn: () => api.clinical.lab.tests(),
    staleTime: 60 * 60_000,
    enabled,
  });
}

const STATE_TONE: Record<LabOrderState, BadgeTone> = {
  ordered: "neutral",
  sample_taken: "info",
  resulted: "warning",
  reviewed: "brand",
  released: "success",
  cancelled: "neutral",
};

export function LabStateBadge({ state }: { state: LabOrderState }) {
  const { t } = useTranslation();
  return <Badge tone={STATE_TONE[state]}>{t(`clinical.lab.states.${state}`)}</Badge>;
}

const FLAG_ICON = { low: ArrowDown, high: ArrowUp, abnormal: WarningCircle } as const;

/** A flag is a word and an icon, never colour alone. */
export function LabFlagBadge({ flag }: { flag: LabFlag }) {
  const { t } = useTranslation();
  return (
    <Badge tone="danger" icon={FLAG_ICON[flag]}>
      {t(`clinical.lab.flags.${flag}`)}
    </Badge>
  );
}

/** The value as read aloud: a number with its unit, or the answer in words. */
export function useLabValue() {
  const { t } = useTranslation();
  return (item: Pick<LabResultItem, "kind" | "value" | "unit">) =>
    item.kind === "number"
      ? `${item.value}${item.unit ? ` ${item.unit}` : ""}`
      : t(`clinical.lab.choices.${item.value}`, { defaultValue: item.value });
}

export function rangeText(
  t: (key: string, options?: Record<string, unknown>) => string,
  item: { low: string | null; high: string | null; unit: string },
): string {
  if (item.low === null || item.high === null) return "";
  const trim = (v: string) => String(Number(v));
  return t("clinical.lab.range", { low: trim(item.low), high: trim(item.high), unit: item.unit });
}

/** One result: item, value, reference, flag. */
export function LabResultTable({
  order,
  className,
}: {
  order: Pick<LabOrder, "test_name" | "result">;
  className?: string;
}) {
  const { t } = useTranslation();
  const value = useLabValue();
  if (!order.result) return null;
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <table className="w-full border-collapse text-body-sm">
        <caption className="sr-only">{order.test_name}</caption>
        <thead>
          <tr className="text-start text-caption text-fg-muted">
            <th scope="col" className="py-1 pe-3 text-start font-semibold">
              {t("clinical.lab.table.item")}
            </th>
            <th scope="col" className="py-1 pe-3 text-start font-semibold">
              {t("clinical.lab.table.value")}
            </th>
            <th scope="col" className="py-1 text-start font-semibold">
              {t("clinical.lab.table.reference")}
            </th>
          </tr>
        </thead>
        <tbody>
          {order.result.items.map((item) => (
            <tr key={item.code} className="border-t border-border/60">
              <th scope="row" className="py-2 pe-3 text-start font-normal text-fg-secondary">
                {item.label}
              </th>
              <td className="py-2 pe-3">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={cx("font-semibold tabular-nums", item.flag && "text-danger")}>
                    {value(item)}
                  </span>
                  {item.flag && <LabFlagBadge flag={item.flag} />}
                </span>
              </td>
              <td className="py-2 text-fg-muted tabular-nums">{rangeText(t, item)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {order.result.comment && (
        <p className="m-0 text-body-sm text-fg-secondary">
          <span className="font-semibold">{t("clinical.lab.labComment")}</span>{" "}
          {order.result.comment}
        </p>
      )}
    </div>
  );
}
