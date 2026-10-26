import { MOCK_PASSWORD, MOCK_TOTP_CODE } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../test/render";

/** Design pass (#64): command palette and collapsible sidebar. */

async function signIn(path = "/today") {
  const app = renderApp(path);
  await logIn(app.user, "reception@medilink.test", MOCK_PASSWORD);
  await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
  await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  await screen.findByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ });
  return app;
}

describe("command palette", () => {
  it("opens with Ctrl+K, filters pages and goes to the chosen one", async () => {
    const { user, router, baseElement } = await signIn();
    await user.keyboard("{Control>}k{/Control}");
    const input = await screen.findByRole("combobox", { name: "Search or jump to" });
    await waitFor(() => expect(input).toHaveFocus());
    expect(await axe(baseElement)).toHaveNoViolations();

    await user.type(input, "pay");
    const list = screen.getByRole("listbox");
    expect(within(list).getByRole("option", { name: "Payments" })).toBeInTheDocument();
    expect(within(list).queryByRole("option", { name: "Queue" })).not.toBeInTheDocument();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(router.state.location.pathname).toBe("/payments"));
    expect(screen.queryByRole("combobox", { name: "Search or jump to" })).not.toBeInTheDocument();
  });

  it("offers new walk-in and finds a patient only when asked", async () => {
    const { user, router } = await signIn();
    await user.click(screen.getByRole("button", { name: "Search or jump to…" }));
    const input = await screen.findByRole("combobox", { name: "Search or jump to" });
    expect(screen.getByRole("option", { name: "Register walk-in" })).toBeInTheDocument();

    await user.type(input, "Mukamana");
    const searchRow = screen.getByRole("option", { name: "Search patients for “Mukamana”" });
    expect(screen.queryByRole("group", { name: "Patients" })).not.toBeInTheDocument();
    await user.click(searchRow);

    const results = await screen.findByRole("group", { name: "Patients" });
    await user.click(within(results).getByRole("option", { name: /^Mukamana Jeanne/ }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/patients\/.+/));
  });

  it("forgets what was typed when closed", async () => {
    const { user } = await signIn();
    await user.keyboard("{Control>}k{/Control}");
    await user.type(await screen.findByRole("combobox", { name: "Search or jump to" }), "abc");
    await user.keyboard("{Escape}");
    await user.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("combobox", { name: "Search or jump to" })).toHaveValue("");
  });
});

describe("sidebar", () => {
  it("collapses to icons and keeps accessible link names", async () => {
    const { user } = await signIn();
    const nav = screen.getByRole("navigation", { name: "Main menu" });
    await user.click(within(nav).getByRole("button", { name: "Collapse menu" }));
    expect(within(nav).getByRole("button", { name: "Expand menu" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Patients" })).toHaveAttribute(
      "title",
      "Patients",
    );
    await user.click(within(nav).getByRole("button", { name: "Expand menu" }));
    expect(within(nav).getByRole("link", { name: "Patients" })).not.toHaveAttribute("title");
  });
});
