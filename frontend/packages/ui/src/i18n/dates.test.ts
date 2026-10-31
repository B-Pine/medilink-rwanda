import { afterEach, describe, expect, it } from "vitest";

import { dateFormat, setKinyarwandaDatesSupport } from "./dates";

// Monday 2 November 2026, 08:30 in Kigali (UTC+2)
const AT = new Date(Date.UTC(2026, 10, 2, 6, 30));
const KIGALI = { timeZone: "Africa/Kigali" } as const;

describe("dateFormat", () => {
  afterEach(() => setKinyarwandaDatesSupport(null));

  it("uses Kinyarwanda names when the browser has no rw calendar data (Chrome)", () => {
    setKinyarwandaDatesSupport(false);
    expect(
      dateFormat("rw", { ...KIGALI, weekday: "long", day: "numeric", month: "long" }).format(AT),
    ).toBe("Kuwa mbere, 2 Ugushyingo");
    expect(dateFormat("rw", { ...KIGALI, weekday: "short" }).format(AT)).toBe("Mbe.");
    expect(dateFormat("rw", { ...KIGALI, dateStyle: "full" }).format(AT)).toBe(
      "Kuwa mbere, 2 Ugushyingo 2026",
    );
    expect(dateFormat("rw", { ...KIGALI, hour: "2-digit", minute: "2-digit" }).format(AT)).toBe(
      "08:30",
    );
    expect(dateFormat("rw", { ...KIGALI, day: "numeric", month: "short" }).format(AT)).toBe(
      "2 Ugu.",
    );
  });

  it("leaves English and French to Intl", () => {
    expect(dateFormat("en", { ...KIGALI, weekday: "long" }).format(AT)).toBe("Monday");
    expect(dateFormat("fr", { ...KIGALI, weekday: "long" }).format(AT)).toBe("lundi");
  });
});
