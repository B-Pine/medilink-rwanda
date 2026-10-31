/**
 * Dates in the UI language (design 10 §2: Kinyarwanda first). Chrome ships without Kinyarwanda
 * calendar data, so `Intl.DateTimeFormat("rw")` falls back to English day and month names there.
 * `dateFormat()` is a drop-in for `new Intl.DateTimeFormat(language, options)` that formats with
 * en-GB (day before month, 24-hour clock) and swaps in the CLDR Kinyarwanda names when needed.
 */

const RW_WEEKDAY_LONG = [
  "Ku cyumweru",
  "Kuwa mbere",
  "Kuwa kabiri",
  "Kuwa gatatu",
  "Kuwa kane",
  "Kuwa gatanu",
  "Kuwa gatandatu",
];
const RW_WEEKDAY_SHORT = ["Cyu.", "Mbe.", "Kab.", "Gtu.", "Kan.", "Gnu.", "Gnd."];
const RW_MONTH_LONG = [
  "Mutarama",
  "Gashyantare",
  "Werurwe",
  "Mata",
  "Gicurasi",
  "Kamena",
  "Nyakanga",
  "Kanama",
  "Nzeri",
  "Ukwakira",
  "Ugushyingo",
  "Ukuboza",
];
const RW_MONTH_SHORT = [
  "Mut.",
  "Gas.",
  "Wer.",
  "Mat.",
  "Gic.",
  "Kam.",
  "Nya.",
  "Kan.",
  "Nze.",
  "Ukw.",
  "Ugu.",
  "Uku.",
];

const EN_WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const EN_MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

let rwSupported: boolean | null = null;

/** True when this runtime has Kinyarwanda calendar data (Node has it; Chrome does not). */
export function hasKinyarwandaDates(): boolean {
  if (rwSupported === null) {
    try {
      rwSupported = new Intl.DateTimeFormat("rw").resolvedOptions().locale.startsWith("rw");
    } catch {
      rwSupported = false;
    }
  }
  return rwSupported;
}

/** Tests: force the browser behaviour (`false`) or reset detection (`null`). */
export function setKinyarwandaDatesSupport(value: boolean | null): void {
  rwSupported = value;
}

export interface DateFormat {
  format: (value: Date | number) => string;
}

function safe(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, options);
  } catch {
    return new Intl.DateTimeFormat("en-GB", options);
  }
}

/** `Intl.DateTimeFormat` for the UI language, correct for Kinyarwanda in every browser. */
export function dateFormat(language: string, options: Intl.DateTimeFormatOptions = {}): DateFormat {
  if (!language.startsWith("rw") || hasKinyarwandaDates()) return safe(language, options);

  const { dateStyle, timeStyle, ...rest } = options;
  const expanded: Intl.DateTimeFormatOptions =
    dateStyle || timeStyle
      ? {
          ...rest,
          ...(dateStyle === "full"
            ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
            : {}),
          ...(dateStyle === "long" ? { day: "numeric", month: "long", year: "numeric" } : {}),
          ...(dateStyle === "medium" ? { day: "numeric", month: "short", year: "numeric" } : {}),
          ...(dateStyle === "short" ? { day: "2-digit", month: "2-digit", year: "numeric" } : {}),
          ...(timeStyle ? { hour: "2-digit", minute: "2-digit" } : {}),
          ...(timeStyle === "medium" || timeStyle === "long" || timeStyle === "full"
            ? { second: "2-digit" }
            : {}),
        }
      : rest;
  const base = safe("en-GB", expanded);
  const longNames = expanded.weekday === "long";
  const longMonths = expanded.month === "long";

  return {
    format(value) {
      const parts = base.formatToParts(value);
      return parts
        .map((part, i) => {
          if (part.type === "weekday") {
            const index = EN_WEEKDAYS.indexOf(part.value.slice(0, 3).toLowerCase());
            if (index < 0) return part.value;
            return (longNames ? RW_WEEKDAY_LONG : RW_WEEKDAY_SHORT)[index];
          }
          if (part.type === "month" && Number.isNaN(Number(part.value))) {
            const index = EN_MONTHS.indexOf(part.value.slice(0, 3).toLowerCase());
            if (index < 0) return part.value;
            return (longMonths ? RW_MONTH_LONG : RW_MONTH_SHORT)[index];
          }
          // CLDR rw: "Kuwa mbere, 2 Ugushyingo" (a comma after the weekday)
          if (part.type === "literal" && parts[i - 1]?.type === "weekday" && part.value === " ")
            return ", ";
          return part.value;
        })
        .join("");
    },
  };
}
