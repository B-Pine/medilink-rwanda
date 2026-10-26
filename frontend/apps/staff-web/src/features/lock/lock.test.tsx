import { ApiError } from "@medilink/api-client";
import { MOCK_PASSWORD, MOCK_PIN, MOCK_TOTP_CODE } from "@medilink/api-client/mocks";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { AppProviders, createServices } from "../../app/services";
import { logIn, renderApp } from "../../test/render";
import { useStepUp } from "./StepUp";

/** S1-F10 (idle lock) and S1-F11 (step-up, PIN settings) against the contract mocks. */

async function signInAsReception() {
  const app = renderApp("/today");
  await logIn(app.user, "reception@medilink.test", MOCK_PASSWORD);
  await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
  await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  await screen.findByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ });
  return app;
}

async function lockFromMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Account menu/ }));
  await user.click(await screen.findByRole("menuitem", { name: "Lock screen" }));
}

describe("idle lock", () => {
  it("locks from the menu, hides the shell, and unlocks with the password", async () => {
    const { user, container } = await signInAsReception();
    await lockFromMenu(user);
    const dialog = await screen.findByRole("dialog", { name: "Screen locked" });
    expect(dialog).toHaveTextContent("Signed in as Habimana Eric");
    const shell = container.querySelector("[inert]");
    expect(shell).toHaveAttribute("aria-hidden", "true");
    expect(await axe(dialog)).toHaveNoViolations();

    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByText("That password is not correct.")).toBeInTheDocument();
    expect(screen.getByText("4 attempts left before you are signed out.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Password"), MOCK_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Screen locked" })).not.toBeInTheDocument(),
    );
    expect(container.querySelector("[inert]")).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ }),
    ).toBeInTheDocument();
  });

  it("sets a PIN on the security page and unlocks with it", async () => {
    const { user, router } = await signInAsReception();
    await act(() => router.navigate("/account/security"));
    await screen.findByRole("heading", { level: 1, name: "Security" });
    await user.type(screen.getByLabelText("PIN"), "1234");
    await user.click(screen.getByRole("button", { name: "Set PIN" }));
    expect(await screen.findByText(/too easy to guess/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("PIN"));
    await user.type(screen.getByLabelText("PIN"), MOCK_PIN);
    await user.click(screen.getByRole("button", { name: "Set PIN" }));
    expect(await screen.findByText("Your PIN is saved.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Lock now" }));
    await screen.findByRole("dialog", { name: "Screen locked" });
    await user.type(await screen.findByLabelText("PIN"), MOCK_PIN);
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Screen locked" })).not.toBeInTheDocument(),
    );
  });

  it("five wrong unlocks end the session and go to the login page", async () => {
    const { user, router } = await signInAsReception();
    await lockFromMenu(user);
    for (let i = 0; i < 5; i += 1) {
      await user.type(await screen.findByLabelText("Password"), "nope");
      await user.click(screen.getByRole("button", { name: "Unlock" }));
      if (i < 4) await screen.findByText("That password is not correct.");
    }
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });

  it("switch user signs out", async () => {
    const { user, router } = await signInAsReception();
    await lockFromMenu(user);
    await user.click(await screen.findByRole("button", { name: "Not you? Switch user" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });

  it("a reload while locked renders only the lock screen", async () => {
    const services = createServices({ language: "en", persistLanguage: false });
    await services.api.staffAuth.login({
      email: "reception@medilink.test",
      password: MOCK_PASSWORD,
    });
    await services.api.staffAuth.mfaVerify({ code: MOCK_TOTP_CODE });
    await services.api.security.lock();
    const app = renderApp("/today");
    expect(await screen.findByRole("dialog", { name: "Screen locked" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ }),
    ).not.toBeInTheDocument();
    await app.user.type(screen.getByLabelText("Password"), MOCK_PASSWORD);
    await app.user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ }),
    ).toBeInTheDocument();
  });

  it("warns 60 seconds before locking and 'Stay signed in' resets the timer", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { user } = await signInAsReception();
      await act(() => vi.advanceTimersByTimeAsync(841_000));
      const warning = await screen.findByRole("dialog", { name: "Are you still there?" });
      expect(warning).toHaveTextContent("60 seconds");
      await user.click(screen.getByRole("button", { name: "Stay signed in" }));
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Are you still there?" }),
        ).not.toBeInTheDocument(),
      );
      await act(() => vi.advanceTimersByTimeAsync(901_000));
      expect(await screen.findByRole("dialog", { name: "Screen locked" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("step-up", () => {
  function Harness({ action }: { action: () => Promise<string> }) {
    const { withStepUp } = useStepUp();
    return (
      <button
        type="button"
        onClick={() =>
          void withStepUp(action).then(
            (r) => (document.title = r),
            () => (document.title = "cancelled"),
          )
        }
      >
        Approve
      </button>
    );
  }

  it("opens the dialog on 403 step_up_required and retries the action once", async () => {
    const services = createServices({ language: "en", persistLanguage: false });
    await services.api.staffAuth.login({ email: "admin@medilink.test", password: MOCK_PASSWORD });
    await services.api.staffAuth.mfaVerify({ code: MOCK_TOTP_CODE });
    const action = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(
        new ApiError({ status: 403, code: "step_up_required", message: "Confirm" }),
      )
      .mockResolvedValueOnce("approved");
    const user = userEvent.setup();
    render(
      <AppProviders services={services}>
        <Harness action={action} />
      </AppProviders>,
    );
    await user.click(screen.getByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog", { name: "Confirm it's you" });
    expect(await axe(dialog)).toHaveNoViolations();
    await user.type(screen.getByLabelText("Password"), MOCK_PASSWORD);
    await user.type(screen.getByLabelText("Authenticator code"), MOCK_TOTP_CODE);
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(document.title).toBe("approved"));
  });

  it("cancel leaves the action undone", async () => {
    const services = createServices({ language: "en", persistLanguage: false });
    const action = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(
        new ApiError({ status: 403, code: "step_up_required", message: "Confirm" }),
      );
    const user = userEvent.setup();
    render(
      <AppProviders services={services}>
        <Harness action={action} />
      </AppProviders>,
    );
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await screen.findByRole("dialog", { name: "Confirm it's you" });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(action).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.title).toBe("cancelled"));
  });
});
