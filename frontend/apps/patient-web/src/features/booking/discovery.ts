import type { I18n } from "@medilink/api-client";
import { formatDate, formatTime, kigaliHour } from "@medilink/ui/i18n";

/**
 * Discovery choices shared by the landing hero, Find care and search (design 06 §2 H1). Service
 * keys map to the S1 service catalogue, district keys to NISR district codes; insurer keys are the
 * S1 insurer codes.
 */
export const SERVICE_CODES = {
  general: "general_consultation",
  pediatrics: "paediatric_consultation",
  dental: "dental_care",
  antenatal: "antenatal_care",
  eye: "eye_care",
} as const;
export type ServiceKey = keyof typeof SERVICE_CODES;
export const SERVICE_KEYS = Object.keys(SERVICE_CODES) as ServiceKey[];

export const DISTRICT_CODES = {
  gasabo: "12",
  kicukiro: "13",
  nyarugenge: "11",
  musanze: "43",
  huye: "24",
  rubavu: "33",
} as const;
export type DistrictKey = keyof typeof DISTRICT_CODES;
export const DISTRICT_KEYS = Object.keys(DISTRICT_CODES) as DistrictKey[];

export const INSURER_CODES = {
  mutuelle: "mutuelle",
  rama: "rama",
  mmi: "mmi",
  private: "private_other",
  none: "",
} as const;
export type InsurerKey = keyof typeof INSURER_CODES;
export const INSURER_KEYS = Object.keys(INSURER_CODES) as InsurerKey[];

/** URL parameters of /search: choices only, never a location (contract D-2). */
export function searchUrl(choice: { service?: string; district?: string; insurer?: string }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(choice)) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `/search?${query}` : "/search";
}

export function pick(value: I18n | undefined, language: string): string {
  if (!value) return "";
  return value[language as keyof I18n] ?? value.en ?? Object.values(value)[0] ?? "";
}

export const time = (iso: string, language: string): string => formatTime(iso, language);

export function day(iso: string, language: string, style: "short" | "long" = "long"): string {
  return formatDate(iso, language, {
    weekday: style,
    day: "numeric",
    month: style === "long" ? "long" : "short",
  });
}

/** Morning before 12:00 Kigali time (design 07 §3.2 time chips grouped by part of day). */
export function isMorning(iso: string): boolean {
  return kigaliHour(iso) < 12;
}

/** The value of a named field of a submitted form ("" when missing). */
export function field(form: HTMLFormElement, name: string): string {
  const element = form.elements.namedItem(name);
  return element && "value" in element ? String(element.value) : "";
}
