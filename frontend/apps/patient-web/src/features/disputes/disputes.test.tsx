import { MOCK_DISPUTE, MOCK_PASSWORD } from "@medilink/api-client/mocks";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderApp } from "../../test/render";

/** S10b-F1 (patient-web `disputes`) against the contract mocks. */

async function signIn(next: string) {
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

describe("My disputes (S10b-F1)", () => {
  it("lists my dispute; the detail hides internal notes and takes a reply", async () => {
    const { user, container } = await signIn("/disputes");
    await user.click(await screen.findByRole("link", { name: /Prescription.*Being checked/ }));
    expect(await screen.findByText(/10 tablets but the prescription says 21/)).toBeInTheDocument();
    expect(screen.queryByText(/shelf count/)).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Your reply" }), "I still have the box.");
    await user.click(screen.getByRole("button", { name: "Send reply" }));
    expect(await screen.findByText("I still have the box.")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("raises a dispute from an item, then opens it", async () => {
    const { user } = await signIn(
      "/disputes/new?subject_type=bill&subject_id=0b000000-0000-4000-8000-000000000001&patient_id=" +
        "9b2f1c3d-1111-4000-8000-000000000001",
    );
    expect(await screen.findByText("About: Bill")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByText("Say what went wrong in a sentence or two.")).toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: "What went wrong?" }),
      "I was charged twice for the consultation.",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    // the detail page loads lazily after the redirect
    expect(await screen.findByText(/charged twice/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText("The facility answers within 3 days.")).toBeInTheDocument();
  });

  it("the seeded dispute opens directly", async () => {
    await signIn(`/disputes/${MOCK_DISPUTE}`);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Prescription" }),
    ).toBeInTheDocument();
  });
});
