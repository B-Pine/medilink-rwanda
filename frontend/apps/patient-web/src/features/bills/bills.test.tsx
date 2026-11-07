import { MOCK_PASSWORD } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderApp } from "../../test/render";
import { sortBills } from "./BillsPages";

/** S8-F6 (patient-web `bills`) against the contract mocks (sprint-08 §3.2, §6.2). */

async function signIn(next = "/home") {
  const app = renderApp("/login");
  await app.user.type(await screen.findByLabelText("Email"), "patient@medilink.test");
  await app.user.click(screen.getByRole("button", { name: "Continue" }));
  const password = await screen.findByLabelText("Password");
  await waitFor(() => expect(password).toHaveFocus());
  await app.user.paste(MOCK_PASSWORD);
  await app.user.click(screen.getByRole("button", { name: "Log in" }));
  await screen.findByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ });
  if (next !== "/home") await app.router.navigate(next);
  return app;
}

describe("My bills (S8-F6)", () => {
  it("puts bills with something left to pay first, then the newest", () => {
    const row = (id: string, date: string, balance: number) => ({
      id,
      patient_id: "p",
      facility_name: id,
      service_date: date,
      status: balance ? ("open" as const) : ("paid" as const),
      total_rwf: 1,
      patient_share_rwf: 1,
      paid_rwf: 0,
      balance_rwf: balance,
    });
    const sorted = sortBills([
      row("old-paid", "2026-10-01", 0),
      row("new-paid", "2026-11-05", 0),
      row("old-due", "2026-09-01", 500),
      row("new-due", "2026-11-01", 200),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["new-due", "old-due", "new-paid", "old-paid"]);
  });

  it("the overview points to a bill with a balance", async () => {
    await signIn();
    const card = await screen.findByRole("region", { name: "Needs your attention" });
    expect(await within(card).findByText(/1,200 RWF left to pay/)).toBeInTheDocument();
    expect(within(card).getAllByRole("link", { name: "See the bill" })[0]).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/dashboard\/bills\//),
    );
  });

  it("lists the bills with the total left to pay; the detail splits each line", async () => {
    const { user, container } = await signIn("/dashboard/bills");
    expect(await screen.findByRole("heading", { level: 1, name: "Bills" })).toBeInTheDocument();
    // today's Kigali Clinic bill (1,200) and the antenatal visit (650) are still due
    expect(await screen.findByText("1,850 RWF")).toBeInTheDocument();
    const rows = within(screen.getByRole("list", { name: "Bills" })).getAllByRole("link");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/Kigali Clinic.*1,200 RWF to pay/),
      expect.stringMatching(/Kicukiro Health Center.*650 RWF to pay/),
      expect.stringMatching(/Kibagabaga District Hospital.*Paid/),
    ]);
    expect(await axe(container)).toHaveNoViolations();

    await user.click(rows[1]!);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Kicukiro Health Center" }),
    ).toBeInTheDocument();
    const facts = Object.fromEntries(
      screen
        .getAllByRole("term")
        .map((term) => [term.textContent, term.nextElementSibling?.textContent]),
    );
    expect(facts).toMatchObject({
      Total: "11,000 RWF",
      "Insurance pays": "9,350 RWF",
      "Your share": "1,650 RWF",
      Paid: "1,000 RWF",
      "Left to pay": "650 RWF",
    });
    expect(screen.getByRole("rowheader", { name: "Ultrasound" })).toBeInTheDocument();
    expect(screen.getByText("RC-2026-000184")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("another account's bill is not found", async () => {
    await signIn("/dashboard/bills/00000000-0000-4000-8000-000000000000");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Bill not found" }),
    ).toBeInTheDocument();
  });
});
