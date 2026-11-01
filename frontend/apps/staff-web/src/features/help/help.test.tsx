import { MOCK_HELP, MOCK_PASSWORD, MOCK_TOTP_CODE } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../../test/render";

/** S10-F5..F7 (staff-web `help`) against the contract mocks. */

const FACILITY_ADMIN = "facility.admin@medilink.test";
const PLATFORM_ADMIN = "admin@medilink.test";

async function signIn(email: string, path: string) {
  const app = renderApp("/today");
  await logIn(app.user, email, MOCK_PASSWORD);
  await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
  await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  await screen.findByRole("heading", { level: 1 });
  await app.router.navigate(path);
  return app;
}

describe("staff help and support (S10-F5)", () => {
  it("guides by search and topic; my requests; no facility tab without the permission", async () => {
    const { user, container } = await signIn("reception@medilink.test", "/support");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Help and support" }),
    ).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main menu" });
    expect(within(nav).getByRole("link", { name: "Help and support" })).toBeInTheDocument();
    const guides = await screen.findByRole("list", { name: "Guides" });
    expect(
      within(guides).getByRole("link", { name: /Check in a walk-in patient/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Facility requests" })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("tab", { name: "My requests" }));
    const mine = await screen.findByRole("list", { name: "My requests" });
    await user.click(within(mine).getByRole("link", { name: /SR-4HQ2NP/ }));
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "The ticket printer prints blank tickets",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Your reply")).toBeInTheDocument();
  });

  it("new request shows the facility admin notice and opens the request", async () => {
    const { user } = await signIn("reception@medilink.test", "/support/requests/new");
    expect(
      await screen.findByText("Your facility admin can see this request."),
    ).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Topic"), "technical");
    await user.type(screen.getByLabelText("Subject"), "The board does not refresh");
    await user.type(
      screen.getByLabelText("What happened?"),
      "The queue board stays on old tickets.",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "The board does not refresh" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Request SR-[A-Z0-9]{6} sent\./)).toBeInTheDocument();
  });

  it("a facility admin reads a colleague's request without replying", async () => {
    const { user, container } = await signIn(FACILITY_ADMIN, "/support?tab=facility");
    const facility = await screen.findByRole("list", { name: "Facility requests" });
    await user.click(within(facility).getByRole("link", { name: /SR-9PZ6RD/ }));
    expect(await screen.findByText(/Kamanzi Jean opened this request/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Your reply")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close request" })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("platform support queue (S10-F6)", () => {
  it("lists active requests high first, filters, and triages with assign to me", async () => {
    const { user, container } = await signIn(PLATFORM_ADMIN, "/platform/support");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Support queue" }),
    ).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Support queue" });
    const rows = await within(table).findAllByRole("row");
    expect(within(rows[1]!).getByText("High")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await user.selectOptions(screen.getByLabelText("Requester"), "patient");
    await waitFor(() =>
      expect(within(table).queryByRole("link", { name: "Open SR-4HQ2NP" })).not.toBeInTheDocument(),
    );
    await user.click(within(table).getByRole("link", { name: "Open SR-7K3QXM" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "I can't cancel my booking" }),
    ).toBeInTheDocument();
    const details = screen.getByRole("region", { name: "Details" });
    expect(within(details).getByText("Chrome on Android")).toBeInTheDocument();
    await user.click(within(details).getByRole("button", { name: "Unassign" }));
    // the panel re-renders with the new version: look it up again
    expect(await screen.findByText("Details saved.")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Details" })).getByRole("button", {
        name: "Assign to me",
      }),
    ).toBeInTheDocument();
  });

  it("replies and closes with a reason", async () => {
    const { user } = await signIn(PLATFORM_ADMIN, `/platform/support/${MOCK_HELP.staffRequestId}`);
    await user.type(await screen.findByLabelText("Reply to the requester"), "We sent a new roll.");
    await user.click(screen.getByRole("button", { name: "Send reply" }));
    expect(await screen.findByText("Reply sent.")).toBeInTheDocument();
    expect(screen.getByText("We sent a new roll.")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Reason"), "resolved");
    await user.click(screen.getByRole("button", { name: "Close request" }));
    expect(await screen.findByText("This request is closed")).toBeInTheDocument();
    expect(screen.getByText(/^Resolved/)).toBeInTheDocument();
  });

  it("is not found for facility staff", async () => {
    await signIn("reception@medilink.test", "/platform/support");
    expect(await screen.findByRole("heading", { level: 1 })).not.toHaveTextContent("Support queue");
  });
});

describe("help article editor (S10-F7)", () => {
  it("shows missing languages, previews, saves and publishes", async () => {
    const { user, container } = await signIn(PLATFORM_ADMIN, "/platform/help-articles");
    const table = await screen.findByRole("table", { name: "Help articles" });
    await user.click(await within(table).findByRole("link", { name: "Edit End-of-day checklist" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Edit article" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Missing: Kinyarwanda, French/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(await axe(container)).toHaveNoViolations();

    for (const [tab, lang] of [
      ["Kinyarwanda", "Kinyarwanda"],
      ["French", "French"],
    ] as const) {
      await user.click(screen.getByRole("tab", { name: new RegExp(`^${tab}`) }));
      await user.type(screen.getByLabelText(`Title (${lang})`), "Title");
      await user.type(screen.getByLabelText(`Summary (${lang})`), "Summary");
      await user.type(screen.getByLabelText(`Text (${lang})`), "First paragraph.");
    }
    const preview = screen.getByRole("region", { name: "Preview (French)" });
    expect(within(preview).getByText("First paragraph.")).toBeInTheDocument();
    expect(screen.queryByText(/^Missing:/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Published: people can read it now.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unpublish" })).toBeInTheDocument();
  });

  it("creates a draft and moves to its page; server field errors inline", async () => {
    const { user } = await signIn(PLATFORM_ADMIN, "/platform/help-articles/new");
    await user.type(await screen.findByLabelText("Address"), "add-a-child");
    await user.click(screen.getByRole("tab", { name: /^English/ }));
    await user.type(screen.getByLabelText("Title (English)"), "Duplicate");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Please fix these before saving")).toBeInTheDocument();
    expect(screen.getByLabelText("Address")).toHaveAccessibleDescription(
      /already uses this address/,
    );
    await user.clear(screen.getByLabelText("Address"));
    await user.type(screen.getByLabelText("Address"), "night-shift");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Edit article" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Address")).toHaveValue("night-shift");
  });
});
