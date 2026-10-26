import {
  MOCK_FACILITY_ADMIN_EMAIL,
  MOCK_INVITATION_TOKEN,
  MOCK_PASSWORD,
  MOCK_TOTP_CODE,
} from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../../test/render";

/** S2-F1..F12 (staff-web `setup`) against the contract mocks. */

async function signIn(email = MOCK_FACILITY_ADMIN_EMAIL, path = "/setup") {
  const app = renderApp(path);
  await logIn(app.user, email, MOCK_PASSWORD);
  await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
  await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  return app;
}

describe("setup checklist and Today (S2-F2)", () => {
  it("lists every step with icon + label, links each one, and holds go-live until complete", async () => {
    const { container } = await signIn();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Setup checklist" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("9 of 10 steps done")).toBeInTheDocument();
    const schedules = screen.getByText("Doctor schedules", { selector: "span" }).closest("li")!;
    expect(within(schedules).getByText("To do")).toBeInTheDocument();
    expect(
      within(schedules).getByRole("link", { name: "Set up: Doctor schedules" }),
    ).toHaveAttribute("href", "/settings/schedules");
    expect(screen.getByRole("button", { name: "Go live" })).toBeDisabled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows the setup card and pending leave on Today for the facility admin", async () => {
    await signIn(MOCK_FACILITY_ADMIN_EMAIL, "/today");
    expect(
      await screen.findByRole("heading", { name: "Finish setting up your facility" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Leave requests" })).toBeInTheDocument();
    expect(screen.getByText("1 request waits for your decision")).toBeInTheDocument();
  });
});

describe("opening hours (S2-F4)", () => {
  it("copies Monday to weekdays, checks the break, and previews four weeks", async () => {
    const { user, container } = await signIn(MOCK_FACILITY_ADMIN_EMAIL, "/settings/hours");
    await screen.findByRole("heading", { level: 2, name: "Weekly hours" });
    const monday = screen.getByRole("group", { name: "Opening hours, Monday" });
    const opens = within(monday).getByLabelText("Opens");
    await user.clear(opens);
    await user.type(opens, "09:00");
    await user.click(screen.getByRole("button", { name: "Copy Monday to weekdays" }));
    expect(
      within(screen.getByRole("group", { name: "Opening hours, Thursday" })).getByLabelText(
        "Opens",
      ),
    ).toHaveValue("09:00");
    const breakEnds = within(screen.getByRole("group", { name: "Break, Monday" })).getByLabelText(
      "Break ends",
    );
    await user.clear(breakEnds);
    await user.type(breakEnds, "18:00");
    expect(await screen.findAllByText("The break must sit inside opening hours.")).not.toHaveLength(
      0,
    );
    expect(screen.getByRole("button", { name: "Save hours" })).toBeDisabled();
    expect(await screen.findByRole("list", { name: "Next four weeks" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("schedules (S2-F3, F5)", () => {
  it("draws sessions to scale with day + time names, offers a table view, and decides leave", async () => {
    const { user, container } = await signIn(MOCK_FACILITY_ADMIN_EMAIL, "/settings/schedules");
    const session = await screen.findByRole("button", {
      name: /^Monday, 08:00–12:00, General consultation/,
    });
    expect(session).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: "List" }));
    const table = screen.getByRole("table", { name: "Week of Uwimana Keza" });
    expect(
      within(table).getByRole("button", { name: /^Edit: Monday, 08:00–12:00/ }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("button", { name: "Add session on Thursday" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Niyonsenga Paul/ }));
    expect(
      await screen.findByText("Attest this doctor's licence before adding sessions."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Staff" })).toHaveAttribute("href", "/staff");

    await user.click(screen.getByRole("button", { name: "Approve: Uwimana Keza" }));
    expect(await screen.findByText("Approved")).toBeInTheDocument();
  });

  it("warns when a new session overlaps the doctor's work elsewhere, as a time range", async () => {
    const { user } = await signIn(MOCK_FACILITY_ADMIN_EMAIL, "/settings/schedules");
    await user.click(await screen.findByRole("button", { name: "Add session on Thursday" }));
    const panel = await screen.findByRole("dialog", { name: "New session for Uwimana Keza" });
    await user.click(within(panel).getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Thursday 08:00–12:00 at another facility")).toBeInTheDocument();
  });
});

describe("billing setup (S2-F6)", () => {
  it("changes a price from a date and shows the history", async () => {
    const { user, container } = await signIn(MOCK_FACILITY_ADMIN_EMAIL, "/settings/tariffs");
    await user.click(
      await screen.findByRole("button", { name: "Change price: General consultation" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Change the price of General consultation",
    });
    const price = within(dialog).getByLabelText("New price");
    await user.clear(price);
    await user.type(price, "7500");
    expect(price).toHaveValue("7,500");
    await user.click(within(dialog).getByRole("button", { name: "Save new price" }));
    expect(await screen.findByText("7,500 RWF")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Price history: General consultation" }));
    const history = await screen.findByRole("dialog", { name: "History of General consultation" });
    expect(within(history).getByText("4,000 RWF")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows insurer rules with the patient share in percent", async () => {
    await signIn(MOCK_FACILITY_ADMIN_EMAIL, "/settings/insurers");
    expect(await screen.findByRole("heading", { name: "RSSB (RAMA)" })).toBeInTheDocument();
    expect(screen.getByText("15%")).toBeInTheDocument();
  });
});

describe("staff (S2-F7)", () => {
  it("invites, deactivates with a reason, and explains the last-admin rule", async () => {
    const { user, container } = await signIn(MOCK_FACILITY_ADMIN_EMAIL, "/staff");
    await screen.findByRole("table", { name: "Members" });
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: "Invite staff" }));
    const invite = await screen.findByRole("dialog", { name: "Invite staff" });
    await user.type(within(invite).getByLabelText("Email"), "new.doctor@example.test");
    await user.click(within(invite).getByLabelText("Doctor"));
    await user.click(within(invite).getByRole("button", { name: "Send invitation" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Invite staff" })).not.toBeInTheDocument(),
    );

    await user.click(
      within(screen.getByRole("table", { name: "Members" })).getByRole("button", {
        name: /Habimana Eric/,
      }),
    );
    const panel = await screen.findByRole("dialog", { name: "Habimana Eric" });
    await user.click(within(panel).getByRole("button", { name: "Deactivate" }));
    const confirm = await screen.findByRole("dialog", { name: "Deactivate Habimana Eric?" });
    const go = within(confirm).getByRole("button", { name: "Deactivate" });
    expect(go).toBeDisabled();
    await user.type(within(confirm).getByLabelText("Reason"), "Left the facility");
    await user.click(go);
    expect(await within(panel).findByText("Deactivated.")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Close" }));

    await user.click(
      within(screen.getByRole("table", { name: "Members" })).getByRole("button", {
        name: /Mutesi Diane/,
      }),
    );
    const self = await screen.findByRole("dialog", { name: "Mutesi Diane" });
    await user.click(within(self).getByLabelText("Facility admin"));
    await user.click(within(self).getByLabelText("Receptionist"));
    await user.click(within(self).getByRole("button", { name: "Save changes" }));
    expect(await within(self).findByText(/needs at least one admin/)).toBeInTheDocument();
  });
});

describe("rules (S2-F9)", () => {
  it("builds each section from its schema and saves", async () => {
    const { user } = await signIn(MOCK_FACILITY_ADMIN_EMAIL, "/settings/rules");
    const field = await screen.findByLabelText("Repeat a call after (seconds)");
    await user.clear(field);
    await user.type(field, "45");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });
});

describe("permissions (S2-F1, F10)", () => {
  it("doctor sees only their schedule and can request leave", async () => {
    const app = renderApp("/login");
    await logIn(app.user, "doctor@medilink.test", MOCK_PASSWORD);
    await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
    await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
    await app.user.click(await screen.findByRole("button", { name: "Work at Kigali Clinic" }));
    const nav = await screen.findByRole("navigation", { name: "Main menu" });
    expect(within(nav).getByRole("link", { name: "My schedule" })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
    await app.user.click(within(nav).getByRole("link", { name: "My schedule" }));
    await app.user.click(await screen.findByRole("button", { name: "Request leave" }));
    const dialog = await screen.findByRole("dialog", { name: "Request leave" });
    await app.user.click(within(dialog).getByRole("button", { name: "Send request" }));
    expect(await screen.findAllByText("Waiting")).not.toHaveLength(0);
  });

  it("receptionist gets not found on settings", async () => {
    await signIn("reception@medilink.test", "/settings/tariffs");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeInTheDocument();
  });
});

describe("invitation page (S2-F8)", () => {
  it("new account: name + password, then MFA setup", async () => {
    const { user } = renderApp(`/invite/${MOCK_INVITATION_TOKEN}`);
    expect(await screen.findByText("Gasabo Family Clinic")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Full name"), "Mukamana Alice");
    await user.type(screen.getByLabelText(/^Password/), "a-long-enough-password");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByLabelText("6-digit code")).toBeInTheDocument();
  });

  it("a bad link shows one generic message", async () => {
    const { container } = renderApp("/invite/not-a-token");
    expect(await screen.findByText("This link does not work")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
