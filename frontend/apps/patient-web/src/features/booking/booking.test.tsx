import { MOCK_PASSWORD } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderApp } from "../../test/render";

/** S5-F2, F3, F5 (patient-web `booking`) against the contract mocks. */

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

describe("facility search (S5-F2)", () => {
  it("lists live facilities with the patient share, and filters with chips", async () => {
    const { user, container } = renderApp("/search?service=general_consultation&insurer=rama");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Find a facility" }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/^\d+ facilit(y|ies)$/)).toBeInTheDocument();
    expect(screen.getAllByText("Kigali Clinic").length).toBeGreaterThan(0);
    const openNow = screen.getByRole("button", { name: "Open now" });
    await user.click(openNow);
    expect(openNow).toHaveAttribute("aria-pressed", "true");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("booking flow (S5-F3)", () => {
  it("one decision per screen: who, what, when, reason, review; then the booking code", async () => {
    const { user, container } = await signIn("/book/kigali-clinic");
    expect(await screen.findByText("Step 1 of 5")).toBeInTheDocument();
    const main = await screen.findByRole("main");
    await user.click(await within(main).findByRole("button", { name: /Mukamana Jeanne/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Step 2 of 5")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /General consultation/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Step 3 of 5")).toBeInTheDocument();
    const morning = await screen.findByText("Morning");
    const times = within(morning.parentElement!).getAllByRole("button");
    await user.click(times[0]!);

    expect(await screen.findByText("Step 4 of 5")).toBeInTheDocument();
    expect(screen.getByText(/^We're holding this time for \d+:\d\d$/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Fever" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    // design 07 §3.2: facility, time, insurance, your estimated share, cancellation rule
    expect(await screen.findByText("Step 5 of 5")).toBeInTheDocument();
    expect(screen.getAllByText("Kigali Clinic").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Insurance")).toBeInTheDocument();
    expect(screen.getByText("Your estimated share")).toBeInTheDocument();
    expect(screen.getByText(/cancel or change the time for free/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole("button", { name: "Book this visit" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Your visit is booked" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Booking code")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add to my calendar" })).toHaveAttribute(
      "href",
      expect.stringMatching(/calendar\.ics$/),
    );
  });

  it("back keeps the answers", async () => {
    const { user } = await signIn("/book/kigali-clinic");
    const main = await screen.findByRole("main");
    await user.click(await within(main).findByRole("button", { name: /Mukamana Jeanne/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: /General consultation/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Step 3 of 5");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Step 2 of 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /General consultation/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("upcoming visits (S5-F5)", () => {
  it("lists the upcoming booking and cancels it after a confirmation", async () => {
    const { user } = await signIn("/visits");
    const upcoming = await screen.findByRole("region", { name: "Upcoming" });
    const cancel = await within(upcoming).findByRole("button", { name: "Cancel" });
    await user.click(cancel);
    const dialog = await screen.findByRole("dialog", { name: "Cancel this booking?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel booking" }));
    expect(await within(upcoming).findByText("No upcoming bookings")).toBeInTheDocument();
  });
});
