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
    // calling 912 comes first, and no way past the danger step is offered
    expect(
      within(screen.getByRole("alert")).getByRole("link", { name: "Call 912" }),
    ).toHaveAttribute("href", "tel:912");
    expect(screen.queryByRole("button", { name: /None of these/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "What to do in an emergency" })).toHaveAttribute(
      "href",
      "/emergency",
    );
  });

  it("who, what, how long; then the urgency, the kind of care and places nearby", async () => {
    const { user, container } = renderApp("/check-symptoms");
    await user.click(await screen.findByRole("button", { name: "None of these, continue" }));
    await user.click(screen.getByRole("button", { name: "An adult (18 to 64)" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(await screen.findByRole("button", { name: "Fever" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(await screen.findByRole("button", { name: "2 to 6 days" }));
    await user.click(screen.getByRole("button", { name: "See the advice" }));

    expect(await screen.findByText("See a clinician today")).toBeInTheDocument();
    expect(screen.getByText("A fever needs a malaria test the same day.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /See facilities near me/ })).toHaveAttribute(
      "href",
      "/find-care?service=general",
    );
    expect(
      screen.getByText("These rules are being reviewed by clinicians before the pilot."),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("information pages (PT-F4, PT-F5)", () => {
  it("about is one paragraph and the facts; the journey stays on How it works", async () => {
    const { container } = renderApp("/about");
    expect(
      await screen.findByRole("heading", { level: 1, name: "About MediLink" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/puts Rwanda's health facilities in one place/)).toBeInTheDocument();
    expect(screen.getByText("Stored in Rwanda, under Law 058/2021")).toBeInTheDocument();
    expect(
      within(screen.getByRole("main")).getByRole("link", { name: /how it works/i }),
    ).toHaveAttribute("href", "/how-it-works");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("how it works tells the journey in four steps, then what is good to know", async () => {
    renderApp("/how-it-works");
    expect(
      await screen.findByRole("heading", { level: 1, name: "How MediLink works" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2, name: /^Step \d/ })).toHaveLength(4);
    expect(screen.getByText("Walk-ins are still welcome.")).toBeInTheDocument();
  });

  it("help shows the most asked answers in view and folds the rest", async () => {
    const { user } = renderApp("/help");
    const top = await screen.findByRole("region", { name: "Most asked" });
    expect(within(top).getAllByRole("definition")).toHaveLength(5);
    expect(screen.getByRole("region", { name: "More questions" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search help"), "zzzz-nothing");
    expect(await screen.findByText("0 answers")).toBeInTheDocument();
  });

  it("a service page shows the description written in master data", async () => {
    renderApp("/services/vaccination");
    expect(
      await screen.findByText("Vaccines protect children and adults from serious diseases."),
    ).toBeInTheDocument();
  });

  it("emergency gives the number and the danger signs", async () => {
    renderApp("/emergency");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Need emergency care?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Chest pain or pressure")).toBeInTheDocument();
    expect(screen.getAllByText(/912/).length).toBeGreaterThan(0);
    // a facility whose admin declares a 24-hour emergency department is badged and comes first
    const first = (await screen.findAllByText("24-hour emergency"))[0]!;
    expect(first.closest("li")).toBe(
      screen.getAllByRole("listitem").find((li) => li.querySelector("a[href^='/facilities/']")),
    );
  });

  it("privacy and terms show their sections and no draft markers", async () => {
    const { router } = renderApp("/privacy");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Privacy notice" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your rights" })).toBeInTheDocument();
    expect(screen.queryByText(/Draft text awaiting legal review/)).not.toBeInTheDocument();
    expect(screen.queryByText("To confirm")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent(
      "Privacy notice",
    );
    await router.navigate("/terms");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Terms of use" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Not for emergencies" })).toBeInTheDocument();
  });
});

describe("care near you on the home page (PT-F1)", () => {
  it("the home page lists facilities with the live queue and accepted insurers", async () => {
    const { container } = renderApp("/");
    // named for what it holds at any hour: open places first, closed ones too (audit 2026-11-07)
    const section = await screen.findByRole("region", { name: "Facilities near you" });
    const list = await within(section).findByRole("list", { name: "Facilities near you" });
    const rows = within(list).getAllByRole("heading", { level: 3 });
    expect(rows.length).toBeGreaterThan(0);
    expect(within(section).getAllByText(/RAMA/).length).toBeGreaterThan(0);
    expect(within(rows[0]!).getByRole("link")).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/facilities\//),
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("links to the symptom checker and the new footer pages", async () => {
    renderApp("/");
    expect(await screen.findByRole("link", { name: /Not sure where to go/ })).toHaveAttribute(
      "href",
      "/check-symptoms",
    );
    const footer = screen.getByRole("navigation", { name: "Site links" });
    for (const [name, href] of [
      ["About MediLink", "/about"],
      ["Not sure where to go?", "/check-symptoms"],
    ]) {
      expect(within(footer).getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });
});
