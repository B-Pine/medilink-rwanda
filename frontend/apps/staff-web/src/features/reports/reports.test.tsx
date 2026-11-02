import { MOCK_PASSWORD, MOCK_TOTP_CODE } from "@medilink/api-client/mocks";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../../test/render";

/** S10c-F1..F3 (staff-web `reports`) against the contract mocks. */

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

describe("reports (S10c)", () => {
  it("the period report shows the figures, the money and the doctors", async () => {
    const app = await signIn("facility.admin@medilink.test");
    await app.router.navigate("/reports/period");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Period report" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Median wait")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Money (RWF)" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Uwimana Keza" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeEnabled();
    expect(await axe(app.container)).toHaveNoViolations();
  });

  it("the audit log filters by action prefix", async () => {
    const app = await signIn("facility.admin@medilink.test");
    await app.router.navigate("/audit");
    expect(await screen.findByText("pharmacy.dispensed")).toBeInTheDocument();
    await app.user.type(screen.getByRole("searchbox", { name: "Action" }), "billing.");
    expect(await screen.findByText("billing.payment.recorded")).toBeInTheDocument();
    expect(screen.queryByText("pharmacy.dispensed")).not.toBeInTheDocument();
  });

  it("reception has no report or audit log", async () => {
    const app = await signIn("reception@medilink.test");
    await app.router.navigate("/audit");
    expect(
      await screen.findByRole("heading", { level: 1, name: "You don't have access to this page" }),
    ).toBeInTheDocument();
  });
});
