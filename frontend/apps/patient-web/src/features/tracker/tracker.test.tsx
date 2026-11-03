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
    // the overview's current visit: the ticket, then "View live queue"
    expect(await screen.findByText("G-020")).toBeInTheDocument();
    expect(screen.getByText("People ahead")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "View live queue" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Your place in the queue" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("G-020")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /people ahead of you/ })).toBeInTheDocument();
    expect(screen.getByText(/^About \d+–\d+ min$/)).toBeInTheDocument();
    expect(screen.getByText("Doctor").closest("li")).toHaveAttribute("aria-current", "step");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("travel time gives a leave-home time; cancel needs a confirmation", async () => {
    const { user } = await signIn();
    await user.click(await screen.findByRole("link", { name: "View live queue" }));
    await user.type(await screen.findByLabelText(/Minutes from home to here/), "5");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/^Leave home by /)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel my place" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel your place?" });
    await user.click(within(dialog).getByRole("button", { name: "Yes, cancel" }));
    // cancelling returns to My queue, without the ticket
    await screen.findByRole("heading", { level: 1, name: "My queue" });
    expect(await screen.findByText("You're not currently in a queue.")).toBeInTheDocument();
    expect(screen.queryByText("G-020")).not.toBeInTheDocument();
  });

  it("remote joiners: I'm here records the claim; reception confirms (S5 B8, B9)", async () => {
    const { user, router, container } = await signIn();
    await router.navigate("/book/remera-health-center");
    const main = await screen.findByRole("main");
    await user.click(await within(main).findByRole("button", { name: /Mukamana Jeanne/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: /General consultation/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Join today's queue" }));

    const remote = await screen.findByRole("region", { name: "You joined from home" });
    // first in an empty queue: within the pass-over places, so the warning shows
    expect(within(remote).getByText("You're near the front")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    await user.click(within(remote).getByRole("button", { name: "I'm here" }));
    expect(await within(remote).findByRole("status")).toHaveTextContent(
      /Waiting for reception to confirm you're here/,
    );
    expect(within(remote).queryByRole("button", { name: "I'm here" })).not.toBeInTheDocument();
  }, 60_000);
});
