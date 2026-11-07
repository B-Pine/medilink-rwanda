import { MOCK_PASSWORD, MOCK_TOTP_CODE } from "@medilink/api-client/mocks";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../../test/render";

/** S10b-F2 (staff-web `disputes`) against the contract mocks (sprint-10b §3, §5). */

async function signIn(email: string, path: string) {
  const app = renderApp(path);
  await logIn(app.user, email, MOCK_PASSWORD);
  await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
  await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  return app;
}

describe("facility disputes (S10b-F2)", () => {
  it("lists open disputes oldest deadline first, with overdue and flagged ones marked", async () => {
    const { user, container } = await signIn("facility.admin@medilink.test", "/disputes");
    expect(await screen.findByRole("heading", { level: 1, name: "Disputes" })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Disputes" });
    const rows = within(list).getAllByRole("link");
    // oldest deadline first: the escalated booking (15 days old) leads
    expect(rows[0]).toHaveTextContent(/Habimana Eric.*Escalated/);
    expect(within(list).getByRole("link", { name: /Niyonsaba Claudine/ })).toHaveTextContent(
      /Often rejected.*Overdue/,
    );
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: "Overdue" }));
    expect(await screen.findAllByRole("link", { name: /Niyonsaba Claudine/ })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /Mukamana Jeanne/ })).not.toBeInTheDocument();
  });

  it("acknowledges, keeps a note internal, then resolves with an outcome that fits", async () => {
    const { user, container } = await signIn("facility.admin@medilink.test", "/disputes");
    await user.click(await screen.findByRole("link", { name: /Niyonsaba Claudine/ }));
    expect(await screen.findByText(/nobody called my name/)).toBeInTheDocument();
    expect(screen.getByText("scheduling.no_show_marked")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Acknowledge" }));
    expect(await screen.findByText("Acknowledged.")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Message type"), "internal");
    await user.type(screen.getByLabelText("Message"), "Display log shows no call at 09:00.");
    await user.click(screen.getByRole("button", { name: "Send" }));
    const thread = await screen.findByRole("list", { name: "Thread" });
    expect(within(thread).getByText("Internal note")).toBeInTheDocument();

    const outcome = screen.getByLabelText("Outcome");
    // a missed-visit dispute can't become a refund
    expect(within(outcome).queryByRole("option", { name: "Refund" })).not.toBeInTheDocument();
    await user.selectOptions(outcome, "no_show_reversed");
    await user.type(
      screen.getByLabelText("Reason"),
      "The patient was waiting; the call was missed.",
    );
    await user.click(screen.getByRole("button", { name: "Resolve" }));
    expect(await screen.findByText("Decision recorded.")).toBeInTheDocument();
    expect(screen.getByText("Done: Missed visit reversed")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("asks a colleague for a comment", async () => {
    const { user } = await signIn("facility.admin@medilink.test", "/disputes");
    await user.click(await screen.findByRole("link", { name: /Mukamana Jeanne.*Bill/ }));
    const colleague = await screen.findByRole("region", { name: "Ask a colleague" });
    await user.selectOptions(await within(colleague).findByLabelText("Colleague"), "Uwimana Keza");
    await user.click(within(colleague).getByRole("button", { name: "Ask for a comment" }));
    expect(await screen.findByText("Comment requested.")).toBeInTheDocument();
    expect(within(colleague).getByText(/Uwimana Keza · waiting/)).toBeInTheDocument();
  });
});

describe("platform disputes (S10b-F2)", () => {
  it("the Command centre opens the escalated cases; the platform records the final decision", async () => {
    const { user, container } = await signIn("admin@medilink.test", "/platform/disputes");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Escalated disputes" }),
    ).toBeInTheDocument();
    await user.click(await screen.findByRole("link", { name: /Habimana Eric/ }));
    expect(await screen.findByText(/moved twice without asking me/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await user.selectOptions(screen.getByLabelText("Outcome"), "rebooking");
    await user.type(
      screen.getByLabelText("Reason"),
      "Two moves without consent; offer a priority slot.",
    );
    await user.click(screen.getByRole("button", { name: "Record final decision" }));
    expect(await screen.findByText("Decision recorded.")).toBeInTheDocument();
    expect(screen.getByText("To do: Rebooking")).toBeInTheDocument();
    expect(screen.getByText("This dispute is closed.")).toBeInTheDocument();
  });
});
