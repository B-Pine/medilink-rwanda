import { MOCK_PASSWORD } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { renderApp } from "../../test/render";

/** S7-F5 (patient-web `medicines`) against the contract mocks. */

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

describe("My medicines (S7-F5)", () => {
  it("the overview lists the current medicines, one tap from the list", async () => {
    await signIn();
    const card = await screen.findByRole("region", { name: "Current medicines" });
    expect(await within(card).findByRole("link", { name: /Kigali Clinic/ })).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /View all/ })).toHaveAttribute(
      "href",
      "/dashboard/medications",
    );
  });

  it("lists active and past prescriptions; the detail gives each medicine in words", async () => {
    const { user, container } = await signIn("/medicines");
    expect(
      await screen.findByRole("heading", { level: 1, name: "My medications" }),
    ).toBeInTheDocument();
    await user.click(
      await screen.findByRole("link", { name: /Kigali Clinic.*Ready at the pharmacy/ }),
    );
    expect(await screen.findByText("RX-2026-000101")).toBeInTheDocument();
    // dose, how often and how long, each under its own label
    const facts = screen.getAllByRole("definition").map((d) => d.textContent);
    expect(facts).toEqual(expect.arrayContaining(["2 tablets", "three times a day", "for 5 days"]));
    expect(screen.getByText("After food")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("link", { name: "My medicines" }));
    await user.click(await screen.findByRole("button", { name: "Past" }));
    expect(await screen.findByRole("link", { name: /Given/ })).toBeInTheDocument();
  });
});
