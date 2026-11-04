import { MOCK_PASSWORD, MOCK_TOTP_CODE } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../../test/render";

/** W7 (upgrade 13): a doctor plans a vaccination or antenatal date on the patient record. */

async function openRecord(email: string) {
  const app = renderApp("/patients");
  await logIn(app.user, email, MOCK_PASSWORD);
  await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
  await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  // the doctor works at two facilities and chooses one first
  const heading = await screen.findByRole("heading", {
    level: 1,
    name: /^(Choose your facility|Patients)$/,
  });
  if (heading.textContent === "Choose your facility") {
    await app.user.click(screen.getByRole("button", { name: "Work at Kigali Clinic" }));
    await waitFor(() => expect(app.router.state.location.pathname).not.toBe("/select-facility"));
    await app.router.navigate("/patients");
  }
  await app.user.type(
    await screen.findByRole("combobox", { name: "Find a patient" }),
    "Mukamana{Enter}",
  );
  const table = await screen.findByRole("table", { name: "Search results" });
  await app.user.click(within(table).getByRole("link", { name: "Mukamana Jeanne" }));
  await screen.findByRole("heading", { level: 1, name: "Mukamana Jeanne" });
  return app;
}

function inDays(days: number) {
  return new Date(Date.now() + 2 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);
}

describe("care schedule", () => {
  it("a doctor adds a planned date and cancels it", async () => {
    const { user, container } = await openRecord("doctor@medilink.test");
    await user.click(await screen.findByRole("tab", { name: "Care schedule" }));
    expect(await screen.findByText("Nothing planned.")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("What"), "antenatal");
    await user.type(screen.getByLabelText("Date"), inDays(14));
    await user.type(screen.getByLabelText("Note (optional)"), "Third visit");
    await user.click(screen.getByRole("button", { name: "Add to the schedule" }));
    expect(await screen.findByText("Added. The patient will get reminders.")).toBeInTheDocument();
    expect(await screen.findByText("Third visit")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: "Cancel date" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel this planned date?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel date" }));
    await waitFor(() => expect(screen.queryByText("Third visit")).not.toBeInTheDocument());
    expect(await screen.findByText("Nothing planned.")).toBeInTheDocument();
  });

  it("reception does not see the tab (an antenatal date is clinical)", async () => {
    await openRecord("reception@medilink.test");
    expect(await screen.findByRole("tab", { name: "Details" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Care schedule" })).not.toBeInTheDocument();
  });
});
