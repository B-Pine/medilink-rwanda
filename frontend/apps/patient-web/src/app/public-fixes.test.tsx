import { act, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { parseBookingPath } from "../auth/booking-intent";
import { safeReturnPath } from "../auth/return-to";
import { nextOpening } from "../features/site/data";
import { renderApp } from "../test/render";

/** Public site audit 2026-11-07, Phase 1: what was broken stays fixed. */

const KIGALI_GENERAL = "5e000000-0000-4000-8000-000000000001";

describe("next opening when everything is closed", () => {
  // Saturday 2026-11-07 22:00 in Kigali (UTC+2)
  const now = Date.parse("2026-11-07T20:00:00Z");
  const profiles = [
    {
      name: "Late",
      slug: "late",
      hours: [["2026-11-09", "08:00", "17:00"]] as [string, string, string][],
    },
    {
      name: "Early",
      slug: "early",
      hours: [["2026-11-09", "07:30", "17:00"]] as [string, string, string][],
    },
    {
      name: "Past",
      slug: "past",
      hours: [["2026-11-07", "07:00", "17:00"]] as [string, string, string][],
    },
  ];

  it("picks the earliest opening after now, in Kigali time", () => {
    expect(nextOpening(profiles, now)).toEqual({
      name: "Early",
      slug: "early",
      date: "2026-11-09",
      time: "07:30",
    });
  });

  it("is null when no hours are published", () => {
    expect(nextOpening([{ name: "None", slug: "none", hours: [] }], now)).toBeNull();
  });
});

describe("booking from a public page", () => {
  it("reads the booking out of the return address", () => {
    expect(
      parseBookingPath(`/dashboard/book/kigali-clinic?service=${KIGALI_GENERAL}&today=1`),
    ).toEqual({
      slug: "kigali-clinic",
      service: KIGALI_GENERAL,
      join: true,
    });
    expect(parseBookingPath("/dashboard/records")).toBeNull();
    expect(parseBookingPath(undefined)).toBeNull();
    expect(parseBookingPath("/dashboard/book/%E0%A4%A")).toBeNull();
  });

  it("only returns to addresses on this site", () => {
    expect(safeReturnPath("/dashboard/book/x", "/dashboard")).toBe("/dashboard/book/x");
    expect(safeReturnPath("//evil.example", "/dashboard")).toBe("/dashboard");
    expect(safeReturnPath("https://evil.example", "/dashboard")).toBe("/dashboard");
  });

  it("says on the sign-in page what the visitor was booking", async () => {
    renderApp(`/dashboard/book/kigali-clinic?service=${KIGALI_GENERAL}`);
    expect(
      await screen.findByText("Sign in to book General consultation at Kigali Clinic"),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});

describe("pages whose record is gone", () => {
  it.each([
    [
      "/doctors/kigali-clinic--00000000-0000-4000-8000-000000000000",
      "Doctor not found",
      "All doctors",
    ],
    ["/services/not-a-service", "Service not found", "All services"],
    ["/facilities/not-a-facility", "Facility not found", "Back to facilities"],
  ])("%s has an h1, a reason and a way back", async (path, title, back) => {
    renderApp(path);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: back })).toBeInTheDocument();
  });

  it("opens dental care, which facilities offer", async () => {
    renderApp("/services/dental-care");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Dental care" }),
    ).toBeInTheDocument();
  });
});

describe("offline (phase 5)", () => {
  it("says so on the public pages when the connection drops, and clears when it is back", async () => {
    renderApp("/how-it-works");
    await screen.findByRole("heading", { level: 1, name: "How MediLink works" });
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    try {
      act(() => void window.dispatchEvent(new Event("offline")));
      expect(
        await screen.findByText("You are offline. Showing what was last loaded."),
      ).toBeInTheDocument();
      onLine.mockReturnValue(true);
      act(() => void window.dispatchEvent(new Event("online")));
      expect(screen.queryByText(/You are offline/)).not.toBeInTheDocument();
    } finally {
      onLine.mockRestore();
    }
  });
});

describe("forms say what is missing (phase 5)", () => {
  it("document check: an empty code shows an inline error instead of doing nothing", async () => {
    const { user } = renderApp("/verify");
    await screen.findByRole("heading", { level: 1 });
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Enter the code on the document.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Verification code/)).toHaveAttribute("aria-invalid", "true");
    await user.type(screen.getByLabelText(/^Verification code/), "A");
    expect(screen.queryByText("Enter the code on the document.")).not.toBeInTheDocument();
  });
});
