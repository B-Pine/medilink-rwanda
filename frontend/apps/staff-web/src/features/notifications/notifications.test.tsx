import {
  emitMockNotification,
  MOCK_FACILITY_ADMIN_EMAIL,
  MOCK_PASSWORD,
  MOCK_TOTP_CODE,
} from "@medilink/api-client/mocks";
import { act, renderHook, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../../test/render";
import { POLL_MS, useCountPollInterval } from "./live";

/** S9-F1..F4, F11 (staff-web `notifications`) against the contract mocks. */

async function signIn(email = "reception@medilink.test", path = "/today") {
  const app = renderApp(path);
  await logIn(app.user, email, MOCK_PASSWORD);
  await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
  await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  return app;
}

const bell = (name: RegExp | string = /^Notifications, /) => screen.findByRole("button", { name });

describe("notification bell (S9-F1)", () => {
  it("shows the unread count in its name, the latest items, mark all read and see all", async () => {
    const { user, router } = await signIn(MOCK_FACILITY_ADMIN_EMAIL);
    const trigger = await bell("Notifications, 3 unread");
    expect(within(trigger).getByText("3")).toHaveAttribute("aria-hidden", "true");
    await user.click(trigger);
    const menu = await screen.findByRole("menu");
    expect(
      await within(menu).findByText("New sign-in to your MediLink account"),
    ).toBeInTheDocument();
    expect(within(menu).getByText("Planned maintenance on Sunday night")).toBeInTheDocument();
    expect(within(menu).getAllByText(/^Unread:/).length).toBe(3);
    // Radix portals the menu outside the landmarks; check the menu itself.
    expect(await axe(menu, { rules: { region: { enabled: false } } })).toHaveNoViolations();

    await user.click(within(menu).getByRole("menuitem", { name: "Mark all as read" }));
    await waitFor(() =>
      expect(within(menu).getByRole("menuitem", { name: "Mark all as read" })).toHaveAttribute(
        "aria-disabled",
        "true",
      ),
    );
    await user.keyboard("{Escape}");
    await user.click(await bell("Notifications, none unread"));
    await user.click(await screen.findByRole("menuitem", { name: "See all notifications" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/notifications"));
  });

  it("is live: a new item updates the count, is announced politely, and shows 99+", async () => {
    await signIn();
    await bell("Notifications, 3 unread");
    // The socket is connected once the bell has mounted; give it a moment to open.
    await waitFor(() => expect(emitMockNotification({ audience: "staff" })).not.toBeNull());
    expect(await bell("Notifications, 4 unread")).toBeInTheDocument();
    const live = screen.getByText(/^(New notification|Another new notification)$/);
    expect(live).toHaveAttribute("aria-live", "polite");

    act(() => {
      for (let i = 0; i < 100; i += 1) emitMockNotification({ audience: "staff" });
    });
    const trigger = await bell("Notifications, 104 unread");
    expect(within(trigger).getByText("99+")).toBeInTheDocument();
  });

  it("counts other facilities' unread items", async () => {
    const { user } = await signIn("doctor@medilink.test", "/today");
    await user.click(await screen.findByRole("button", { name: /Kigali Clinic/ }));
    await user.click(await bell("Notifications, 3 unread"));
    expect(await screen.findByText("Other facilities: 2 unread")).toBeInTheDocument();
  });

  it("polls the count every 60 s while the socket is not live", () => {
    const { result } = renderHook(() => useCountPollInterval());
    expect(result.current).toBe(POLL_MS);
    expect(POLL_MS).toBe(60_000);
  });
});

describe("inbox and settings (S9-F2)", () => {
  it("All/Unread, mark one read, open the item", async () => {
    const { user, container, router } = await signIn(MOCK_FACILITY_ADMIN_EMAIL, "/notifications");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Notifications" }),
    ).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Notifications" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("tab", { name: "Unread (3)" }));
    await user.click(
      await screen.findByRole("button", {
        name: "Mark “New sign-in to your MediLink account” as read",
      }),
    );
    expect(await screen.findByRole("tab", { name: "Unread (2)" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "All" }));
    await user.click(
      await screen.findByRole("link", { name: "Planned maintenance on Sunday night" }),
    );
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/notifications\/.+/));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Planned maintenance on Sunday night" }),
    ).toBeInTheDocument();
    expect(await bell("Notifications, 1 unread")).toBeInTheDocument();
  });

  it("sound is off by default, has a test sound, and a version conflict keeps the input", async () => {
    const { user, services } = await signIn("reception@medilink.test", "/notifications/settings");
    const sound = await screen.findByRole("switch", {
      name: "Play a sound for new notifications",
    });
    expect(sound).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByRole("button", { name: "Play test sound" }));
    expect(await screen.findByText(/blocked the sound|Test sound played/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Approval requests")).not.toBeInTheDocument();

    // Another tab saves first.
    await services.api.notifications.staff.updatePreferences({
      version: 0,
      approvals_digest: "daily",
    });
    await user.click(sound);
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText("These settings changed somewhere else")).toBeInTheDocument();
    expect(sound).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: "Load the latest version" }));
    await waitFor(() =>
      expect(screen.queryByText("These settings changed somewhere else")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
    expect((await services.api.notifications.staff.preferences()).sound_enabled).toBe(true);
  });
});

describe("facility announcements (S9-F3)", () => {
  it("the nav item and pages need announcements.manage", async () => {
    await signIn("reception@medilink.test", "/announcements");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Announcements" })).not.toBeInTheDocument();
  });

  it("composer: audience, dates, priority, languages with counters, preview, errors, draft, publish, withdraw", async () => {
    const { user, container } = await signIn(MOCK_FACILITY_ADMIN_EMAIL, "/today");
    await user.click(await screen.findByRole("link", { name: "Announcements" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Announcements" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("table", { name: "Announcements" })).toBeInTheDocument();
    await user.click(screen.getAllByRole("link", { name: "New announcement" })[0]!);

    expect(
      await screen.findByRole("radio", { name: /Patients with visits on these dates/ }),
    ).toBeChecked();
    await user.type(screen.getByLabelText("From"), "2026-11-06");
    await user.type(screen.getByLabelText("To"), "2026-11-06");
    await user.click(screen.getByRole("radio", { name: /Important/ }));

    await user.click(screen.getByRole("tab", { name: /English/ }));
    await user.type(screen.getByLabelText("Title (English)"), "Pediatrics closed Friday");
    expect(screen.getByText("24 / 120")).toBeInTheDocument();
    await user.type(
      screen.getByLabelText("Message (English)"),
      "Free HIV testing moves to Monday.",
    );
    expect(await screen.findByText("Some languages are missing")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Ikinyarwanda.*not written/ })).toBeInTheDocument();

    // Preview in English
    await user.selectOptions(screen.getByLabelText("Preview in"), "en");
    const preview = screen.getByRole("complementary", { name: "Preview" });
    expect(within(preview).getByText("Pediatrics closed Friday")).toBeInTheDocument();

    // The server refuses clinical words: shown inline and in the summary.
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Please fix these before saving")).toBeInTheDocument();
    const body = screen.getByLabelText("Message (English)");
    expect(body).toHaveAccessibleDescription(/Clinical words are not allowed/);
    await user.clear(body);
    await user.type(body, "Children's visits move to Monday morning.");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Draft saved.")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: "Publish…" }));
    const confirm = screen.getByRole("group", { name: "Publish this announcement to patients?" });
    await user.click(within(confirm).getByRole("button", { name: "Publish now" }));
    expect(await screen.findByText(/^Published\. /)).toBeInTheDocument();
    expect(screen.getByLabelText("Title (English)")).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Withdraw…" }));
    await user.click(
      within(screen.getByRole("group", { name: "Withdraw this announcement?" })).getByRole(
        "button",
        { name: "Withdraw" },
      ),
    );
    expect(await screen.findByText(/^Withdrawn\. /)).toBeInTheDocument();
  });
});

describe("platform announcements (S9-F4)", () => {
  it("super admins write for all facilities; others get not found", async () => {
    const { user } = await signIn("admin@medilink.test", "/platform/announcements");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Platform announcements" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Platform announcements" })).toBeInTheDocument();
    await user.click(screen.getAllByRole("link", { name: "New announcement" })[0]!);
    expect(await screen.findByRole("radio", { name: /All facilities/ })).toBeChecked();
    await user.type(screen.getByLabelText("Title (Ikinyarwanda)"), "Igihe cyo kuvugurura");
    await user.type(screen.getByLabelText("Message (Ikinyarwanda)"), "Sisitemu izaba ifunze.");
    await user.click(screen.getByRole("button", { name: "Publish…" }));
    await user.click(
      within(
        screen.getByRole("group", { name: "Publish this announcement to every facility?" }),
      ).getByRole("button", { name: "Publish now" }),
    );
    await screen.findByText(/^Published\. /);
    expect(await screen.findByText(/^Sent to \d+ (person|people)\.$/)).toBeInTheDocument();
  });

  it("is not found for facility staff", async () => {
    await signIn(MOCK_FACILITY_ADMIN_EMAIL, "/platform/announcements");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeInTheDocument();
  });
});
