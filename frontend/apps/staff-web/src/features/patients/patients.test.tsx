import { MOCK_PASSWORD, MOCK_TOTP_CODE } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../../test/render";

/** S3-F2..F6 (staff patients) against the contract mocks. */

async function signIn(email = "reception@medilink.test", path = "/patients") {
  const app = renderApp(path);
  await logIn(app.user, email, MOCK_PASSWORD);
  await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
  await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  return app;
}

describe("staff patients", () => {
  it("search finds the duplicate pair, opens a record and is accessible", async () => {
    const { user, container, router } = await signIn();
    expect(await screen.findByRole("heading", { level: 1, name: "Patients" })).toBeInTheDocument();
    const search = await screen.findByRole("combobox", { name: "Find a patient" });
    await user.type(search, "Mukamana{Enter}");
    const table = await screen.findByRole("table", { name: "Search results" });
    expect(within(table).getByRole("link", { name: "Mukamana Jeanne" })).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "Jeanne Mukamana" })).toBeInTheDocument();
    expect(within(table).getAllByText("••••5678").length).toBeGreaterThan(0);
    expect(await axe(container)).toHaveNoViolations();
    await user.click(within(table).getByRole("link", { name: "Mukamana Jeanne" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/patients\/.+/));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Mukamana Jeanne" }),
    ).toBeInTheDocument();
  });

  it("reveals an identifier only with a reason, then re-masks on hide", async () => {
    const { user } = await signIn();
    await user.type(
      await screen.findByRole("combobox", { name: "Find a patient" }),
      "Mukamana{Enter}",
    );
    const table = await screen.findByRole("table", { name: "Search results" });
    await user.click(within(table).getByRole("link", { name: "Mukamana Jeanne" }));
    await user.click(await screen.findByRole("tab", { name: "Identifiers" }));
    await user.click(await screen.findByRole("button", { name: "Show: National ID" }));
    const dialog = await screen.findByRole("dialog", { name: "Show identity document" });
    await user.selectOptions(within(dialog).getByLabelText("Reason"), "other");
    expect(within(dialog).getByRole("button", { name: "Show" })).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Explain the reason"), "Insurance desk");
    await user.click(within(dialog).getByRole("button", { name: "Show" }));
    expect(await screen.findByText("1198470012345678")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide: National ID" }));
    expect(screen.queryByText("1198470012345678")).not.toBeInTheDocument();
  });

  it("walk-in: suggestions, duplicate confirmation, then the MediLink number", async () => {
    const { user, container } = await signIn("reception@medilink.test", "/patients/register");
    const form = await screen.findByRole("form", { name: "Register a walk-in" });
    await user.type(within(form).getByLabelText(/Names/), "Jeanne Mukamana");
    await user.click(within(form).getByRole("radio", { name: "Female" }));
    await user.type(within(form).getByLabelText("Date of birth"), "1984-01-01");
    const aside = screen.getByRole("complementary", { name: "Possible matches" });
    expect(
      (await within(aside).findAllByText("Very likely the same person", {}, { timeout: 3000 }))
        .length,
    ).toBeGreaterThan(0);
    await user.click(within(form).getByLabelText("The patient agreed to care consent"));
    await user.click(within(form).getByRole("button", { name: "Register" }));
    await user.click(
      await screen.findByLabelText("I checked the matches: this is a different person"),
    );
    await user.click(within(form).getByRole("button", { name: "Register" }));
    expect(await screen.findByText(/is registered/)).toBeInTheDocument();
    expect(screen.getByText(/^ML-/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("merge request from a record, escalation and listing", async () => {
    const { user } = await signIn();
    await user.type(
      await screen.findByRole("combobox", { name: "Find a patient" }),
      "Mukamana{Enter}",
    );
    const table = await screen.findByRole("table", { name: "Search results" });
    await user.click(within(table).getByRole("link", { name: "Mukamana Jeanne" }));
    await user.click(await screen.findByRole("button", { name: "Report duplicate" }));
    const dialog = await screen.findByRole("dialog", { name: "Report duplicate" });
    await user.type(within(dialog).getByLabelText("Find the other record"), "Jeanne Mukamana");
    await user.click(within(dialog).getByRole("button", { name: "Search" }));
    await user.click(await within(dialog).findByRole("radio", { name: /Jeanne Mukamana/ }));
    await user.type(within(dialog).getByLabelText("Reason"), "Registered twice");
    await user.click(within(dialog).getByRole("button", { name: "Request merge" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Merge requests" }),
    ).toBeInTheDocument();
    await user.click(
      await screen.findByRole("button", { name: /Mukamana Jeanne ← Jeanne Mukamana/ }),
    );
    const panel = await screen.findByRole("dialog", { name: "Merge request" });
    // the requester can't approve their own request
    expect(
      within(panel).queryByRole("button", { name: "Approve and merge" }),
    ).not.toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Send to platform team" }));
    const confirm = await screen.findByRole("dialog", { name: "Send to the platform team?" });
    await user.click(within(confirm).getByRole("button", { name: "Send to platform team" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Send to the platform team?" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("pharmacists don't see patients pages they can't use", async () => {
    await signIn("pharmacist@medilink.test", "/patients/merge-requests");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeInTheDocument();
  });
});
