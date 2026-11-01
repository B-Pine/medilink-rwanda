import { MOCK_PASSWORD, MOCK_TOTP_CODE } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../../test/render";

/** S5-F6 (staff-web `bookings`): phone booking and a new time, against the contract mocks. */

async function signIn(path: string) {
  const app = renderApp(path);
  await logIn(app.user, "reception@medilink.test", MOCK_PASSWORD);
  await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
  await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  return app;
}

/** Picks the first free time of the first day that has one. */
async function pickFirstTime(panel: HTMLElement, user: Awaited<ReturnType<typeof signIn>>["user"]) {
  const times = await within(panel).findByRole("group", { name: "Free times" });
  const first = (await within(times).findAllByRole("button"))[0]!;
  await user.click(first);
}

describe("phone booking (S5-F6)", () => {
  it("finds the patient, holds a time, records the reason and confirms", async () => {
    const { user, container } = await signIn("/queue");
    await user.click(await screen.findByRole("button", { name: "Book by phone" }));
    const panel = await screen.findByRole("dialog", { name: "Book by phone" });
    expect(within(panel).getByText("Step 1 of 4")).toBeInTheDocument();

    await user.type(
      within(panel).getByRole("combobox", { name: "Find a patient" }),
      "Mukamana{Enter}",
    );
    await user.click((await within(panel).findAllByRole("button", { name: /Choose/ }))[0]!);

    expect(await within(panel).findByText("Step 2 of 4")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Service")).toBeInTheDocument();
    await pickFirstTime(panel, user);

    expect(await within(panel).findByText("Step 3 of 4")).toBeInTheDocument();
    expect(within(panel).getByText(/^Holding this time for \d+:\d\d$/)).toBeInTheDocument();
    expect(within(panel).getByRole("status")).toHaveTextContent(/minutes?\.$/);
    const next = within(panel).getByRole("button", { name: "Continue" });
    expect(next).toBeDisabled();
    await user.click(within(panel).getByRole("button", { name: "Fever" }));
    await user.type(within(panel).getByLabelText(/Contact phone/), "0788 123 456");
    await user.click(next);

    expect(await within(panel).findByText("Step 4 of 4")).toBeInTheDocument();
    expect(within(panel).getByText("Fever")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    await user.click(within(panel).getByRole("button", { name: "Confirm booking" }));

    expect(
      await within(panel).findByRole("heading", { name: "Booking confirmed" }),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Booking code")).toBeInTheDocument();
  });

  it("needs a valid Rwandan number when a contact phone is given", async () => {
    const { user } = await signIn("/queue");
    await user.click(await screen.findByRole("button", { name: "Book by phone" }));
    const panel = await screen.findByRole("dialog", { name: "Book by phone" });
    await user.type(
      within(panel).getByRole("combobox", { name: "Find a patient" }),
      "Mukamana{Enter}",
    );
    await user.click((await within(panel).findAllByRole("button", { name: /Choose/ }))[0]!);
    await pickFirstTime(panel, user);
    await user.click(await within(panel).findByRole("button", { name: "Fever" }));
    await user.type(within(panel).getByLabelText(/Contact phone/), "12");
    await user.click(within(panel).getByRole("button", { name: "Continue" }));
    expect(await within(panel).findByText(/Enter a Rwandan mobile number/)).toBeInTheDocument();
    expect(within(panel).getByText("Step 3 of 4")).toBeInTheDocument();
  });

  it("opens from /bookings/new (command palette route)", async () => {
    await signIn("/bookings/new");
    expect(await screen.findByRole("dialog", { name: "Book by phone" })).toBeInTheDocument();
  });

  it("moves an expected booking to a new time", async () => {
    const { user } = await signIn("/queue");
    const expected = await screen.findByRole("list", { name: "Expected" });
    const row = (await within(expected).findByText("Mutesi A.")).closest("li") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "New time" }));
    const panel = await screen.findByRole("dialog", { name: "New time for Mutesi A." });
    expect(within(panel).getByText("Step 1 of 2")).toBeInTheDocument();
    await pickFirstTime(panel, user);
    expect(await within(panel).findByText("Step 2 of 2")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Move booking" }));
    expect(
      await within(panel).findByRole("heading", { name: "Booking moved" }),
    ).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(within(expected).queryByText("Mutesi A.")).not.toBeInTheDocument());
  });
});
