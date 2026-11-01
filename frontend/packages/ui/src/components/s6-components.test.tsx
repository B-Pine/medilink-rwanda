import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderWithProviders } from "../test/render";
import { AllergyBanner } from "./AllergyBanner";
import { AutosaveStatus } from "./AutosaveStatus";
import { SectionAnchors } from "./SectionAnchors";

const labels = {
  title: "Allergies",
  noneLabel: "No known allergies",
  unknownLabel: "Not recorded",
};

describe("AllergyBanner (S6-F2)", () => {
  it("names each allergy in text, with detail and an unverified note", async () => {
    const { container } = renderWithProviders(
      <AllergyBanner
        {...labels}
        noKnownAllergies={false}
        allergies={[
          { id: "1", substance: "Penicillin", detail: "Severe" },
          { id: "2", substance: "Peanuts", unverifiedLabel: "not verified" },
        ]}
      />,
    );
    const banner = screen.getByRole("region", { name: "Allergies" });
    expect(banner).toHaveTextContent("Penicillin · Severe");
    expect(banner).toHaveTextContent("Peanuts · not verified");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("says when there are none, and when nobody has asked", () => {
    const { rerender } = renderWithProviders(
      <AllergyBanner {...labels} allergies={[]} noKnownAllergies />,
    );
    expect(screen.getByRole("region", { name: "Allergies" })).toHaveTextContent(
      "No known allergies",
    );
    rerender(<AllergyBanner {...labels} allergies={[]} noKnownAllergies={null} />);
    expect(screen.getByRole("region", { name: "Allergies" })).toHaveTextContent("Not recorded");
  });
});

describe("AutosaveStatus (S6-F2)", () => {
  it("announces the state politely and shows an action on error", async () => {
    const { container, rerender } = renderWithProviders(
      <AutosaveStatus state="saving" label="Saving…" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    rerender(
      <AutosaveStatus
        state="error"
        label="Not saved"
        action={<button type="button">Retry</button>}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Not saved");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("SectionAnchors (S6-F2)", () => {
  it("links to sections on the page and moves focus to the chosen one", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <>
        <SectionAnchors
          label="Consultation sections"
          sections={[
            { id: "plan", label: "Plan" },
            { id: "notes", label: "Private notes" },
          ]}
        />
        <section id="plan" tabIndex={-1} aria-label="Plan section" />
        <section id="notes" tabIndex={-1} aria-label="Notes section" />
      </>,
    );
    const nav = screen.getByRole("navigation", { name: "Consultation sections" });
    expect(nav).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Private notes" }));
    expect(screen.getByRole("region", { name: "Notes section" })).toHaveFocus();
    expect(await axe(container)).toHaveNoViolations();
  });
});
