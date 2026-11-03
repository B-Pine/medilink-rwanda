import { MOCK_PASSWORD } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderApp } from "../test/render";

/**
 * Patient dashboard shell (upgrade 12 §2). jsdom has no media queries, so these run against the
 * phone layout: compact header, five-tab bar and the More drawer.
 */

async function signIn(path = "/dashboard") {
  const app = renderApp("/login");
  await app.user.type(await screen.findByLabelText("Email"), "patient@medilink.test");
  await app.user.click(screen.getByRole("button", { name: "Continue" }));
  const password = await screen.findByLabelText("Password");
  await waitFor(() => expect(password).toHaveFocus());
  await app.user.paste(MOCK_PASSWORD);
  await app.user.click(screen.getByRole("button", { name: "Log in" }));
  await screen.findByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening),/ });
  if (path !== "/dashboard") await app.router.navigate(path);
  return app;
}

afterEach(() => {
  delete document.documentElement.dataset.textSize;
});

describe("patient dashboard shell (upgrade 12 §2)", () => {
  it("signs in to /dashboard and the tab bar marks the current place", async () => {
    const { user, router } = await signIn();
    expect(router.state.location.pathname).toBe("/dashboard");
    const nav = screen.getByRole("navigation", { name: "Main menu" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Home", "Find care", "Visits", "Records"]);
    expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    await user.click(within(nav).getByRole("link", { name: "Visits" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "My appointments" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/dashboard/appointments");
  });

  it("the overview has counts at a glance, upcoming appointments and the emergency notice", async () => {
    const { container } = await signIn();
    const glance = screen.getByRole("navigation", { name: "At a glance" });
    expect(within(glance).getByRole("link", { name: /Upcoming/ })).toHaveAttribute(
      "href",
      "/dashboard/appointments",
    );
    expect(within(glance).getByRole("link", { name: /Medical records/ })).toHaveAttribute(
      "href",
      "/dashboard/records",
    );
    expect(
      await screen.findByRole("heading", { level: 2, name: "Upcoming appointments" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/MediLink is not for emergencies/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("More opens the other places; My queue shows today's ticket", async () => {
    const { user, router } = await signIn();
    await user.click(screen.getByRole("button", { name: "More" }));
    const drawer = await screen.findByRole("dialog", { name: "More" });
    await user.click(within(drawer).getByRole("link", { name: "My queue" }));
    expect(await screen.findByRole("heading", { level: 1, name: "My queue" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/dashboard/queue");
    expect(await screen.findByRole("link", { name: /G-020/ })).toBeInTheDocument();
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

  it("old addresses still work: /visits opens My queue, /support opens Help", async () => {
    const { router } = await signIn();
    await router.navigate("/visits");
    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard/queue"));
    await router.navigate("/support");
    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard/help"));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Help & support" }),
    ).toBeInTheDocument();
  });
});
