import type {
  PrescriptionItem,
  PrescriptionItemStatus,
  PrescriptionStatus,
  StockLevel,
} from "@medilink/api-client";
import { Button, type BadgeTone } from "@medilink/ui";
import { useTranslation } from "react-i18next";

export { errorText, useCan, useWhen } from "../clinical/shared";

export const pharmacyKeys = {
  all: ["pharmacy"] as const,
  queue: (tab: string, q: string) => ["pharmacy", "queue", tab, q] as const,
  prescription: (id: string) => ["pharmacy", "prescription", id] as const,
  labels: (id: string, language: string) => ["pharmacy", "labels", id, language] as const,
  availability: (q: string) => ["pharmacy", "availability", q] as const,
  drugs: (q: string) => ["pharmacy", "drugs", q] as const,
  /** Under `clinical` so signing the consultation refetches it (S6 invalidates `clinical`). */
  forConsultation: (consultationId: string) =>
    ["clinical", "prescription", consultationId] as const,
};

export const STATUS_TONE: Record<PrescriptionStatus, BadgeTone> = {
  draft: "neutral",
  issued: "info",
  awaiting_payment: "warning",
  ready_to_dispense: "brand",
  partly_dispensed: "warning",
  dispensed: "success",
  not_available: "danger",
  cancelled: "neutral",
  expired: "neutral",
};

export const ITEM_TONE: Record<PrescriptionItemStatus, BadgeTone> = {
  draft: "neutral",
  issued: "info",
  partly_dispensed: "warning",
  dispensed: "success",
  not_available: "danger",
  cancelled: "neutral",
  expired: "neutral",
};

/** W5: the tone of a stock level (stock page, prescribing, availability). */
export const LEVEL_TONE: Record<StockLevel, BadgeTone> = {
  in_stock: "success",
  low: "warning",
  out: "danger",
};

/** What is left to give of an item. */
export const remaining = (item: PrescriptionItem) =>
  Math.max(item.quantity - item.dispensed_quantity, 0);

/** Previous and next for the paginated lists (25 per page). */
export function Pager({
  page,
  hasPrevious,
  hasNext,
  onPage,
}: {
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  if (!hasPrevious && !hasNext) return null;
  return (
    <nav aria-label={t("pharmacy.pages")} className="flex gap-2">
      <Button variant="secondary" disabled={!hasPrevious} onClick={() => onPage(page - 1)}>
        {t("pharmacy.previous")}
      </Button>
      <Button variant="secondary" disabled={!hasNext} onClick={() => onPage(page + 1)}>
        {t("pharmacy.next")}
      </Button>
    </nav>
  );
}
