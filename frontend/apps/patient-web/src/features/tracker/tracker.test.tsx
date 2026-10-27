import { MOCK_PASSWORD } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderApp } from "../../test/render";

/** S4-F6 (patient live tracker) against the contract mocks. */

async function signIn() {
  const app = renderApp("/login");
  await app.user.type(await screen.findByLabelText("Email"), "patient@medilink.test");
  await app.user.click(screen.getByRole("button", { name: "Continue" }));
  const password = await screen.findByLabelText("Password");
  await waitFor(() => expect(password).toHaveFocus());
  await app.user.paste(MOCK_PASSWORD);
  await app.user.click(screen.getByRole("button", { name: "Log in" }));
  await screen.findByRole("heading", {
    level: 1,
    name: /^Good (morning|afternoon|evening), Mukamana Jeanne$/,
  });
  return app;
}

describe("live tracker", () => {
  it("home shows today's ticket; the tracker shows place, wait and stages", async () => {
    const { user, container } = await signIn();
    const card = await screen.findByRole("link", { name: /G-020/ });
    expect(within(card).getByText(/people ahead of you/)).toBeInTheDocument();
    await user.click(card);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Your place in the queue" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("G-020")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /people ahead of you/ })).toBeInTheDocument();
    expect(screen.getByText(/^About \d+–\d+ min$/)).toBeInTheDocument();
    expect(screen.getByText("Doctor")).toHaveAttribute("aria-current", "step");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("travel time gives a leave-home time; cancel needs a confirmation", async () => {
    const { user } = await signIn();
    await user.click(await screen.findByRole("link", { name: /G-020/ }));
    await user.type(await screen.findByLabelText(/Minutes from home to here/), "5");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/^Leave home by /)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel my place" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel your place?" });
    await user.click(within(dialog).getByRole("button", { name: "Yes, cancel" }));
    await screen.findByRole("heading", {
      level: 1,
      name: /^Good (morning|afternoon|evening), Mukamana Jeanne$/,
    });
    expect(screen.queryByRole("link", { name: /G-020/ })).not.toBeInTheDocument();
  });
});
