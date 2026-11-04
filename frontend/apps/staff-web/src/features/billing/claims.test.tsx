import { MOCK_PASSWORD, MOCK_TOTP_CODE } from "@medilink/api-client/mocks";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../../test/render";

async function signIn(email: string, path: string) {
  const app = renderApp("/today");
  await logIn(app.user, email, MOCK_PASSWORD);
  await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
  await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  await screen.findByRole("navigation", { name: "Main menu" });
  await app.router.navigate(path);
  return app;
}

/** #203 (W4): the monthly claim list per insurer and the end-of-shift summary by method. */
describe("insurance claims", () => {
  it("lists the month's RAMA claims and marks one rejected with the insurer's reason", async () => {
    const { user, container } = await signIn("facility.admin@medilink.test", "/claims");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Insurance claims" }),
    ).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Insurance claims" });
    const pending = within(list).getByText("Mukamana Jeanne").closest("li")!;
    expect(within(list).getByText("Niyonsaba Claudine")).toBeInTheDocument();
    expect(within(pending).getByText("B54")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download CSV/ })).toBeEnabled();

    await user.click(within(pending).getByRole("button", { name: "Rejected" }));
    const confirm = within(pending).getByRole("button", { name: "Mark rejected" });
    expect(confirm).toBeDisabled();
    await user.type(within(pending).getByLabelText("The insurer's reason"), "Card expired");
    await user.click(confirm);
    expect(await within(pending).findByText(/Marked by/)).toBeInTheDocument();
    expect(within(pending).getByText("Card expired")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("is not in the cashier's menu", async () => {
    await signIn("cashier@medilink.test", "/today");
    const nav = await screen.findByRole("navigation", { name: "Main menu" });
    const links = within(nav)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(links).not.toContain("Insurance claims");
  });

  it("shows the open shift by payment method with the float in the cash drawer", async () => {
    const { user } = await signIn("cashier@medilink.test", "/payments");
    await user.click(await screen.findByRole("button", { name: "Open shift" }));
    const dialog = await screen.findByRole("dialog");
    await user.clear(within(dialog).getByLabelText(/Opening float/));
    await user.type(within(dialog).getByLabelText(/Opening float/), "10000");
    await user.click(within(dialog).getByRole("button", { name: "Open shift" }));
    const table = await screen.findByRole("table", { name: "By payment method" });
    const cash = within(table).getByRole("row", { name: /^Cash/ });
    expect(within(cash).getAllByRole("cell").at(-1)).toHaveTextContent(/10,000/);
  });
});
