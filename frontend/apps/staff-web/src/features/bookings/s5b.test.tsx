import { MOCK_PASSWORD, MOCK_TOTP_CODE } from "@medilink/api-client/mocks";
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../../test/render";

const ADMIN = "facility.admin@medilink.test"; // facility admin at Kigali Clinic (schedule.manage)

/** S5b staff-web (contract §6.2): reception calendar, disruption wizard, follow-up action. */

async function signIn(path: string, email: string) {
  const app = renderApp(path);
  await logIn(app.user, email, MOCK_PASSWORD);
  await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
  await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  if (email === "doctor@medilink.test") {
    // three facilities: pick Kigali Clinic, then open the page
    await app.user.click(await screen.findByRole("button", { name: "Work at Kigali Clinic" }));
    await screen.findByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ });
    await act(() => app.router.navigate(path));
  }
  return app;
}

describe("reception calendar (R9)", () => {
  it("shows the week, then a day with its bookings, per doctor", async () => {
    const { user, container } = await signIn("/calendar", "reception@medilink.test");
    expect(await screen.findByRole("heading", { level: 1, name: "Calendar" })).toBeInTheDocument();
    expect(await screen.findByText(/^Week of /, { selector: "p" })).toBeInTheDocument();
    expect(screen.getByLabelText("Doctor")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: "Day" }));
    expect(screen.getByRole("button", { name: "Day" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Today" }));
    // weekends have no sessions: step forward to the next weekday
    for (let i = 0; i < 4; i++) {
      // the day has loaded: either its sessions or the empty state
      await waitFor(() =>
        expect(
          screen.queryAllByRole("article").length > 0 || screen.queryByText("Nothing scheduled"),
        ).toBeTruthy(),
      );
      if (screen.queryAllByRole("article").length) break;
      await user.click(screen.getByRole("button", { name: "Next" }));
    }
    const sessions = await screen.findAllByRole("article");
    expect(sessions.some((s) => within(s).queryByText(/Dr Keza Umutoni/))).toBe(true);
    expect(within(sessions[0]!).getByText(/of \d+ booked/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("gives a doctor only their own calendar", async () => {
    await signIn("/calendar", "doctor@medilink.test");
    expect(
      await screen.findByRole("heading", { level: 1, name: "My calendar" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Doctor")).not.toBeInTheDocument();
    expect(screen.getByText("You see your own sessions and bookings.")).toBeInTheDocument();
  });
});

describe("disruptions (R7)", () => {
  it("lists the open disruption and walks through its answers", async () => {
    const { user, container } = await signIn("/disruptions", ADMIN);
    const list = await screen.findByRole("list", { name: "Disruptions" });
    await user.click(within(list).getByRole("link", { name: /Doctor absent/ }));
    const answers = await screen.findByRole("list", { name: "Patient answers" });
    expect(within(answers).getByText("Waiting")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("creates a disruption, shows the affected bookings and applies one action to all", async () => {
    const { user, container } = await signIn("/disruptions", ADMIN);
    await user.click(await screen.findByRole("button", { name: "New disruption" }));
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("What happened"), "closure");
    const now = new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
    const from = screen.getByLabelText("From");
    const to = screen.getByLabelText("To");
    await user.clear(from);
    await user.type(from, `${now}T00:00`);
    await user.clear(to);
    await user.type(to, `${now}T23:59`);
    await user.type(screen.getByLabelText(/Reason/), "Water cut");
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole("button", { name: "Find affected bookings" }));

    expect(await screen.findByText("Step 2 of 3")).toBeInTheDocument();
    const affected = await screen.findByRole("list", { name: "Affected bookings" });
    expect(within(affected).getAllByRole("listitem").length).toBeGreaterThan(0);
    await user.selectOptions(screen.getByLabelText("Action for everyone not done yet"), "cancel");
    await user.click(screen.getByRole("button", { name: "Apply to all" }));

    expect(await screen.findByText("Step 3 of 3")).toBeInTheDocument();
    const answers = screen.getByRole("list", { name: "Patient answers" });
    expect(within(answers).getAllByText("Cancelled").length).toBeGreaterThan(0);
    expect(await screen.findByText(/This disruption is resolved/)).toBeInTheDocument();
  });

  it("needs the end after the start", async () => {
    const { user } = await signIn("/disruptions", ADMIN);
    await user.click(await screen.findByRole("button", { name: "New disruption" }));
    await user.selectOptions(screen.getByLabelText("What happened"), "closure");
    const to = screen.getByLabelText("To");
    await user.clear(to);
    await user.type(to, "2020-01-01T08:00");
    await user.type(screen.getByLabelText(/Reason/), "Past");
    await user.click(screen.getByRole("button", { name: "Find affected bookings" }));
    expect(await screen.findAllByText(/The end must be after the start/)).not.toHaveLength(0);
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
  });

  it("is hidden from reception", async () => {
    await signIn("/disruptions", "reception@medilink.test");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "New disruption" })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("link", { name: "Disruptions" })).not.toBeInTheDocument();
  });
});
