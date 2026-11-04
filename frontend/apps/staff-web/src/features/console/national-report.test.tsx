import { MOCK_PASSWORD, MOCK_TOTP_CODE } from "@medilink/api-client/mocks";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../../test/render";

/** W9 (#208): the national aggregate report, small groups hidden. */

async function signIn(email = "admin@medilink.test", path = "/platform/reports") {
  const app = renderApp(path);
  await logIn(app.user, email, MOCK_PASSWORD);
  await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
  await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  return app;
}

describe("national report", () => {
  it("shows load, waits, diagnoses and stock-outs with small groups hidden", async () => {
    const { container } = await signIn();
    expect(
      await screen.findByRole("heading", { level: 1, name: "National report" }),
    ).toBeInTheDocument();
    const facilities = await screen.findByRole("region", { name: "Load by facility" });
    const muhoza = within(facilities).getByRole("rowheader", { name: "Muhoza Health Post" });
    expect(within(muhoza.closest("tr")!).getAllByText("Hidden").length).toBeGreaterThan(0);
    // the next smallest in Rubavu is hidden too, so the district total can't give Muhoza away
    const gisenyi = within(facilities).getByRole("rowheader", {
      name: "Gisenyi District Hospital",
    });
    expect(within(gisenyi.closest("tr")!).getByText("Hidden")).toBeInTheDocument();
    const kigali = within(facilities).getByRole("rowheader", { name: "Kigali Clinic" });
    expect(within(kigali.closest("tr")!).queryByText("Hidden")).not.toBeInTheDocument();

    const stock = screen.getByRole("region", { name: "Stock-outs now" });
    expect(within(stock).getByText("Amoxicillin 500 mg capsule")).toBeInTheDocument();
    const diagnoses = screen.getByRole("region", { name: "Top diagnoses by district" });
    expect(within(diagnoses).getByText("Malaria, unspecified")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download.*Load by district/ })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("is for the platform team only", async () => {
    await signIn("reception@medilink.test");
    expect(
      await screen.findByRole("heading", { level: 1, name: "You don't have access to this page" }),
    ).toBeInTheDocument();
  });
});
