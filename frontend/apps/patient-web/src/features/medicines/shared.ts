import type { PrescriptionStatus } from "@medilink/api-client";
import type { BadgeTone } from "@medilink/ui";

export const medicinesKeys = {
  list: (patientId: string, status: string) => ["medicines", "list", patientId, status] as const,
  detail: (id: string) => ["medicines", "detail", id] as const,
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
