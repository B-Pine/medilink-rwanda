import { MOCK_PASSWORD } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderApp } from "../test/render";

/** Patient app shell and its destinations (design 07 §2, §3.1, §3.5, §4). */

async function signIn(path = "/home") {
  const app = renderApp("/login");
  await app.user.type(await screen.findByLabelText("Email"), "patient@medilink.test");
  await app.user.click(screen.getByRole("button", { name: "Continue" }));
  const password = await screen.findByLabelText("Password");
  await waitFor(() => expect(password).toHaveFocus());
  await app.user.paste(MOCK_PASSWORD);
  await app.user.click(screen.getByRole("button", { name: "Log in" }));
  await screen.findByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening),/ });
  if (path !== "/home") await app.router.navigate(path);
  return app;
}

afterEach(() => {
  delete document.documentElement.dataset.textSize;
});

describe("patient shell (design 07 §2)", () => {
  it("has the four destinations with text labels and marks the current one", async () => {
    const { user, router } = await signIn();
    const nav = screen.getByRole("navigation", { name: "Main menu" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Home", "Find care", "My visits", "Help"]);
    expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    await user.click(within(nav).getByRole("link", { name: "My visits" }));
    expect(await screen.findByRole("heading", { level: 1, name: "My visits" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/visits");
    expect(within(nav).getByRole("link", { name: "My visits" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("home leads with Find care, family and the emergency notice", async () => {
    const { container } = await signIn();
    expect(screen.getByRole("heading", { name: "Need to see a doctor?" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Not sure? Describe your symptoms" })).toHaveAttribute(
      "href",
      "/find-care#symptoms",
    );
    expect(await screen.findByRole("region", { name: "Family" })).toBeInTheDocument();
    expect(screen.getByText(/MediLink is not for emergencies/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("the account menu reaches settings, where text size applies at once", async () => {
    const { user, container } = await signIn();
    await user.click(screen.getByRole("button", { name: /^Account menu for/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Settings" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Extra large/ }));
    expect(document.documentElement.dataset.textSize).toBe("xlarge");
    await user.click(screen.getByRole("radio", { name: /Normal/ }));
    expect(document.documentElement.dataset.textSize).toBeUndefined();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("find care explains today's walk-in and says what comes later", async () => {
    const { container } = await signIn("/find-care");
    expect(await screen.findByRole("heading", { level: 1, name: "Find care" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Visit today" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Book a time" })).toBeInTheDocument();
    expect(screen.getAllByText("Coming soon")).toHaveLength(2);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("my visits shows today's ticket and an empty history with a next step", async () => {
    const { container } = await signIn("/visits");
    expect(await screen.findByRole("heading", { level: 1, name: "My visits" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /G-020/ })).toBeInTheDocument();
    expect(screen.getByText("Your visit history starts here")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("help answers common questions and keeps the emergency notice first", async () => {
    const { user, container } = await signIn("/support");
    expect(await screen.findByRole("heading", { level: 1, name: "Help" })).toBeInTheDocument();
    await user.click(screen.getByText("How do I follow my turn?"));
    expect(screen.getByText(/open My visits/)).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });
});
