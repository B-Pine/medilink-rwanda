import { MOCK_PASSWORD, MOCK_TOTP_CODE } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../../test/render";

async function signInNurse(path = "/today") {
  const app = renderApp(path);
  await logIn(app.user, "triage@medilink.test", MOCK_PASSWORD);
  await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
  await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  return app;
}

/** Upgrade 06 §2 (#200): the triage nurse sees patients between check-in and the doctor. */
describe("triage nurse", () => {
  it("starts on the triage card and sees Triage but not the desk or clinical work", async () => {
    const { container } = await signInNurse();
    expect(await screen.findByRole("heading", { level: 2, name: "Triage" })).toBeInTheDocument();
    expect(await screen.findByText("2 waiting for triage")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main menu" });
    const links = within(nav)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(links).toContain("Triage");
    expect(links).not.toContain("Queue");
    expect(links).not.toContain("Payments");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("calls, takes vitals, raises an emergency and sends the patient to the doctor", async () => {
    const { user, container } = await signInNurse("/triage");
    expect(await screen.findByRole("heading", { level: 1, name: "Triage" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Call next" }));
    await user.click(await screen.findByRole("button", { name: "Start triage" }));

    // what the patient said and what they must not be given
    expect(await screen.findByText("Penicillin")).toBeInTheDocument();
    expect(screen.getByText("Headache and dizziness since yesterday.")).toBeInTheDocument();

    // no vitals yet: the nurse records one or says why
    await user.click(screen.getByRole("radio", { name: /Emergency/ }));
    await user.click(screen.getByRole("button", { name: "Send to the doctor" }));
    expect(await screen.findByText("Say what makes it an emergency.")).toBeInTheDocument();
    expect(
      screen.getByText("Record a vital sign above, or say why none could be taken."),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Temperature/), "38.9");
    await user.click(screen.getByRole("button", { name: "Save vitals" }));
    await waitFor(() => expect(screen.queryByLabelText("Why no vitals?")).not.toBeInTheDocument());
    await user.type(screen.getByLabelText(/What is dangerous/), "Fainted twice this morning");
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole("button", { name: "Send to the doctor" }));
    expect(await screen.findByText(/is waiting for the doctor/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Call next" })).toBeInTheDocument();
  }, 45_000);
});
