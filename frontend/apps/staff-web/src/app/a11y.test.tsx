import { MOCK_PASSWORD, MOCK_TOTP_CODE } from "@medilink/api-client/mocks";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../test/render";

/** Contract check F5: axe on key pages, zero violations (colour contrast is covered by tokens.test.ts). */

describe("accessibility (axe)", () => {
  it("login page, also with errors shown", async () => {
    const { container, user } = renderApp("/login");
    await screen.findByRole("heading", { level: 1, name: "Log in to MediLink" });
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: "Log in" }));
    await screen.findByRole("alert");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("login page in Kinyarwanda", async () => {
    const { container } = renderApp("/login", { language: "rw" });
    await screen.findByRole("heading", { level: 1, name: "Injira muri MediLink" });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("MFA verify page (code and recovery modes)", async () => {
    const { container, user } = renderApp("/login");
    await logIn(user, "doctor@medilink.test", MOCK_PASSWORD);
    await screen.findByRole("heading", { level: 1, name: "Enter your login code" });
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: "Use a recovery code instead" }));
    await screen.findByRole("heading", { level: 1, name: "Use a recovery code" });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("MFA setup page and recovery codes", async () => {
    const { container, user } = renderApp("/login");
    await logIn(user, "new.staff@medilink.test", MOCK_PASSWORD);
    await screen.findByRole("img", { name: /QR code/ });
    expect(await axe(container)).toHaveNoViolations();

    await user.type(screen.getByLabelText("6-digit code"), MOCK_TOTP_CODE);
    await user.click(screen.getByRole("button", { name: "Confirm and continue" }));
    await screen.findByRole("heading", { level: 1, name: "Save your recovery codes" });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("facility picker and app shell", async () => {
    const { container, user } = renderApp("/login");
    await logIn(user, "doctor@medilink.test", MOCK_PASSWORD);
    await user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
    await user.click(screen.getByRole("button", { name: "Verify and log in" }));
    await screen.findByRole("heading", { level: 1, name: "Choose your facility" });
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: "Work at Kigali Clinic" }));
    await screen.findByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("404 page", async () => {
    const { container } = renderApp("/nowhere");
    await screen.findByRole("heading", { level: 1, name: "Page not found" });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("keyboard (F5)", () => {
  it("skip link is the first focusable element and targets <main>", async () => {
    const { user } = renderApp("/login");
    await screen.findByRole("heading", { level: 1, name: "Log in to MediLink" });
    await user.tab();
    const skip = screen.getByRole("link", { name: "Skip to main content" });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute("href", "#main-content");
    expect(document.getElementById("main-content")).toHaveAttribute("tabindex", "-1");
  });

  it("login can be completed with the keyboard only", async () => {
    const { user } = renderApp("/login");
    await screen.findByRole("heading", { level: 1, name: "Log in to MediLink" });
    await user.tab(); // skip link
    await user.tab(); // language
    await user.tab(); // email
    expect(screen.getByLabelText("Email")).toHaveFocus();
    await user.keyboard("doctor@medilink.test");
    await user.tab(); // password
    expect(screen.getByLabelText("Password")).toHaveFocus();
    await user.keyboard(MOCK_PASSWORD);
    await user.keyboard("{Enter}");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Enter your login code" }),
    ).toBeInTheDocument();
  });
});
