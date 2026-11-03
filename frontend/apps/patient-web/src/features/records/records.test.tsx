import { MOCK_PASSWORD, MOCK_PRIVATE_NOTE } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderApp } from "../../test/render";

/** S6 patient records (contract sprint-06 §6.2, PR1, PR2, S6-B14) against the contract mocks. */

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

describe("my health records", () => {
  it("the overview shows the latest signed visits, one tap from the list", async () => {
    await signIn();
    const card = await screen.findByRole("region", { name: "Recent visits" });
    expect(await within(card).findByRole("link", { name: /Malaria/ })).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /View all/ })).toHaveAttribute(
      "href",
      "/dashboard/records",
    );
  });

  it("lists signed records in plain language and opens one without private notes", async () => {
    const { user, container } = await signIn("/records");
    expect(
      await screen.findByRole("heading", { level: 1, name: "My health records" }),
    ).toBeInTheDocument();
    const malaria = await screen.findByRole("link", { name: /Malaria/ });
    expect(await axe(container)).toHaveNoViolations();

    await user.click(malaria);
    expect(
      await screen.findByRole("heading", { level: 1, name: /^Visit on / }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What the doctor found" })).toBeInTheDocument();
    expect(screen.getByText(/Drink plenty of water/)).toBeInTheDocument();
    // Never the doctor's private notes or examination (S6-B14).
    expect(screen.queryByText(MOCK_PRIVATE_NOTE)).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/private notes|examination/i);
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("link", { name: "All records" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "My health records" }),
    ).toBeInTheDocument();
  });

  it("an unknown record is not found", async () => {
    await signIn("/records/7d000000-0000-4000-8000-0000000000ff");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Record not found" }),
    ).toBeInTheDocument();
  });
});
