import { afterEach, describe, expect, it } from "vitest";

import { setKinyarwandaDatesSupport } from "./dates";
import { formatDate, formatMoney, formatTime, kigaliDate, kigaliHour } from "./format";

// 22:30 UTC on Sunday 1 November 2026 is 00:30 on Monday 2 November in Kigali (UTC+2)
const LATE = "2026-11-01T22:30:00Z";

describe("shared formatters", () => {
  afterEach(() => setKinyarwandaDatesSupport(null));

  it("formatTime: 24-hour Kigali time in every language", () => {
    expect(formatTime(LATE, "en")).toBe("00:30");
    expect(formatTime(LATE, "fr")).toBe("00:30");
    setKinyarwandaDatesSupport(false);
    expect(formatTime("2026-11-02T13:05:00Z", "rw")).toBe("15:05");
    expect(formatTime(Date.parse("2026-11-02T13:05:00Z"), "en")).toBe("15:05");
  });

  it("formatDate: the Kigali day, Kinyarwanda names in every browser", () => {
    expect(formatDate(LATE, "en")).toBe("Nov 2");
    expect(formatDate(LATE, "fr")).toBe("2 nov.");
    setKinyarwandaDatesSupport(false);
    expect(formatDate(LATE, "rw", { weekday: "long", day: "numeric", month: "long" })).toBe(
      "Kuwa mbere, 2 Ugushyingo",
    );
    expect(formatDate("2026-11-02", "en", { weekday: "short" })).toBe("Mon");
  });

  it("formatMoney: whole francs with RWF", () => {
    expect(formatMoney(8000, "en")).toBe("8,000 RWF");
    expect(formatMoney(1500.4, "en")).toBe("1,500 RWF");
    expect(formatMoney(8000, "fr")).toMatch(/^8\s000 RWF$/);
  });

  it("kigaliDate and kigaliHour follow Kigali, not the device", () => {
    expect(kigaliDate(new Date(LATE))).toBe("2026-11-02");
    expect(kigaliHour(LATE)).toBe(0);
    expect(kigaliHour("2026-11-02T09:00:00Z")).toBe(11);
  });
});
