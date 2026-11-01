/**
 * Shared formatters for times, dates and money in the UI language (coding standards: one
 * formatter, not one per screen). Times and dates are always in Kigali time ("today" is
 * Africa/Kigali, analysis 05) with a 24-hour clock (design 04 §3.1), whatever the device says.
 */
import { dateFormat } from "./dates";

export const KIGALI_TIME_ZONE = "Africa/Kigali";

type DateInput = string | number | Date;

function toDate(value: DateInput): Date {
  if (value instanceof Date) return value;
  // A bare YYYY-MM-DD is a Kigali calendar day: midday keeps it on that day in every zone.
  if (typeof value === "string" && value.length === 10) return new Date(`${value}T12:00:00+02:00`);
  return new Date(value);
}

/** "08:30": 24-hour time in Kigali. */
export function formatTime(value: DateInput, language: string): string {
  return dateFormat(language, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: KIGALI_TIME_ZONE,
  }).format(toDate(value));
}

/** A date in Kigali; by default the day and the short month name. */
export function formatDate(
  value: DateInput,
  language: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
): string {
  return dateFormat(language, { hourCycle: "h23", ...options, timeZone: KIGALI_TIME_ZONE }).format(
    toDate(value),
  );
}

/** "8,000 RWF": whole Rwandan francs with the language's digit grouping. */
export function formatMoney(amount: number, language: string): string {
  let format: Intl.NumberFormat;
  try {
    format = new Intl.NumberFormat(language === "en" ? "en-RW" : language, {
      maximumFractionDigits: 0,
    });
  } catch {
    format = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
  }
  return `${format.format(amount)} RWF`;
}

/** YYYY-MM-DD of a moment in Kigali (the `date` parameter of the API). */
export function kigaliDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: KIGALI_TIME_ZONE }).format(at);
}

/** Hour of the day (0-23) in Kigali. */
export function kigaliHour(value: DateInput): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: KIGALI_TIME_ZONE,
    }).format(toDate(value)),
  );
}
