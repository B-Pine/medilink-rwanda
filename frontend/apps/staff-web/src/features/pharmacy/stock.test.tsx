import { MOCK_PASSWORD, MOCK_TOTP_CODE } from "@medilink/api-client/mocks";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../../test/render";

/** W5 pharmacy stock (upgrade 13 §3, FR-PHA-06) against the mocks. */

async function pharmacist() {
  const app = renderApp("/today");
  await logIn(app.user, "pharmacist@medilink.test", MOCK_PASSWORD);
  await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
  await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  const facility = await screen.findByRole("heading", {
    level: 1,
    name: /^(Choose your facility|Good (morning|afternoon|evening))/,
  });
  if (facility.textContent === "Choose your facility")
    await app.user.click(screen.getByRole("button", { name: "Work at Kigali Clinic" }));
  await screen.findByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ });
  return app;
}

const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

describe("pharmacy stock (W5)", () => {
  it("lists stock by level, shows expiring batches and receives a new batch", async () => {
    const app = await pharmacist();
    await app.router.navigate("/pharmacy/stock");
    expect(await screen.findByRole("heading", { level: 1, name: "Stock" })).toBeInTheDocument();
    const amox = await screen.findByRole("link", { name: /Amoxicillin 500 mg capsule/ });
    expect(within(amox).getByText("215 units")).toBeInTheDocument();
    expect(within(amox).getByText("In stock")).toBeInTheDocument();
    expect(await axe(app.container)).toHaveNoViolations();

    await app.user.click(screen.getByRole("tab", { name: "Low or out" }));
    const low = await screen.findByRole("link", { name: /Paracetamol 500 mg tablet/ });
    expect(within(low).getByText("Low stock")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /Amoxicillin/ })).not.toBeInTheDocument(),
    );

    await app.user.click(screen.getByRole("tab", { name: "Expiring soon" }));
    const table = await screen.findByRole("table", { name: "Expiring soon" });
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("AMX-2309");
    expect(within(rows[1]!).getByText("Expired")).toBeInTheDocument();

    await app.user.click(screen.getByRole("button", { name: "Receive stock" }));
    const dialog = await screen.findByRole("dialog", { name: "Receive stock" });
    await app.user.click(within(dialog).getByRole("button", { name: "Add to stock" }));
    expect(within(dialog).getByText("Choose a medicine.")).toBeInTheDocument();
    await app.user.type(within(dialog).getByRole("searchbox", { name: /Medicine/ }), "ors");
    await app.user.click(await within(dialog).findByRole("button", { name: /Oral rehydration/ }));
    await app.user.type(within(dialog).getByRole("textbox", { name: "Batch number" }), "ORS-9");
    fireEvent.change(within(dialog).getByLabelText("Expiry date"), {
      target: { value: inDays(200) },
    });
    await app.user.type(within(dialog).getByRole("spinbutton", { name: /Units received/ }), "50");
    await app.user.click(within(dialog).getByRole("button", { name: "Add to stock" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await app.user.click(screen.getByRole("tab", { name: "All medicines" }));
    const ors = await screen.findByRole("link", { name: /Oral rehydration salts/ });
    expect(within(ors).getByText("50 units")).toBeInTheDocument();
  }, 60_000);

  it("removes an expired batch with a reason and records the movement", async () => {
    const app = await pharmacist();
    await app.router.navigate("/pharmacy/stock/AMOX500");
    await screen.findByRole("heading", { level: 1, name: "Amoxicillin 500 mg capsule" });
    expect(screen.getByText(/12 expired units are still on the shelf/)).toBeInTheDocument();
    const batches = screen.getByRole("region", { name: "Batches on the shelf" });
    const expired = within(batches).getByText("AMX-2309").closest("li")!;
    await app.user.click(within(expired as HTMLElement).getByRole("button", { name: "Adjust" }));
    const dialog = await screen.findByRole("dialog", { name: "Adjust batch AMX-2309" });
    await app.user.selectOptions(
      within(dialog).getByRole("combobox", { name: "Reason" }),
      "expired",
    );
    const removed = within(dialog).getByRole("spinbutton", { name: "Units to take off" });
    await app.user.type(removed, "13");
    await app.user.click(within(dialog).getByRole("button", { name: "Save the change" }));
    expect(within(dialog).getByText("Take off between 1 and 12.")).toBeInTheDocument();
    await app.user.clear(removed);
    await app.user.type(removed, "12");
    await app.user.click(within(dialog).getByRole("button", { name: "Save the change" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText(/expired units are still on the shelf/)).not.toBeInTheDocument();
    const movements = screen.getByRole("table", { name: "Movements" });
    expect(within(movements).getByText("-12")).toBeInTheDocument();
    expect(within(movements).getByText("Expired")).toBeInTheDocument();
  }, 60_000);
});
