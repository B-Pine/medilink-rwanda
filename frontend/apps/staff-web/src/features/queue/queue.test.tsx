import {
  MOCK_DISPLAY_TOKEN,
  MOCK_FACILITY_ADMIN_EMAIL,
  MOCK_PASSWORD,
  MOCK_TOTP_CODE,
} from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../../test/render";

/** S4-F1..F9 (staff-web `queue`) against the contract mocks. */

async function signIn(email: string, path: string, facility?: string) {
  const app = renderApp(path);
  await logIn(app.user, email, MOCK_PASSWORD);
  await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
  await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  if (facility) {
    await app.user.click(await screen.findByRole("button", { name: `Work at ${facility}` }));
    const nav = await screen.findByRole("navigation", { name: "Main menu" });
    await app.user.click(within(nav).getByRole("link", { name: "Queue" }));
  }
  return app;
}

describe("reception board (S4-F2, F3)", () => {
  it("lists who is on site in calling order with flags, and is accessible", async () => {
    const { container } = await signIn("reception@medilink.test", "/queue");
    expect(await screen.findByRole("heading", { level: 1, name: "Queue" })).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: /General consultation · Consultation/ });
    const rows = within(table).getAllByRole("row").slice(1);
    // emergency first, then priority, then arrival order
    expect(within(rows[0]!).getByText("Emergency")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Elderly")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Habimana E.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Now serving" })).toBeInTheDocument();
    const expected = await screen.findByRole("list", { name: "Expected" });
    const booked = within(expected).getAllByRole("listitem");
    expect(within(booked[0]!).getByText("Niyonzima P.")).toBeInTheDocument();
    expect(within(booked[1]!).getByText("Mutesi A.")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("checks in a booked patient from the Expected list (S5a R1, R6)", async () => {
    const { user } = await signIn("reception@medilink.test", "/queue");
    const expected = await screen.findByRole("list", { name: "Expected" });
    const row = (await within(expected).findByText("Mutesi A.")).closest("li") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Check in" }));
    await waitFor(() => expect(within(expected).queryByText("Mutesi A.")).not.toBeInTheDocument());
    const table = await screen.findByRole("table", { name: /General consultation · Consultation/ });
    expect(await within(table).findByText("Mutesi A.")).toBeInTheDocument();
  });

  it("moves a ticket up only with a reason, and records it in the timeline", async () => {
    const { user } = await signIn("reception@medilink.test", "/queue");
    const table = await screen.findByRole("table", { name: /General consultation · Consultation/ });
    const last = within(table).getAllByRole("row").at(-1)!;
    await user.click(within(last).getByRole("button"));
    const panel = await screen.findByRole("dialog", { name: /Ingabire D\./ });
    await user.click(within(panel).getByRole("button", { name: "Move up" }));
    const dialog = await screen.findByRole("dialog", { name: "Move up" });
    const confirm = within(dialog).getByRole("button", { name: "Confirm" });
    expect(confirm).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText("Reason"), "clinical_urgency");
    await user.click(confirm);
    expect(await within(panel).findByText("Moved in the queue")).toBeInTheDocument();
  });

  it("checks in an existing patient with N and shows the ticket", async () => {
    const { user } = await signIn("reception@medilink.test", "/queue");
    await screen.findByRole("table", { name: /General consultation/ });
    await user.keyboard("n");
    const dialog = await screen.findByRole("dialog", { name: "Check in a patient" });
    await user.type(
      within(dialog).getByRole("combobox", { name: "Find a patient" }),
      "Mukamana{Enter}",
    );
    await user.click((await within(dialog).findAllByRole("button", { name: /Choose/ }))[0]!);
    await user.click(within(dialog).getByRole("button", { name: "Check in" }));
    const done = await screen.findByRole("dialog", { name: "Checked in" });
    expect(within(done).getByText(/^G-0\d\d$/)).toBeInTheDocument();
  });
});

describe("doctor's queue (S4-F4)", () => {
  it("calls next with Space, starts and completes", async () => {
    const { user, container } = await signIn(
      "doctor@medilink.test",
      "/queue/mine",
      "Kigali Clinic",
    );
    expect(await screen.findByRole("heading", { level: 1, name: "My queue" })).toBeInTheDocument();
    const complete = await screen.findByRole("button", { name: "Complete visit" });
    await user.click(complete);
    const call = await screen.findByRole("button", { name: "Call next" });
    await waitFor(() => expect(call).toBeEnabled());
    expect(await axe(container)).toHaveNoViolations();
    await user.keyboard(" ");
    expect(await screen.findByRole("button", { name: "Start consultation" })).toBeInTheDocument();
    expect(screen.getByText("Kamanzi O.")).toBeInTheDocument(); // the emergency came first
    await user.click(screen.getByRole("button", { name: "Start consultation" }));
    expect(await screen.findByRole("button", { name: "Complete visit" })).toBeInTheDocument();
  });

  it("cannot call while on a break", async () => {
    const { user } = await signIn("doctor@medilink.test", "/queue/mine", "Kigali Clinic");
    await user.click(await screen.findByRole("button", { name: "Complete visit" }));
    await user.click(await screen.findByRole("button", { name: "On break" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Call next" })).toBeDisabled());
    expect(screen.getByText("Set yourself on duty to call patients.")).toBeInTheDocument();
  });
});

describe("admin pages and display (S4-F1, F5)", () => {
  it("creates a display link shown once", async () => {
    const { user } = await signIn(MOCK_FACILITY_ADMIN_EMAIL, "/settings/displays");
    expect(await screen.findByText("Main waiting room")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add screen" }));
    const dialog = await screen.findByRole("dialog", { name: "Add screen" });
    await user.type(within(dialog).getByLabelText("Screen name"), "Pediatrics corridor");
    await user.click(within(dialog).getAllByRole("checkbox")[0]!);
    await user.click(within(dialog).getByRole("button", { name: "Create link" }));
    const ready = await screen.findByRole("dialog", { name: "Screen link ready" });
    expect(within(ready).getByText(/\/display\/display-/)).toBeInTheDocument();
  });

  it("the display shows numbers and rooms, never names", async () => {
    const { container } = renderApp(`/display/${MOCK_DISPLAY_TOKEN}`);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Kigali Clinic" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("P-004")).toBeInTheDocument();
    expect(screen.getByText("Room 2")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Keza|Habimana|Mukamana|Nshimiyimana/);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("an unknown display link says so", async () => {
    renderApp("/display/wrong");
    expect(await screen.findByText(/This screen link is not valid/)).toBeInTheDocument();
  });

  it("pharmacists don't get the queue board", async () => {
    await signIn("pharmacist@medilink.test", "/queue");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeInTheDocument();
  });
});

describe("operations dashboard and reports (design 04 §3.4, analysis 13 §1)", () => {
  it("shows the facility admin today's figures, queue load and what needs attention", async () => {
    const { container } = await signIn(MOCK_FACILITY_ADMIN_EMAIL, "/today");
    const ops = await screen.findByRole("region", { name: /^Operations today/ });
    expect(await within(ops).findByText("Patients today")).toBeInTheDocument();
    expect(within(ops).getByText("Median wait to be seen")).toBeInTheDocument();
    expect(within(ops).getAllByText(/vs last/).length).toBeGreaterThan(0);
    expect(within(ops).getByText("Measured once online booking opens.")).toBeInTheDocument();
    expect(within(ops).getByRole("region", { name: "Queue load by service" })).toBeInTheDocument();
    expect(within(ops).getByRole("region", { name: "Needs your attention" })).toBeInTheDocument();
    // the plain on-site card is replaced, not shown twice
    expect(screen.queryByText("On site now")).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("the reports page charts the last 14 days with readable tables behind the charts", async () => {
    const { container } = await signIn(MOCK_FACILITY_ADMIN_EMAIL, "/reports");
    expect(await screen.findByRole("heading", { level: 1, name: "Reports" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Patients per day" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Wait to be seen (minutes)" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "When patients arrive (last 4 weeks)" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("table").length).toBeGreaterThanOrEqual(3);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("receptionists don't see the operations dashboard", async () => {
    await signIn("reception@medilink.test", "/today");
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("region", { name: /^Operations today/ })).not.toBeInTheDocument();
  });
});
