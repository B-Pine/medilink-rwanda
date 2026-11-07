import { MOCK_PASSWORD } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderApp } from "../../test/render";

/** S10b-F1 (patient-web `disputes`) against the contract mocks (sprint-10b §3, §5). */

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

describe("My disputes (S10b-F1)", () => {
  it("shows the thread without the facility's internal notes", async () => {
    const { user, container } = await signIn("/dashboard/disputes");
    expect(await screen.findByRole("heading", { level: 1, name: "Disputes" })).toBeInTheDocument();
    await user.click(await screen.findByRole("link", { name: /^Bill.*Under review/ }));
    expect(
      await screen.findByText(/checking the laboratory register for that day/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/no RDT recorded/)).not.toBeInTheDocument();
    expect(screen.getByText("Decision by")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Message"), "The receipt says RDT but no blood was taken.");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Message sent.")).toBeInTheDocument();
    expect(screen.getByText("The receipt says RDT but no blood was taken.")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("after a refused correction: add a statement, accept, then reopen once", async () => {
    const { user, container } = await signIn("/dashboard/disputes");
    await user.click(await screen.findByRole("link", { name: /^Document DOC-2026-000412/ }));
    const answer = await screen.findByRole("region", { name: "Correction refused" });
    expect(within(answer).getByText(/records three days of rest/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await user.type(
      within(answer).getByLabelText("Your statement"),
      "The doctor told me five days of rest.",
    );
    await user.click(within(answer).getByRole("button", { name: "Add statement" }));
    expect(await screen.findByText("Statement added to your record.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add statement" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Closed.")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Reopen" }));
    expect(await screen.findByText("Reopened.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reopen" })).not.toBeInTheDocument();
  });

  it("reports a problem from a bill: one open dispute per bill", async () => {
    const { user } = await signIn("/dashboard/bills");
    await user.click(await screen.findByRole("link", { name: /^Kigali Clinic/ }));
    await user.click(await screen.findByRole("link", { name: "Report a problem" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Report a problem" }),
    ).toBeInTheDocument();
    const send = screen.getByRole("button", { name: "Send" });
    await user.type(screen.getByLabelText("What went wrong?"), "Too short");
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText("What went wrong?"), " but now long enough.");
    await user.click(send);
    // the seeded dispute about this bill is still open (409 already_open)
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A dispute about this is already open.",
    );
  });

  it("reports a problem from a prescription and lands on the new dispute", async () => {
    const { user } = await signIn("/dashboard/medications");
    await user.click(
      await screen.findByRole("link", { name: /Kigali Clinic.*Ready at the pharmacy/ }),
    );
    await user.click(await screen.findByRole("link", { name: "Report a problem" }));
    await user.type(
      await screen.findByLabelText("What went wrong?"),
      "The pharmacy gave me 10 tablets instead of 15.",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: /^Prescription/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Sent").length).toBeGreaterThan(0);
    expect(screen.getByText("Answer by")).toBeInTheDocument();
  });
});
