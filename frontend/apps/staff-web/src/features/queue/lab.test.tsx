import { MOCK_PASSWORD, MOCK_TOTP_CODE } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../../test/render";

async function signInLab(path = "/today") {
  const app = renderApp(path);
  await logIn(app.user, "lab@medilink.test", MOCK_PASSWORD);
  await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
  await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  return app;
}

/** Upgrade 06 §3 (#201): the lab technician takes samples and enters results. */
describe("lab technician", () => {
  it("starts on the lab card and sees the Laboratory but not the desk or clinical work", async () => {
    const { container } = await signInLab();
    expect(
      await screen.findByRole("heading", { level: 2, name: "Laboratory" }),
    ).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main menu" });
    const links = within(nav)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(links).toContain("Laboratory");
    expect(links).not.toContain("Queue");
    expect(links).not.toContain("Payments");
    expect(links).not.toContain("Triage");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("calls, checks identity, takes the samples and enters a flagged result", async () => {
    const { user, container } = await signInLab("/lab");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Laboratory" }),
    ).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Call next" }));
    await user.click(await screen.findByRole("button", { name: "Start" }));

    // who the patient is, whether the visit is paid, and what the doctor asks
    expect(await screen.findByText("Uwimana Grace")).toBeInTheDocument();
    expect(screen.getAllByText("Not paid").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Fever for 3 days, headache. Rule out malaria.").length,
    ).toBeGreaterThan(0);
    expect(await axe(container)).toHaveNoViolations();

    await user.click(
      screen.getByRole("button", { name: "Sample taken: Malaria rapid test (RDT)" }),
    );
    await user.click(await screen.findByRole("button", { name: "Sample taken: Full blood count" }));
    expect(await screen.findByText(/Samples taken for Uwimana G\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Call next" })).toBeInTheDocument();

    // the result: nothing saved without a value; an unexpected answer is flagged
    const form = await screen.findByRole("form", {
      name: "Enter the result: Malaria rapid test (RDT)",
    });
    await user.click(within(form).getByRole("button", { name: "Save result" }));
    expect(within(form).getByText("Enter this result.")).toBeInTheDocument();
    await user.selectOptions(within(form).getByLabelText("Result"), "positive");
    expect(within(form).getByText("Abnormal")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    await user.click(within(form).getByRole("button", { name: "Save result" }));
    expect(await screen.findByText("Result saved: Malaria rapid test (RDT).")).toBeInTheDocument();

    // the full blood count is the last test: the patient goes back to the doctor
    const fbc = await screen.findByRole("form", { name: "Enter the result: Full blood count" });
    await user.type(within(fbc).getByLabelText("Haemoglobin (g/dL)"), "9.8");
    expect(within(fbc).getByText("Low")).toBeInTheDocument();
    await user.type(within(fbc).getByLabelText("White cells (×10⁹/L)"), "6.2");
    await user.type(within(fbc).getByLabelText("Platelets (×10⁹/L)"), "240");
    await user.click(within(fbc).getByRole("button", { name: "Save result" }));
    await waitFor(() =>
      expect(
        screen.getByText("Every result is in. Uwimana Grace goes back to the doctor."),
      ).toBeInTheDocument(),
    );
  }, 60_000);
});
