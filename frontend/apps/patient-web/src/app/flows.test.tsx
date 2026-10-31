import { MOCK_PASSWORD } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderApp } from "../test/render";

/** Patient flows against the contract mocks: landing, email-first login, sign-up with consent. */

describe("landing page", () => {
  it("has one h1, the search form, how it works, facilities band, emergency notice, footer", async () => {
    const { user } = renderApp("/");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Know before you go." }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);

    const search = screen.getByRole("form", { name: "Find care" });
    expect(within(search).getByLabelText("What do you need?")).toBeInTheDocument();
    expect(within(search).getByLabelText("Where?")).toBeInTheDocument();
    expect(within(search).getByLabelText("Your insurance")).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 2, name: "How it works" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "For health facilities" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/call 912/)).toBeInTheDocument();
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Verify a document" })).toHaveAttribute(
      "href",
      "/verify",
    );
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");

    // A popular chip fills the service; Search opens the results page (S5a).
    await user.click(screen.getByRole("button", { name: "Pediatrics" }));
    expect(within(search).getByLabelText("What do you need?")).toHaveValue("pediatrics");
    await user.click(within(search).getByRole("button", { name: "Search" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Find a facility" }),
    ).toBeInTheDocument();
  });

  it("is in Kinyarwanda by default and the language switch updates <html lang>", async () => {
    const { user } = renderApp("/", { language: "rw" });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Menya mbere yo kugenda." }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("rw");
    await user.selectOptions(screen.getAllByLabelText("Ururimi")[0]!, "fr");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Sachez avant de partir." }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("fr");
  });
});

describe("email-first login", () => {
  it("email → password → home → logout", async () => {
    const { user, router } = renderApp("/login");
    const email = await screen.findByLabelText("Email");
    expect(email).toHaveAttribute("autocomplete", "username");
    await user.type(email, "patient@medilink.test");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Enter your password" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Logging in as patient@medilink.test")).toBeInTheDocument();
    const password = screen.getByLabelText("Password");
    await waitFor(() => expect(password).toHaveFocus());
    expect(password).toHaveAttribute("autocomplete", "current-password");
    await user.paste(MOCK_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: /^Good (morning|afternoon|evening), Mukamana Jeanne$/,
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/home");
    expect(screen.getByText("Confirm your email")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Account menu for/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Log out" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Log in or create an account" }),
    ).toBeInTheDocument();
  });

  it("wrong password keeps the values and shows a generic, focused error", async () => {
    const { user } = renderApp("/login");
    await user.type(await screen.findByLabelText("Email"), "patient@medilink.test");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const password = await screen.findByLabelText("Password");
    await user.type(password, "wrong-password-123");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("The email or password is not right.");
    await waitFor(() => expect(summary).toHaveFocus());
    expect(password).toHaveValue("wrong-password-123");
  });

  it("invalid email: inline error linked with aria-describedby and a focused summary", async () => {
    const { user } = renderApp("/login");
    const email = await screen.findByLabelText("Email");
    await user.type(email, "not-an-email");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const summary = await screen.findByRole("alert");
    await waitFor(() => expect(summary).toHaveFocus());
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription(/Enter an email address in the correct format/);
    expect(email).toHaveValue("not-an-email");
  });

  it("protected home redirects to login", async () => {
    renderApp("/home");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Log in or create an account" }),
    ).toBeInTheDocument();
  });
});

describe("sign-up with consent", () => {
  it("carries the email from login, requires terms + privacy, research optional and unticked", async () => {
    const { user, router } = renderApp("/login");
    await user.type(await screen.findByLabelText("Email"), "diane@example.rw");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(
      await screen.findByRole("link", { name: "Create an account with this email" }),
    );

    expect(
      await screen.findByRole("heading", { level: 1, name: "Create your account" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("diane@example.rw");

    // Step 1 validation: names and a 15+ character password.
    await user.click(screen.getByRole("button", { name: "Continue" }));
    let summary = await screen.findByRole("alert");
    expect(within(summary).getByRole("link", { name: "Enter your names" })).toBeInTheDocument();
    expect(
      within(summary).getByRole("link", { name: "Use at least 15 characters" }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Your names"), "Uwera Diane");
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByText("At least 15 characters")).toHaveTextContent("not yet");
    await user.type(password, "a-long-passphrase-2026");
    expect(screen.getByText("At least 15 characters")).toHaveTextContent("done");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    // Step 2: consent.
    expect(
      await screen.findByRole("heading", { level: 1, name: "Your privacy and consent" }),
    ).toBeInTheDocument();
    const research = screen.getByLabelText(/anonymised data may be used for health research/);
    expect(research).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Create account" }));
    summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("Accept the terms of use to create an account");
    expect(summary).toHaveTextContent("Accept the privacy notice to create an account");

    await user.click(screen.getByLabelText("I accept the terms of use"));
    await user.click(screen.getByLabelText(/I have read the privacy notice/));
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: /^Good (morning|afternoon|evening), Uwera Diane$/,
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/home");
  });

  it("server errors on step-1 fields send the user back to step 1 with values kept", async () => {
    const { user } = renderApp("/signup");
    await user.type(await screen.findByLabelText("Your names"), "Mukamana Jeanne");
    await user.type(screen.getByLabelText("Email"), "patient@medilink.test"); // already registered
    await user.type(screen.getByLabelText("Password"), "another-long-passphrase");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByLabelText("I accept the terms of use"));
    await user.click(screen.getByLabelText(/I have read the privacy notice/));
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Create your account" }),
    ).toBeInTheDocument();
    const email = screen.getByLabelText("Email");
    expect(email).toHaveValue("patient@medilink.test");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Check this email address or log in instead.",
    );
  });
});

describe("other pages", () => {
  it("verify-a-document placeholder and 404", async () => {
    renderApp("/verify");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Verify a document" }),
    ).toBeInTheDocument();
  });

  it("unknown address → 404", async () => {
    renderApp("/nope");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeInTheDocument();
  });

  it("forgot password always confirms", async () => {
    const { user } = renderApp("/forgot-password");
    await user.type(await screen.findByLabelText("Email"), "someone@example.rw");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Check your email" }),
    ).toBeInTheDocument();
  });

  it("nothing sensitive is written to browser storage during login", async () => {
    const { user } = renderApp("/login");
    await user.type(await screen.findByLabelText("Email"), "patient@medilink.test");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(await screen.findByLabelText("Password"), MOCK_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Log in" }));
    await screen.findByRole("heading", {
      level: 1,
      name: /^Good (morning|afternoon|evening), Mukamana Jeanne$/,
    });
    const keys = Object.keys(window.localStorage);
    expect(keys.every((key) => ["medilink.theme", "medilink.language"].includes(key))).toBe(true);
    expect(window.sessionStorage.length).toBe(0);
    const values = keys.map((key) => window.localStorage.getItem(key) ?? "").join(" ");
    expect(values).not.toMatch(/csrf|token|session|patient@/i);
  });
});
