import {
  emitMockNotification,
  MOCK_PASSWORD,
  MOCK_VAPID_PUBLIC_KEY,
  setMockCriticalLocked,
  setMockPushEnabled,
} from "@medilink/api-client/mocks";
import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderApp } from "../../test/render";
import { createFakePushClient, setPushClient } from "./pushClient";

/** S9-F5..F8, F11 (patient-web `notifications`) against the contract mocks. */

async function signIn(next = "/home") {
  const app = renderApp("/login");
  await app.user.type(await screen.findByLabelText("Email"), "patient@medilink.test");
  await app.user.click(screen.getByRole("button", { name: "Continue" }));
  const password = await screen.findByLabelText("Password");
  await waitFor(() => expect(password).toHaveFocus());
  await app.user.paste(MOCK_PASSWORD);
  await app.user.click(screen.getByRole("button", { name: "Log in" }));
  await screen.findByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ });
  if (next !== "/home") await act(() => app.router.navigate(next));
  return app;
}

afterEach(() => setPushClient(null));

describe("bell and inbox (S9-F5)", () => {
  it("header bell with the count; 18 px cards with the About chip; mark all as read", async () => {
    const { user, container } = await signIn();
    const bell = await screen.findByRole("link", { name: "Notifications, 2 unread" });
    expect(bell).toHaveClass("min-h-target", "min-w-target");
    await user.click(bell);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Notifications" }),
    ).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Notifications" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(await within(list).findByText("About Keza")).toBeInTheDocument();
    expect(within(list).getAllByText("New")).toHaveLength(2);
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: "Mark all as read" }));
    expect(
      await screen.findByRole("link", { name: "Notifications, none unread" }),
    ).toBeInTheDocument();
    expect(screen.getByText("0 unread notifications.")).toBeInTheDocument();
  });

  it("updates live and announces new items politely", async () => {
    await signIn();
    await screen.findByRole("link", { name: "Notifications, 2 unread" });
    await waitFor(() => expect(emitMockNotification({ audience: "patient" })).not.toBeNull());
    expect(
      await screen.findByRole("link", { name: "Notifications, 3 unread" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("New notification. 3 unread.")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  it("the detail page marks the item read", async () => {
    const { user } = await signIn("/notifications");
    const list = await screen.findByRole("list", { name: "Notifications" });
    await user.click(within(list).getAllByRole("link")[0]!);
    // wait for the detail page itself, not the inbox heading still on screen
    expect(
      await screen.findByRole("heading", { level: 1, name: /New sign-in|Hari uwinjiye/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "Notifications, 1 unread" }),
    ).toBeInTheDocument();
  });
});

describe("settings (S9-F6)", () => {
  it("language, channel grid (in-app always on), quiet hours 21:00–06:00, family toggles", async () => {
    const { user, container, services } = await signIn("/notifications/settings");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Notification settings" }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText("Language of notifications")).toHaveValue("rw");
    const inApp = screen.getByRole("checkbox", { name: /^Urgent: In MediLink/ });
    expect(inApp).toBeChecked();
    expect(inApp).toBeDisabled();
    const routineEmail = screen.getByRole("checkbox", { name: "Other updates: Email" });
    await user.click(routineEmail);
    expect(routineEmail).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "No alerts or emails at night" })).toBeChecked();
    expect(screen.getByLabelText("From")).toHaveValue("21:00");
    expect(screen.getByLabelText("Until")).toHaveValue("06:00");
    await user.click(screen.getByRole("switch", { name: "Alerts about Keza" }));
    expect(screen.getByText("No browser gets alerts yet.")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
    const saved = await services.api.notifications.patient.preferences();
    expect(saved.channels.routine).toEqual(["web_push"]);
    expect(saved.dependents.find((d) => d.display_name === "Keza")?.receive_alerts).toBe(false);
  });

  it("explains a locked critical level", async () => {
    setMockCriticalLocked(true);
    await signIn("/notifications/settings");
    expect(await screen.findByText("Urgent alerts stay on for now")).toBeInTheDocument();
  });

  it("a version conflict keeps the input", async () => {
    const { user, services } = await signIn("/notifications/settings");
    const quiet = await screen.findByRole("switch", { name: "No alerts or emails at night" });
    await services.api.notifications.patient.updatePreferences({ version: 0 });
    await user.click(quiet);
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText("Your settings changed somewhere else")).toBeInTheDocument();
    expect(quiet).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Load the latest version" }));
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
  });
});

describe("push opt-in (S9-F7)", () => {
  it("asks only on the button press, reason first; turn on, list the browser, turn off", async () => {
    const fake = createFakePushClient();
    setPushClient(fake);
    const { user } = await signIn("/notifications/settings");
    expect(await screen.findByText("Get alerts when it matters")).toBeInTheDocument();
    expect(fake.prompts).toBe(0);
    await user.click(screen.getByRole("button", { name: "Turn on alerts" }));
    expect(await screen.findByText("Alerts are on for this browser")).toBeInTheDocument();
    expect(fake.prompts).toBe(1);
    const browsers = await screen.findByRole("list", { name: "Browsers that get alerts" });
    expect(within(browsers).getAllByRole("listitem")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Turn off alerts here" }));
    expect(await screen.findByText("Get alerts when it matters")).toBeInTheDocument();
    expect(await screen.findByText("No browser gets alerts yet.")).toBeInTheDocument();
    expect(await fake.current()).toBeNull();
  });

  it("denied, unsupported and iOS-not-installed states", async () => {
    setPushClient(createFakePushClient({ grant: "denied" }));
    const { user, unmount } = await signIn("/notifications/settings");
    await user.click(await screen.findByRole("button", { name: "Turn on alerts" }));
    expect(await screen.findByText("Alerts are blocked for this site")).toBeInTheDocument();
    unmount();

    setPushClient(createFakePushClient({ support: "unsupported" }));
    const second = await signIn("/notifications/settings");
    expect(await screen.findByText("This browser can't show alerts")).toBeInTheDocument();
    second.unmount();

    setPushClient(createFakePushClient({ support: "ios-not-installed" }));
    await signIn("/notifications/settings");
    expect(
      await screen.findByText("On iPhone, add MediLink to your Home Screen first"),
    ).toBeInTheDocument();
    expect(screen.getByText("Choose “Add to Home Screen”.")).toBeInTheDocument();
  });

  it("is hidden when the server has push off", async () => {
    setMockPushEnabled(false);
    setPushClient(createFakePushClient());
    await signIn("/notifications/settings");
    expect(await screen.findByText("Browsers that get alerts")).toBeInTheDocument();
    expect(screen.queryByText("Alerts on this browser")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Turn on alerts" })).not.toBeInTheDocument();
  });

  it("re-syncs the subscription on start when permission is granted", async () => {
    const fake = createFakePushClient({ permission: "granted" });
    await fake.subscribe(MOCK_VAPID_PUBLIC_KEY);
    setPushClient(fake);
    const { services } = await signIn();
    await waitFor(async () =>
      expect(await services.api.notifications.patient.pushSubscriptions()).toHaveLength(1),
    );
  });
});

describe("push-off banner (S9-F8)", () => {
  it("shows on Home and the inbox while push is off; Not now hides it for 7 days", async () => {
    setPushClient(createFakePushClient());
    const { user, unmount } = await signIn();
    const banner = await screen.findByRole("region", {
      name: "Turn on alerts so we can tell you when to leave",
    });
    await user.click(within(banner).getByRole("button", { name: "Not now" }));
    expect(
      screen.queryByRole("region", { name: "Turn on alerts so we can tell you when to leave" }),
    ).not.toBeInTheDocument();
    unmount();

    // A new page load within 7 days: still dismissed (also on the inbox).
    await signIn("/notifications");
    await screen.findByRole("list", { name: "Notifications" });
    expect(
      screen.queryByRole("region", { name: "Turn on alerts so we can tell you when to leave" }),
    ).not.toBeInTheDocument();
  });

  it("is not shown where push can't work", async () => {
    setPushClient(createFakePushClient({ support: "unsupported" }));
    await signIn("/notifications");
    await screen.findByRole("list", { name: "Notifications" });
    expect(
      screen.queryByRole("region", { name: "Turn on alerts so we can tell you when to leave" }),
    ).not.toBeInTheDocument();
  });
});
