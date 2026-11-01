/** Dates and times for bookings, always in Kigali time (analysis 05: "today" is Africa/Kigali). */
import { formatDate, formatTime, kigaliDate } from "@medilink/ui/i18n";

/** YYYY-MM-DD in Kigali, the `date` parameter of the booking endpoints. */
export { kigaliDate };

/** 24-hour time, e.g. "08:30" (design 04 §3.1). */
export const slotTime = formatTime;

/** Parts of a YYYY-MM-DD day for the day strip, or the full date for the review. */
export function slotDay(date: string, language: string, part: "weekday" | "day" | "full"): string {
  const options: Intl.DateTimeFormatOptions =
    part === "weekday"
      ? { weekday: "short" }
      : part === "day"
        ? { day: "numeric" }
        : { weekday: "long", day: "numeric", month: "long" };
  return formatDate(date, language, options);
}

/** "4:59" for a countdown in seconds. */
export function countdown(seconds: number): string {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
