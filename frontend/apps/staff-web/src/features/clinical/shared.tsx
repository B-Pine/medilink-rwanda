import { hasPermission, isApiError, type ClinicalAllergy, type Vitals } from "@medilink/api-client";
import type { AllergyBannerItem } from "@medilink/ui";
import { dateFormat } from "@medilink/ui/i18n";
import { useTranslation } from "react-i18next";

import { useStaffMe } from "../../auth/queries";
import { isStepUpCancelled } from "../lock";

export const clinicalKeys = {
  all: ["clinical"] as const,
  consultation: (id: string) => ["clinical", "consultation", id] as const,
  access: (fp: string) => ["clinical", "access", fp] as const,
  history: (fp: string, filters: object) => ["clinical", "history", fp, filters] as const,
  summary: (fp: string) => ["clinical", "summary", fp] as const,
  vitals: (visitId: string) => ["clinical", "vitals", visitId] as const,
  unsigned: (mine: boolean) => ["clinical", "unsigned", mine] as const,
};

export function useCan(...codes: string[]): boolean {
  const { data: me } = useStaffMe();
  return codes.some((code) => hasPermission(me, code));
}

/** `403 access_reason_required`: the treatment-relationship rule (contract §2.2, FR-SEC-03). */
export function isReasonRequired(error: unknown): boolean {
  return isApiError(error) && error.code === "access_reason_required";
}

export function errorText(error: unknown, fallback: string): string | undefined {
  if (!error || isStepUpCancelled(error)) return undefined;
  if (isApiError(error)) {
    const fields = Object.values(error.fields).flat();
    return fields.length && !fields.includes(error.message)
      ? `${error.message} ${fields.join(" ")}`
      : error.message;
  }
  return fallback;
}

/** Dates and times in Africa/Kigali through the shared Kinyarwanda-aware formatter. */
export function useWhen() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  const format = (iso: string, options: Intl.DateTimeFormatOptions) => {
    try {
      return dateFormat(lang, { timeZone: "Africa/Kigali", ...options }).format(new Date(iso));
    } catch {
      return iso;
    }
  };
  return {
    date: (iso: string) => format(iso, { day: "numeric", month: "short", year: "numeric" }),
    dateTime: (iso: string) =>
      format(iso, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    time: (iso: string) => format(iso, { hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

export function useAllergyItems() {
  const { t } = useTranslation();
  return (allergies: ClinicalAllergy[]): AllergyBannerItem[] =>
    allergies.map((a) => ({
      id: a.id,
      substance: a.substance,
      detail: [t(`clinical.allergy.severity.${a.severity}`), a.reaction]
        .filter(Boolean)
        .join(" · "),
      ...(a.verification_status === "unverified"
        ? { unverifiedLabel: t("clinical.allergy.unverified") }
        : {}),
    }));
}

/** "T 38.4 · BP 118/76 · P 92 · SpO₂ 98" in the UI language. */
export function useVitalsLine() {
  const { t } = useTranslation();
  return (
    v: Pick<
      Vitals,
      | "temperature_c"
      | "systolic_mmhg"
      | "diastolic_mmhg"
      | "pulse_bpm"
      | "respiratory_rate"
      | "spo2_pct"
      | "weight_kg"
      | "height_cm"
      | "muac_mm"
    >,
  ) =>
    [
      v.temperature_c && t("clinical.vitals.short.temperature", { value: v.temperature_c }),
      v.systolic_mmhg &&
        v.diastolic_mmhg &&
        t("clinical.vitals.short.bp", { sys: v.systolic_mmhg, dia: v.diastolic_mmhg }),
      v.pulse_bpm && t("clinical.vitals.short.pulse", { value: v.pulse_bpm }),
      v.respiratory_rate && t("clinical.vitals.short.respiratory", { value: v.respiratory_rate }),
      v.spo2_pct && t("clinical.vitals.short.spo2", { value: v.spo2_pct }),
      v.weight_kg && t("clinical.vitals.short.weight", { value: v.weight_kg }),
      v.height_cm && t("clinical.vitals.short.height", { value: v.height_cm }),
      v.muac_mm && t("clinical.vitals.short.muac", { value: v.muac_mm }),
    ]
      .filter(Boolean)
      .join(" · ");
}
