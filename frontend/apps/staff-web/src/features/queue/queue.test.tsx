import {
  MOCK_DISPLAY_TOKEN,
  MOCK_FACILITY_ADMIN_EMAIL,
  MOCK_PASSWORD,
  MOCK_TOTP_CODE,
} from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("reception today (upgrade 05 §2)", () => {
  it("shows the front desk: desk bar, numbers, next arrivals and check-in by code", async () => {
    const { user, container } = await signIn("reception@medilink.test", "/today");
    const desk = await screen.findByRole("region", { name: "Front desk" });
    expect(within(desk).getByRole("link", { name: /Book by phone|Book/ })).toHaveAttribute(
      "href",
      "/queue?book=new",
    );
    expect(within(desk).getByRole("list", { name: "Today at the front desk" })).toBeInTheDocument();
    expect(within(desk).getByRole("region", { name: "Next arrivals" })).toBeInTheDocument();
    const byCode = within(desk).getByRole("region", { name: "Check in by booking code" });
    await user.type(within(byCode).getByRole("textbox", { name: "Booking code" }), "ZZZZZZ");
    await user.click(within(byCode).getByRole("button", { name: "Find" }));
    expect(await within(byCode).findByText(/No booking with this code/)).toBeInTheDocument();
    expect(screen.queryByText("On site now")).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  }, 40_000);
});

describe("reception board (S4-F2, F3)", () => {
  it("shows the patient's words and action flags, and raises an emergency with a reason", async () => {
    const { user } = await signIn("reception@medilink.test", "/queue");
    const table = await screen.findByRole("table", { name: /General consultation · Consultation/ });
    expect(within(table).getByText(/Cough for a week/)).toBeInTheDocument();
    expect(within(table).getByText("Not paid")).toBeInTheDocument();
    expect(within(table).getByText("Insurance to verify")).toBeInTheDocument();
    expect(within(table).getByText("No phone")).toBeInTheDocument();
    expect(within(table).getByText("Danger sign")).toBeInTheDocument();
    const row = within(table).getByText("Habimana E.").closest("tr")!;
    await user.click(within(row).getAllByRole("button")[0]!);
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByRole("region", { name: "In the patient's words" })).toHaveTextContent(
      "Cough for a week",
    );
    await user.click(within(panel).getByRole("button", { name: "Raise to emergency" }));
    const reason = await screen.findByRole("dialog", { name: "Raise to emergency" });
    await user.type(within(reason).getByRole("textbox"), "Struggling to breathe");
    await user.click(within(reason).getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Raise to emergency" })).not.toBeInTheDocument(),
    );
  }, 60_000);

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
  }, 40_000);

  it("undoes a no-show only with a reason (S5a R5)", async () => {
    const { user } = await signIn("reception@medilink.test", "/queue");
    const missed = await screen.findByRole("list", { name: "Missed today" });
    const row = (await within(missed).findByText("Uwase A.")).closest("li") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Undo no-show" }));
    const dialog = await screen.findByRole("dialog", { name: "Undo no-show" });
    const confirm = within(dialog).getByRole("button", { name: "Confirm" });
    expect(confirm).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText("Reason"), "other");
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Explain"), "Arrived, desk was closed");
    await user.click(confirm);
    await waitFor(() =>
      expect(screen.queryByRole("list", { name: "Missed today" })).not.toBeInTheDocument(),
    );
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

  it("lists remote joiners and confirms an arrival; I'm here alone is not arrival (S5 B9)", async () => {
    const { user, container } = await signIn("reception@medilink.test", "/queue");
    const remote = await screen.findByRole("list", { name: /^Joined from home/ });
    const rows = within(remote).getAllByRole("listitem");
    // the patient who tapped "I'm here" comes first, marked; nobody is confirmed yet
    expect(within(rows[0]!).getByText("Uwera D.")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Says they're here")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Mugabo J.")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    await user.click(within(rows[0]!).getByRole("button", { name: "Confirm arrival" }));
    await waitFor(() => expect(within(remote).queryByText("Uwera D.")).not.toBeInTheDocument());
    // still in the queue, in the same place
    const table = await screen.findByRole("table", { name: /General consultation · Consultation/ });
    expect(within(table).getByText("Uwera D.")).toBeInTheDocument();
  });

  it("moves a ticket up only with a reason, and records it in the timeline", async () => {
    const { user } = await signIn("reception@medilink.test", "/queue");
    const table = await screen.findByRole("table", { name: /General consultation · Consultation/ });
    const last = within(table).getByText("Ingabire D.").closest("tr") as HTMLElement;
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
    await screen.findByRole("table", { name: /General consultation · Consultation/ });
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

  it("/ opens the check-in search; shortcuts are ignored while a panel is open", async () => {
    const { user } = await signIn("reception@medilink.test", "/queue");
    const table = await screen.findByRole("table", { name: /General consultation · Consultation/ });
    await user.click(within(within(table).getAllByRole("row")[1]!).getByRole("button"));
    await screen.findByRole("dialog", { name: /Kamanzi O\./ });
    await user.keyboard("/");
    expect(screen.queryByRole("dialog", { name: "Check in a patient" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.keyboard("/");
    const dialog = await screen.findByRole("dialog", { name: "Check in a patient" });
    expect(within(dialog).getByRole("combobox", { name: "Find a patient" })).toBeInTheDocument();
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
      await screen.findByRole("heading", { level: 1, name: "You don't have access to this page" }),
    ).toBeInTheDocument();
  });
});

describe("operations dashboard and reports (design 04 §3.4, analysis 13 §1)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the facility admin today's figures, queue load and what needs attention", async () => {
    // The mock history has no patients on Sundays, so on a Sunday there is no "vs last" figure:
    // pin the clock (Date only, timers stay real) to the coming Wednesday.
    const wednesday = new Date();
    wednesday.setUTCDate(wednesday.getUTCDate() + ((3 - wednesday.getUTCDay() + 7) % 7));
    wednesday.setUTCHours(10, 0, 0, 0);
    vi.useFakeTimers({ toFake: ["Date"], now: wednesday });
    const { container } = await signIn(MOCK_FACILITY_ADMIN_EMAIL, "/today");
    const ops = await screen.findByRole("region", { name: /^Facility command centre/ });
    expect(await within(ops).findByText("Patients today")).toBeInTheDocument();
    expect(within(ops).getByText("Median wait to be seen")).toBeInTheDocument();
    expect(within(ops).getAllByText(/vs last/).length).toBeGreaterThan(0);
    // no-shows and money are measured now (upgrade 05 §5)
    expect(within(ops).getByText("2 of 14 booked")).toBeInTheDocument();
    expect(within(ops).getByText("Collected today")).toBeInTheDocument();
    expect(within(ops).getByRole("region", { name: "Queue load by service" })).toBeInTheDocument();
    const attention = within(ops).getByRole("region", { name: "Needs your attention" });
    expect(
      within(attention).getByRole("link", { name: /2 requests wait for your approval/ }),
    ).toHaveAttribute("href", "/approvals");
    expect(
      within(attention).getByRole("link", { name: /2 closed cash shifts to review/ }),
    ).toHaveAttribute("href", "/approvals?tab=shifts");
    expect(within(ops).getByRole("region", { name: "Bookings today" })).toBeInTheDocument();
    expect(within(ops).getByRole("region", { name: "Money today" })).toBeInTheDocument();
    expect(within(ops).getByRole("region", { name: "Team on duty" })).toBeInTheDocument();
    // the plain on-site card is replaced, not shown twice
    expect(screen.queryByText("On site now")).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("reviews closed cash shifts: a short drawer needs a note, a balanced one is accepted", async () => {
    const { user, container } = await signIn(MOCK_FACILITY_ADMIN_EMAIL, "/approvals");
    await user.click(await screen.findByRole("tab", { name: /Cash shifts/ }));
    expect(await screen.findByText("Mukamana Aline")).toBeInTheDocument();
    const short = screen.getByText("Habimana Eric").closest("li")!;
    expect(within(short).getByText(/^Short/)).toBeInTheDocument();
    expect(within(short).getByRole("button", { name: "Accept shift" })).toBeDisabled();
    const balanced = screen.getByText("Mukamana Aline").closest("li")!;
    expect(within(balanced).getByText("Balanced")).toBeInTheDocument();
    await user.click(within(balanced).getByRole("button", { name: "Accept shift" }));
    await waitFor(() => expect(screen.queryByText("Mukamana Aline")).not.toBeInTheDocument());
    expect(await axe(container)).toHaveNoViolations();
  }, 40_000);

  it("the reports page shows the period report, each table downloadable, then arrivals", async () => {
    const { container, user } = await signIn(MOCK_FACILITY_ADMIN_EMAIL, "/reports");
    expect(await screen.findByRole("heading", { level: 1, name: "Reports" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Patients seen" })).toBeInTheDocument();
    for (const name of [
      "Waiting time by stage",
      "Top diagnoses",
      "Laboratory",
      "Money",
      "Pharmacy stock",
    ])
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download Money as CSV" })).toBeInTheDocument();
    expect(screen.getByText("Malaria, unspecified")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "When patients arrive (last 4 weeks)" }),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    // By month: one row per month in the chart's table, and the choice is kept in the URL
    await user.selectOptions(screen.getByLabelText("Period"), "90");
    await user.click(screen.getByRole("radio", { name: "Month" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Month" })).toBeChecked());
    const chart = screen.getByRole("table", { name: /Patients over the period/ });
    await waitFor(() => expect(within(chart).getAllByRole("row").length).toBeLessThanOrEqual(5));
  }, 40_000);

  it("receptionists don't see the operations dashboard", async () => {
    await signIn("reception@medilink.test", "/today");
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("region", { name: /^Operations today/ })).not.toBeInTheDocument();
  });
});
