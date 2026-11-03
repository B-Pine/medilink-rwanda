import { MOCK_PASSWORD } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderApp } from "../../test/render";

/** S5b patient-web (contract §6.1): disruption offer on My visits and the calendar feed. */

async function signIn(next = "/dashboard/appointments") {
  const app = renderApp("/login");
  await app.user.type(await screen.findByLabelText("Email"), "patient@medilink.test");
  await app.user.click(screen.getByRole("button", { name: "Continue" }));
  const password = await screen.findByLabelText("Password");
  await waitFor(() => expect(password).toHaveFocus());
  await app.user.paste(MOCK_PASSWORD);
  await app.user.click(screen.getByRole("button", { name: "Log in" }));
  await screen.findByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ });
  await app.router.navigate(next);
  return app;
}

/** The changed booking: its row says "Needs your answer"; the offer is on its detail page. */
async function openOffer(user: Awaited<ReturnType<typeof signIn>>["user"]) {
  await user.click(await screen.findByRole("link", { name: /Needs your answer/ }));
  await screen.findByRole("heading", { level: 1 });
  return screen.getByRole("main");
}

describe("disruption offer (S5-B13)", () => {
  it("explains the change and the deadline; keeping the new time closes it", async () => {
    const { user, container } = await signIn();
    const upcoming = await openOffer(user);
    expect(await within(upcoming).findByText("Your booking has changed")).toBeInTheDocument();
    expect(within(upcoming).getByText(/^The facility moved your visit/)).toBeInTheDocument();
    expect(within(upcoming).getByText(/If you don't answer by|Please answer/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await user.click(within(upcoming).getByRole("button", { name: "Keep the new time" }));
    await waitFor(() =>
      expect(within(upcoming).queryByText("Your booking has changed")).not.toBeInTheDocument(),
    );
  });

  it("choosing another time lists the free times", async () => {
    const { user } = await signIn();
    const upcoming = await openOffer(user);
    await user.click(await within(upcoming).findByRole("button", { name: "Choose another time" }));
    const dialog = await screen.findByRole("dialog", { name: "Choose another time" });
    // free times this week, or a clear message when there are none
    await waitFor(() =>
      expect(
        within(dialog).queryByLabelText("Day") ??
          within(dialog).queryByText("No free time this week. Keep the new time or cancel."),
      ).toBeTruthy(),
    );
  });
});

describe("calendar feed (S5-B15)", () => {
  it("shows the private link once when turned on, then only since when", async () => {
    const { user, container } = await signIn();
    const card = await screen.findByRole("region", { name: "Calendar subscription" });
    const toggle = within(card).getByRole("switch", { name: /Calendar link/ });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    const link = await within(card).findByLabelText("Your private link");
    expect((link as HTMLInputElement).value).toMatch(/^https?:\/\//);
    expect(within(card).getByRole("link", { name: "Open in my calendar app" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^webcal:/),
    );
    expect(await axe(container)).toHaveNoViolations();

    await user.click(within(card).getByRole("switch", { name: /Calendar link/ }));
    await waitFor(() =>
      expect(within(card).queryByLabelText("Your private link")).not.toBeInTheDocument(),
    );
    expect(within(card).getByRole("switch", { name: /Calendar link/ })).not.toBeChecked();
  });
});
