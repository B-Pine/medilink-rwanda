import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderApp } from "../test/render";

/** Contract check F5: axe on landing, login and sign-up (both steps), zero violations. */

describe("accessibility (axe)", () => {
  it("landing page", async () => {
    const { container } = renderApp("/");
    await screen.findByRole("heading", {
      level: 1,
      name: "Find the right care, without the long wait.",
    });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("landing page in Kinyarwanda", async () => {
    const { container } = renderApp("/", { language: "rw" });
    await screen.findByRole("heading", {
      level: 1,
      name: "Bona ubuvuzi bukwiye, udategereje igihe kirekire.",
    });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("login: email step, password step, with errors", async () => {
    const { container, user } = renderApp("/login");
    await screen.findByRole("heading", { level: 1, name: "Log in or create an account" });
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("alert");
    expect(await axe(container)).toHaveNoViolations();

    await user.type(screen.getByLabelText("Email"), "patient@medilink.test");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { level: 1, name: "Enter your password" });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("sign-up: details and consent steps", async () => {
    const { container, user } = renderApp("/signup");
    await screen.findByRole("heading", { level: 1, name: "Create your account" });
    expect(await axe(container)).toHaveNoViolations();

    await user.type(screen.getByLabelText("Your names"), "Uwera Diane");
    await user.type(screen.getByLabelText("Email"), "diane@example.rw");
    await user.type(screen.getByLabelText("Password"), "a-long-passphrase-2026");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { level: 1, name: "Your privacy and consent" });
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByRole("alert");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("patient home", async () => {
    const { container, user } = renderApp("/login");
    await user.type(await screen.findByLabelText("Email"), "patient@medilink.test");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(await screen.findByLabelText("Password"), "MediLink-demo-2026");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    await screen.findByRole("heading", {
      level: 1,
      name: /^Good (morning|afternoon|evening), Mukamana Jeanne$/,
    });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("keyboard (F5)", () => {
  it("skip link first, then the header controls", async () => {
    const { user } = renderApp("/");
    await screen.findByRole("heading", {
      level: 1,
      name: "Find the right care, without the long wait.",
    });
    await user.tab();
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveFocus();
    // the emergency strip comes before the header: calling 912 is the first stop
    await user.tab();
    expect(screen.getAllByRole("link", { name: "Call 912" })[0]).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Emergency guide" })).toHaveFocus();
    await user.tab();
    expect(screen.getAllByRole("link", { name: "MediLink Rwanda home" })[0]).toHaveFocus();
  });
});
