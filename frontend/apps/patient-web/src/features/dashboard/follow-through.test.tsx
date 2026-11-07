import { MOCK_PASSWORD } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderApp } from "../../test/render";

/** W7 (upgrade 13): the patient sees what happens next without calling. */

async function signIn(next?: string) {
  const app = renderApp("/login");
  await app.user.type(await screen.findByLabelText("Email"), "patient@medilink.test");
  await app.user.click(screen.getByRole("button", { name: "Continue" }));
  const password = await screen.findByLabelText("Password");
  await waitFor(() => expect(password).toHaveFocus());
  await app.user.paste(MOCK_PASSWORD);
  await app.user.click(screen.getByRole("button", { name: "Log in" }));
  await screen.findByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ });
  if (next) await app.router.navigate(next);
  return app;
}

describe("patient follow-through", () => {
  it("the overview points to a new result", async () => {
    await signIn();
    const card = await screen.findByRole("region", { name: "Needs your attention" });
    expect(await within(card).findByText("A new result is ready")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Read it" })).toHaveAttribute(
      "href",
      "/dashboard/records",
    );
  });

  it("appointments list the dates the clinic planned", async () => {
    const { container } = await signIn("/dashboard/appointments");
    const planned = await screen.findByRole("region", { name: "Planned by your clinic" });
    expect(await within(planned).findByText("Vaccination")).toBeInTheDocument();
    expect(within(planned).getByText(/Second dose/)).toBeInTheDocument();
    expect(within(planned).getByText("Return visit")).toBeInTheDocument();
    expect(within(planned).getByRole("link", { name: "Book a time" })).toHaveAttribute(
      "href",
      "/dashboard/find-care?mode=booking",
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("released results come first on the records page, with the doctor's note", async () => {
    await signIn("/dashboard/records");
    const results = await screen.findByRole("region", { name: "Lab results" });
    expect(await within(results).findByText("Your doctor says:")).toBeInTheDocument();
    const first = document.querySelector("main section");
    expect(first?.getAttribute("aria-labelledby")).toBe("lab-results");
  });
});
