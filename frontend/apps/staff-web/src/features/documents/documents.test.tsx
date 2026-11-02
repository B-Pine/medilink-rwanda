import {
  MOCK_PASSWORD,
  MOCK_PRESSURE_CONSULTATION,
  MOCK_TOTP_CODE,
} from "@medilink/api-client/mocks";
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../../test/render";

/** S7-F7 (staff-web `documents`) against the contract mocks. */

async function signIn(email: string) {
  const app = renderApp("/today");
  await logIn(app.user, email, MOCK_PASSWORD);
  await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
  await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  const facility = await screen.findByRole("heading", {
    level: 1,
    name: /^(Choose your facility|Good (morning|afternoon|evening))/,
  });
  if (facility.textContent === "Choose your facility")
    await app.user.click(screen.getByRole("button", { name: "Work at Kigali Clinic" }));
  await screen.findByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ });
  return app;
}

describe("letters and requests in the consultation (S7-F7)", () => {
  it("a sick note written in the draft is signed with it and becomes a document", async () => {
    const app = await signIn("doctor@medilink.test");
    await app.router.navigate("/clinical/unsigned");
    await app.user.click(await screen.findByRole("link", { name: /Open the draft for Mukamana/ }));
    await screen.findByRole("heading", { level: 1, name: /^Consultation · Mukamana/ });
    const section = await screen.findByRole("region", { name: "Letters and requests" });
    expect(within(section).getByText("No letter or request yet.")).toBeInTheDocument();

    await app.user.click(within(section).getByRole("button", { name: "Sick note" }));
    await app.user.click(within(section).getByRole("button", { name: "Add" }));
    expect(within(section).getAllByText("Fill this in.")).toHaveLength(2);
    await app.user.type(within(section).getByLabelText("First day of rest"), "2026-11-02");
    await app.user.type(within(section).getByLabelText("Last day of rest"), "2026-11-04");
    await app.user.click(within(section).getByRole("button", { name: "Add" }));
    expect(await within(section).findByText("Signs with the consultation")).toBeInTheDocument();

    const search = screen.getByRole("combobox", { name: "Find an ICD-10 diagnosis" });
    await app.user.type(search, "malaria");
    const results = await screen.findByRole("listbox", { name: "Diagnoses found" });
    await app.user.click((await within(results).findAllByRole("option"))[0]!);
    await app.user.click(screen.getByRole("button", { name: "Sign and lock" }));
    expect(await screen.findByText(/^Signed by /)).toBeInTheDocument();

    const signed = await screen.findByRole("region", { name: "Letters and requests" });
    expect(await within(signed).findByText(/^Signed /)).toBeInTheDocument();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await app.user.click(
      await within(signed).findByRole("button", { name: /^Download\s*Sick note SN-2026-/ }),
    );
    await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
    expect(open.mock.calls[0]?.[0]).toMatch(/SN-2026-000005\.pdf$/);
    expect(await axe(app.container)).toHaveNoViolations();
  });

  it("a signed consultation lists its letters; only its author may add one", async () => {
    const app = await signIn("doctor@medilink.test");
    await app.router.navigate(`/clinical/consultations/${MOCK_PRESSURE_CONSULTATION}`);
    const section = await screen.findByRole("region", { name: "Letters and requests" });
    expect(await within(section).findByText("Sick note")).toBeInTheDocument();
    expect(
      within(section).getByText(
        "A new one is signed when you save it; it asks for your password again.",
      ),
    ).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Referral letter" })).toBeInTheDocument();
  });
});
