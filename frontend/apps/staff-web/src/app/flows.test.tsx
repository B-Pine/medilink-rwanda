import { MOCK_PASSWORD, MOCK_RECOVERY_CODE, MOCK_TOTP_CODE } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { logIn, renderApp } from "../test/render";
import { mockApi } from "../test/setup";

/** Staff flows end-to-end against the contract mocks: login → MFA → facility → shell. */

describe("staff login → MFA verify → facility picker → shell", () => {
  it("multi-facility doctor picks a facility and lands on Today", async () => {
    const { user, router } = renderApp("/today");

    // Route guard: no session → login, remembering the requested page.
    expect(
      await screen.findByRole("heading", { level: 1, name: "Log in to MediLink" }),
    ).toBeInTheDocument();
    await logIn(user, "doctor@medilink.test", MOCK_PASSWORD);

    // Second factor: one input that accepts a pasted code with a space.
    const code = await screen.findByLabelText("6-digit code");
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
    expect(code).toHaveAttribute("inputmode", "numeric");
    await user.click(code);
    await user.paste("123 456");
    await user.click(screen.getByRole("button", { name: "Verify and log in" }));

    // Three memberships → facility picker.
    expect(
      await screen.findByRole("heading", { level: 1, name: "Choose your facility" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/select-facility");
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Work at Remera Health Center" }));

    // Shell: Today with the facility, roles, and a sidebar filtered by permissions.
    expect(await screen.findByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/today");
    expect(screen.getByText("You are working at Remera Health Center.")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main menu" });
    for (const name of [
      "Today",
      "Queue",
      "Patients",
      "Approvals",
      "Reports",
      "Staff",
      "Settings",
      "Audit log",
    ]) {
      expect(within(nav).getByRole("link", { name })).toBeInTheDocument();
    }
    expect(within(nav).queryByRole("link", { name: "Pharmacy" })).not.toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Today" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("status", { name: "Connection" })).toHaveTextContent("Online");
  });

  it("switches facility from the top bar and reloads permissions", async () => {
    const { user } = renderApp("/login");
    await logIn(user, "doctor@medilink.test", MOCK_PASSWORD);
    await user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
    await user.click(screen.getByRole("button", { name: "Verify and log in" }));
    await user.click(await screen.findByRole("button", { name: "Work at Remera Health Center" }));
    await screen.findByRole("heading", { level: 1, name: "Today" });

    const switcher = screen.getByRole("button", { name: /Current facility: Remera Health Center/ });
    switcher.focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("menuitemradio", { name: /Kigali Clinic/ }));

    expect(await screen.findByText("You are working at Kigali Clinic.")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main menu" });
    await waitFor(() =>
      expect(within(nav).queryByRole("link", { name: "Approvals" })).not.toBeInTheDocument(),
    );
    expect(within(nav).getByRole("link", { name: "Queue" })).toBeInTheDocument();
  });

  it("single-facility receptionist: recovery code, straight to Today, no pharmacy access", async () => {
    const { user } = renderApp("/login");
    await logIn(user, "reception@medilink.test", MOCK_PASSWORD);

    await user.click(await screen.findByRole("button", { name: "Use a recovery code instead" }));
    const recovery = await screen.findByLabelText("Recovery code");
    await waitFor(() => expect(recovery).toHaveFocus());
    await user.type(recovery, MOCK_RECOVERY_CODE);
    await user.click(screen.getByRole("button", { name: "Verify and log in" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument();
    expect(screen.getByText("You are working at Kigali Clinic.")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main menu" });
    expect(within(nav).getByRole("link", { name: "Payments" })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Pharmacy" })).not.toBeInTheDocument();
    // No facility switcher for a single membership.
    expect(screen.queryByRole("button", { name: /Current facility/ })).not.toBeInTheDocument();
  });

  it("hides sections the role cannot use (404 inside the shell)", async () => {
    const { user, router } = renderApp("/login");
    await logIn(user, "reception@medilink.test", MOCK_PASSWORD);
    await user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
    await user.click(screen.getByRole("button", { name: "Verify and log in" }));
    await screen.findByRole("heading", { level: 1, name: "Today" });

    await router.navigate("/pharmacy");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeInTheDocument();
    await router.navigate("/queue");
    expect(await screen.findByRole("heading", { level: 1, name: "Queue" })).toBeInTheDocument();
  });
});

describe("staff first login → MFA setup", () => {
  it("shows QR + key, rejects a wrong code, shows 10 recovery codes, requires confirmation", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const { user, router } = renderApp("/login");
    await logIn(user, "new.staff@medilink.test", MOCK_PASSWORD);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Set up two-step login" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("img", { name: /QR code to add your MediLink account/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^([A-Z2-7]{4} ){7}[A-Z2-7]{4}$/)).toBeInTheDocument();

    const code = screen.getByLabelText("6-digit code");
    await user.type(code, "000000");
    await user.click(screen.getByRole("button", { name: "Confirm and continue" }));
    const summary = await screen.findByRole("alert");
    await waitFor(() => expect(summary).toHaveFocus());
    expect(code).toHaveAttribute("aria-invalid", "true");
    expect(code).toHaveValue("000000"); // values kept after errors

    await user.clear(code);
    await user.type(code, MOCK_TOTP_CODE);
    await user.click(screen.getByRole("button", { name: "Confirm and continue" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Save your recovery codes" }),
    ).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(10);
    await user.click(screen.getByRole("button", { name: "Print codes" }));
    expect(print).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Copy codes" }));
    expect(await screen.findByText("Recovery codes copied")).toBeInTheDocument();

    // "I saved them" is required.
    await user.click(screen.getByRole("button", { name: "Continue to MediLink" }));
    expect(
      await screen.findByRole("link", { name: "Confirm that you saved your recovery codes" }),
    ).toBeInTheDocument();
    await user.click(screen.getByLabelText("I have saved my recovery codes in a safe place"));
    await user.click(screen.getByRole("button", { name: "Continue to MediLink" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/today");
    print.mockRestore();
  });
});

describe("login form behaviour (F4)", () => {
  it("empty submit: focused error summary linked to inline errors", async () => {
    const { user } = renderApp("/login");
    await user.click(await screen.findByRole("button", { name: "Log in" }));

    const summary = await screen.findByRole("alert");
    await waitFor(() => expect(summary).toHaveFocus());
    expect(
      within(summary).getByRole("heading", { name: "There is a problem" }),
    ).toBeInTheDocument();
    const emailLink = within(summary).getByRole("link", { name: "Enter your email address" });
    expect(emailLink).toHaveAttribute("href", "#login-email");

    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute("aria-describedby", "login-email-error");
    expect(email).toHaveAccessibleDescription("Error: Enter your email address");
    expect(email).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");

    await user.click(emailLink);
    expect(email).toHaveFocus();
  });

  it("wrong password: generic error, values kept, paste allowed", async () => {
    const { user } = renderApp("/login");
    const email = await screen.findByLabelText("Email");
    await user.type(email, "doctor@medilink.test");
    const password = screen.getByLabelText("Password");
    await user.click(password);
    await user.paste("not-the-password");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("The email or password is not right.");
    await waitFor(() => expect(summary).toHaveFocus());
    expect(email).toHaveValue("doctor@medilink.test");
    expect(password).toHaveValue("not-the-password");
  });

  it("too many attempts: rate-limit message with the wait time", async () => {
    const { user } = renderApp("/login");
    await logIn(user, "ratelimited@medilink.test", "whatever-password");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many attempts. Wait 60 seconds",
    );
  });

  it("server validation errors (validation_error.fields) land on the fields", async () => {
    mockApi.server.use(
      http.post("*/api/v1/staff/auth/login/", () =>
        HttpResponse.json(
          {
            error: {
              code: "validation_error",
              message: "Some fields need attention.",
              fields: { email: ["This email is not allowed here."] },
              request_id: "req-1",
            },
          },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderApp("/login");
    await logIn(user, "someone@example.rw", "a-password");
    const summary = await screen.findByRole("alert");
    expect(
      within(summary).getByRole("link", { name: "This email is not allowed here." }),
    ).toHaveAttribute("href", "#login-email");
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription(
      "Error: This email is not allowed here.",
    );
  });
});

describe("shell: user menu, language, theme, logout", () => {
  async function signIn() {
    const app = renderApp("/login");
    await logIn(app.user, "pharmacist@medilink.test", MOCK_PASSWORD);
    await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
    await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
    await screen.findByRole("heading", { level: 1, name: "Today" });
    return app;
  }

  async function openUserMenu(
    user: Awaited<ReturnType<typeof signIn>>["user"],
    name = /Account menu/,
  ) {
    const trigger = screen.getByRole("button", { name });
    trigger.focus();
    await user.keyboard("{Enter}");
    return screen.findByRole("menu");
  }

  it("changes language (html lang follows) and theme from the user menu", async () => {
    const { user } = await signIn();
    let menu = await openUserMenu(user);
    await user.click(within(menu).getByRole("menuitemradio", { name: "Français" }));
    expect(document.documentElement.lang).toBe("fr");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Aujourd’hui" }),
    ).toBeInTheDocument();

    menu = await openUserMenu(user, /Menu du compte/);
    await user.click(within(menu).getByRole("menuitemradio", { name: "Sombre" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("logs out and returns to login; the session is gone", async () => {
    const { user, services } = await signIn();
    const menu = await openUserMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: "Log out" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Log in to MediLink" }),
    ).toBeInTheDocument();
    await expect(services.api.staffAuth.me()).rejects.toMatchObject({ status: 401 });
  });
});

describe("other pages", () => {
  it("unknown address → 404 page", async () => {
    renderApp("/does-not-exist");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Today" })).toHaveAttribute("href", "/today");
  });

  it("MFA pages without a pending login go back to login", async () => {
    renderApp("/login/mfa/verify");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Log in to MediLink" }),
    ).toBeInTheDocument();
  });

  it("defaults to Kinyarwanda and switches language on the login page", async () => {
    const { user } = renderApp("/login", { language: "rw" });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Injira muri MediLink" }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("rw");
    await user.selectOptions(screen.getByLabelText("Ururimi"), "en");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Log in to MediLink" }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });

  it("password reset request always confirms", async () => {
    const { user } = renderApp("/forgot-password");
    await user.type(await screen.findByLabelText("Email"), "unknown@example.rw");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Check your email" }),
    ).toBeInTheDocument();
  });
});
