import { MOCK_DISPUTE, MOCK_PASSWORD, MOCK_TOTP_CODE } from "@medilink/api-client/mocks";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../../test/render";

/** S10b-F2 (staff-web `disputes`) against the contract mocks. */

async function signIn(email: string) {
  const app = renderApp("/today");
  await logIn(app.user, email, MOCK_PASSWORD);
  await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
  await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  const facility = await screen.findByRole("heading", {
    level: 1,
    name: /^(Choose your facility|Good (morning|afternoon|evening))/,
  });
  if (facility.textContent === "Choose your facility")
    await app.user.click(screen.getByRole("button", { name: "Work at Kigali Clinic" }));
  await screen.findByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ });
  return app;
}

describe("disputes (S10b-F2)", () => {
  it("the facility admin sees the queue, the facts and internal notes, and decides", async () => {
    const app = await signIn("facility.admin@medilink.test");
    const nav = screen.getByRole("navigation", { name: /Main/ });
    await app.user.click(within(nav).getByRole("link", { name: "Disputes" }));
    await app.user.click(await screen.findByRole("link", { name: "Mukamana Jeanne" }));
    expect(await screen.findByText(/10 tablets but the prescription says 21/)).toBeInTheDocument();
    expect(screen.getByText("RX-2026-000099")).toBeInTheDocument();
    expect(screen.getByText(/shelf count/)).toBeInTheDocument(); // the internal note
    expect(screen.getByText(/Medicines given/)).toBeInTheDocument();

    const decide = screen.getByRole("form", { name: "Decide" });
    await app.user.click(within(decide).getByRole("button", { name: "Record the decision" }));
    expect(within(decide).getByText("Choose the outcome.")).toBeInTheDocument();
    // only outcomes that fit a prescription are offered
    const outcome = within(decide).getByRole("combobox", { name: "Outcome" });
    expect(within(outcome).queryByRole("option", { name: "Refund" })).not.toBeInTheDocument();
    await app.user.selectOptions(outcome, "rejected");
    await app.user.type(
      within(decide).getByRole("textbox", { name: "Reason" }),
      "The dispensing record shows 21 given.",
    );
    await app.user.click(within(decide).getByRole("button", { name: "Record the decision" }));
    expect(await screen.findByText("The dispensing record shows 21 given.")).toBeInTheDocument();
    expect(screen.getAllByText("Decided").length).toBeGreaterThan(0);
    expect(await axe(app.container)).toHaveNoViolations();
  });

  it("reception does not see the disputes queue", async () => {
    const app = await signIn("reception@medilink.test");
    // reception raises at the counter and comments when asked; it never handles the queue
    await app.router.navigate("/disputes");
    expect(
      await screen.findByRole("heading", { level: 1, name: "You don't have access to this page" }),
    ).toBeInTheDocument();
    expect(MOCK_DISPUTE).toBeTruthy();
  });
});
