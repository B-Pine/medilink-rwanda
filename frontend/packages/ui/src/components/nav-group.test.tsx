import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { readPreference, writePreference } from "../preferences/storage";
import { renderWithProviders } from "../test/render";
import { NavGroup } from "./NavGroup";

const links = (
  <ul>
    <li>
      <a href="/records">Records</a>
    </li>
  </ul>
);

describe("NavGroup (sidebar groups the person can hide)", () => {
  afterEach(() => writePreference("navHidden", null));

  it("hides and shows its links, and keeps the choice", async () => {
    const user = userEvent.setup();
    const { container, unmount } = renderWithProviders(
      <NavGroup id="patient.health" title="My health">
        {links}
      </NavGroup>,
    );
    const header = screen.getByRole("button", { name: "My health" });
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Records" })).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();

    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Records" })).not.toBeInTheDocument();
    expect(readPreference("navHidden")).toBe("patient.health");
    unmount();

    // a new page view remembers it
    renderWithProviders(
      <NavGroup id="patient.health" title="My health">
        {links}
      </NavGroup>,
    );
    expect(screen.getByRole("button", { name: "My health" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("a hidden group opens again when the current page is inside it", () => {
    writePreference("navHidden", "patient.health");
    const { rerender } = renderWithProviders(
      <NavGroup id="patient.health" title="My health">
        {links}
      </NavGroup>,
    );
    expect(screen.queryByRole("link", { name: "Records" })).not.toBeInTheDocument();
    rerender(
      <NavGroup id="patient.health" title="My health" containsActive>
        {links}
      </NavGroup>,
    );
    expect(screen.getByRole("link", { name: "Records" })).toBeVisible();
  });

  it("shrunk to icons, every link stays and there is no header to click", () => {
    writePreference("navHidden", "patient.health");
    renderWithProviders(
      <NavGroup id="patient.health" title="My health" railed>
        {links}
      </NavGroup>,
    );
    expect(screen.queryByRole("button", { name: "My health" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Records" })).toBeInTheDocument();
  });
});
