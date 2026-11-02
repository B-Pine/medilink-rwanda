import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderApp } from "../../test/render";

/** PT-F1..F5 (contract public-pages-and-triage §5) against the contract mocks. */

describe("symptom checker (PT-F3)", () => {
  it("a danger sign goes straight to the emergency answer, with no booking offered", async () => {
    const { user } = renderApp("/check-symptoms");
    await user.click(await screen.findByRole("button", { name: "Chest pain" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Get help now");
    expect(screen.queryByRole("button", { name: "None of these" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "What to do in an emergency" })).toHaveAttribute(
      "href",
      "/emergency",
    );
  });

  it("who, what, how long; then the urgency, the kind of care and places nearby", async () => {
    const { user, container } = renderApp("/check-symptoms");
    await user.click(await screen.findByRole("button", { name: "None of these" }));
    await user.click(screen.getByRole("button", { name: "An adult (18 to 64)" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(await screen.findByRole("button", { name: "Fever" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(await screen.findByRole("button", { name: "2 to 6 days" }));
    await user.click(screen.getByRole("button", { name: "See the advice" }));

    expect(await screen.findByText("See a clinician today")).toBeInTheDocument();
    expect(screen.getByText("A fever needs a malaria test the same day.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /See places near me/ })).toHaveAttribute(
      "href",
      "/search?service=general",
    );
    expect(
      screen.getByText("These rules are being reviewed by clinicians before the pilot."),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("information pages (PT-F4, PT-F5)", () => {
  it("about marks unconfirmed facts instead of stating them", async () => {
    const { container } = renderApp("/about");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Care that knows you are coming" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("To confirm").length).toBeGreaterThan(0);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("emergency gives the number and the danger signs", async () => {
    renderApp("/emergency");
    expect(
      await screen.findByRole("heading", { level: 1, name: "In an emergency, do not wait" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Chest pain or pressure")).toBeInTheDocument();
    expect(screen.getAllByText("912").length).toBeGreaterThan(0);
  });

  it("privacy and terms are drafts with their sections", async () => {
    const { router } = renderApp("/privacy");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Privacy notice" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your rights" })).toBeInTheDocument();
    expect(screen.getByText(/Draft for review/)).toBeInTheDocument();
    await router.navigate("/terms");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Terms of use" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Not for emergencies" })).toBeInTheDocument();
  });
});

describe("care near you on the home page (PT-F1)", () => {
  it("a district shows verified facilities with the live queue and accepted insurers", async () => {
    const { user, container } = renderApp("/");
    const section = (await screen.findByRole("heading", { name: "Care near you" })).closest(
      "section",
    )!;
    await user.selectOptions(within(section).getByLabelText("Or choose a district"), "gasabo");
    const tiles = await within(section).findAllByRole("article");
    expect(tiles.length).toBeGreaterThan(0);
    expect(within(section).getAllByText("Insurance accepted").length).toBe(tiles.length);
    expect(within(section).getAllByText("RAMA").length).toBeGreaterThan(0);
    expect(within(section).getByRole("link", { name: "Search all facilities" })).toHaveAttribute(
      "href",
      "/search",
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("links to the symptom checker and the new footer pages", async () => {
    renderApp("/");
    expect(await screen.findByRole("link", { name: /Not sure where to go\?/ })).toHaveAttribute(
      "href",
      "/check-symptoms",
    );
    const footer = screen.getByRole("navigation", { name: "Site links" });
    for (const [name, href] of [
      ["About", "/about"],
      ["Emergency", "/emergency"],
      ["Check symptoms", "/check-symptoms"],
    ]) {
      expect(within(footer).getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });
});
