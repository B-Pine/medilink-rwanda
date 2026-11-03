import { MOCK_PASSWORD, MOCK_TOTP_CODE } from "@medilink/api-client/mocks";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../../test/render";

/** Upgrade 06 §4: the cashier takes payments, nothing else. */
describe("cashier", () => {
  it("starts on the cash desk and sees Payments but not the queue or clinical work", async () => {
    const { user, container } = renderApp("/today");
    await logIn(user, "cashier@medilink.test", MOCK_PASSWORD);
    await user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
    await user.click(screen.getByRole("button", { name: "Verify and log in" }));

    expect(await screen.findByRole("heading", { level: 2, name: "Cash desk" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Payments/ })).toHaveAttribute(
      "href",
      "/payments",
    );
    expect(screen.getByRole("list", { name: "Today at the cash desk" })).toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: "Main menu" });
    const links = within(nav)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(links).toContain("Payments");
    expect(links).not.toContain("Queue");
    expect(links).not.toContain("Approvals");
    expect(await axe(container)).toHaveNoViolations();
  });
});
