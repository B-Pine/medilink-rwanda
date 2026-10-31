/** Dates and times for bookings, always in Kigali time (analysis 05: "today" is Africa/Kigali). */
import { dateFormat } from "@medilink/ui/i18n";

const KIGALI = "Africa/Kigali";

/** YYYY-MM-DD in Kigali, the `date` parameter of the booking endpoints. */
export function kigaliDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: KIGALI }).format(at);
}

/** 24-hour time, e.g. "08:30" (design 04 §3.1). */
export function slotTime(iso: string, language: string): string {
  return dateFormat(language, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: KIGALI,
  }).format(new Date(iso));
}

/** Parts of a YYYY-MM-DD day for the day strip, or the full date for the review. */
export function slotDay(date: string, language: string, part: "weekday" | "day" | "full"): string {
  const at = new Date(`${date}T12:00:00+02:00`);
  const options: Intl.DateTimeFormatOptions =
    part === "weekday"
      ? { weekday: "short" }
      : part === "day"
        ? { day: "numeric" }
        : { weekday: "long", day: "numeric", month: "long" };
  return dateFormat(language, { ...options, timeZone: KIGALI }).format(at);
}

/** "4:59" for a countdown in seconds. */
export function countdown(seconds: number): string {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
