import {
  MOCK_PASSWORD,
  MOCK_PRESSURE_CONSULTATION,
  MOCK_RX_CONTROLLED,
  MOCK_RX_READY,
  MOCK_TOTP_CODE,
} from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../../test/render";

/** S7-F1..F4 (staff-web `pharmacy`) against the contract mocks. */

async function signIn(email: string, path = "/today") {
  const app = renderApp(path);
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

const pharmacist = () => signIn("pharmacist@medilink.test");

describe("pharmacist workspace (upgrade 05 §4)", () => {
  it("Today shows the counter, the history lists dispensings, verify checks a code", async () => {
    const { user, router, container } = await signIn("pharmacist@medilink.test");
    const counter = await screen.findByRole("region", { name: "Pharmacy counter" });
    expect(
      within(counter).getByRole("list", { name: "Today at the pharmacy" }),
    ).toBeInTheDocument();
    expect(within(counter).getByRole("region", { name: "Next to give" })).toBeInTheDocument();
    expect(screen.queryByText("On site now")).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await router.navigate("/pharmacy/history");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Dispensing history" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "30 days" }));
    expect(await screen.findByRole("table", { name: "Dispensing history" })).toBeInTheDocument();

    await router.navigate("/pharmacy/verify");
    await user.type(await screen.findByRole("textbox", { name: /Verification code/ }), "NOPE-0000");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  }, 60_000);
});

describe("pharmacy queue (S7-F2)", () => {
  it("tabs, search by number, flags; the menu shows Pharmacy and availability", async () => {
    const app = await pharmacist();
    const nav = screen.getByRole("navigation", { name: /Main/ });
    expect(within(nav).getByRole("link", { name: "Pharmacy" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Medicine availability" })).toBeInTheDocument();

    await app.router.navigate("/pharmacy");
    expect(await screen.findByRole("heading", { level: 1, name: "Pharmacy" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Mukamana Jeanne" })).toBeInTheDocument();
    expect(screen.getByText("Controlled")).toBeInTheDocument();

    await app.user.type(screen.getByRole("searchbox", { name: "Find a prescription" }), "000103");
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Mukamana Jeanne" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: "Niyonsaba Claudine" })).toBeInTheDocument();

    // #134: the active ticket finds it too
    const find = screen.getByRole("searchbox", { name: "Find a prescription" });
    await app.user.clear(find);
    await app.user.type(find, "g-012");
    expect(await screen.findByRole("link", { name: "Mukamana Jeanne" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Niyonsaba Claudine" })).not.toBeInTheDocument();

    await app.user.clear(screen.getByRole("searchbox", { name: "Find a prescription" }));
    await app.user.click(screen.getByRole("tab", { name: "Questions" }));
    expect(await screen.findByRole("link", { name: "Uwase Aline" })).toBeInTheDocument();
    expect(await axe(app.container)).toHaveNoViolations();
  });
});

describe("dispensing (S7-F3, F4)", () => {
  it("identity first, a same-ingredient substitute with a reason, then labels", async () => {
    const app = await pharmacist();
    await app.router.navigate(`/pharmacy/prescriptions/${MOCK_RX_READY}`);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Mukamana Jeanne" }),
    ).toBeInTheDocument();
    const substitute = screen.getAllByRole("radio", { name: "Substitute" })[0]!;
    expect(substitute).toBeDisabled();

    await app.user.click(screen.getByRole("radio", { name: /Ticket, name and date of birth/ }));
    await app.user.click(substitute);
    const choose = await screen.findByRole("combobox", { name: "Substitute" });
    // Only the same ingredient and strength are offered.
    expect(
      within(choose).getByRole("option", { name: "Panadol 500 mg tablet" }),
    ).toBeInTheDocument();
    expect(within(choose).queryByRole("option", { name: /Ibuprofen/ })).not.toBeInTheDocument();
    await app.user.selectOptions(choose, "PARA500-P");
    // #134: part of it as a substitute; more than is left is refused before sending
    const howMany = screen.getByRole("spinbutton", { name: "How many" });
    await app.user.type(howMany, "99");
    await app.user.click(screen.getByRole("button", { name: "Sign and give" }));
    expect(await screen.findByText(/^Give \d+ or fewer\.$/)).toBeInTheDocument();
    await app.user.clear(howMany);
    await app.user.type(howMany, "6");
    await app.user.type(
      screen.getByRole("textbox", { name: "Why you substitute" }),
      "Out of the generic",
    );
    const amlodipine = screen.getByRole("group", { name: /Amlodipine/ });
    await app.user.click(within(amlodipine).getByRole("radio", { name: "Give all 30" }));
    await app.user.click(screen.getByRole("button", { name: "Sign and give" }));

    expect(await screen.findByText("Signed")).toBeInTheDocument();
    expect(
      screen.getByText(/instead of Paracetamol 500 mg tablet: Out of the generic/),
    ).toBeInTheDocument();
    // 6 of 30 given as the substitute: the rest stays open
    expect(
      within(screen.getByRole("group", { name: /Paracetamol/ })).getByRole("radio", {
        name: "Give all 24",
      }),
    ).toBeInTheDocument();
    await app.user.click(screen.getByRole("link", { name: "Print labels" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Dosing labels" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Panadol 500 mg tablet")).toBeInTheDocument();
    expect(screen.getByText(/Gatatu ku munsi/)).toBeInTheDocument();
  });

  it("a controlled medicine needs the extra confirmation; not available is recorded", async () => {
    const app = await pharmacist();
    await app.router.navigate(`/pharmacy/prescriptions/${MOCK_RX_CONTROLLED}`);
    await screen.findByRole("heading", { level: 1, name: "Niyonsaba Claudine" });
    await app.user.click(screen.getByRole("radio", { name: /Prescription code/ }));
    await app.user.type(
      screen.getByRole("textbox", { name: "Code shown by the patient" }),
      "RX-2026-000103",
    );
    // Morphine: no substitution allowed, so the choice is not offered.
    const morphine = screen.getByRole("group", { name: /Morphine/ });
    expect(within(morphine).queryByRole("radio", { name: "Substitute" })).not.toBeInTheDocument();
    await app.user.click(within(morphine).getByRole("radio", { name: "Give all 12" }));
    const arte = screen.getByRole("group", { name: /Artemether/ });
    await app.user.click(within(arte).getByRole("radio", { name: "Not available" }));
    await app.user.click(screen.getByRole("button", { name: "Sign and give" }));
    expect(await screen.findByText("Confirm the controlled medicine check.")).toBeInTheDocument();

    await app.user.click(screen.getByRole("checkbox", { name: /rules for controlled medicines/ }));
    await app.user.click(screen.getByRole("button", { name: "Sign and give" }));
    expect(await screen.findByText("Signed")).toBeInTheDocument();
    expect(screen.getByText(/controlled medicine checked/)).toBeInTheDocument();
    expect(screen.getByText(/not available, buy outside/)).toBeInTheDocument();
  });

  it("availability switches show the state in words", async () => {
    const app = await pharmacist();
    await app.router.navigate("/pharmacy/availability");
    const arte = await screen.findByRole("switch", { name: /Artemether-lumefantrine/ });
    expect(arte).not.toBeChecked();
    expect(screen.getByText("1 medicine out of stock")).toBeInTheDocument();
    await app.user.click(arte);
    await waitFor(() => expect(screen.getByText("0 medicines out of stock")).toBeInTheDocument());
  });
});

describe("prescription builder in the consultation (S7-F1)", () => {
  it("an allergy alert needs a reason before signing; signing issues the prescription", async () => {
    const app = await signIn("doctor@medilink.test");
    await app.router.navigate("/clinical/unsigned");
    await app.user.click(await screen.findByRole("link", { name: /Open the draft for Mukamana/ }));
    await screen.findByRole("heading", { level: 1, name: /^Consultation · Mukamana/ });
    const section = screen.getByRole("region", { name: "Prescription" });

    await app.user.click(await within(section).findByRole("button", { name: "Add a medicine" }));
    await app.user.type(within(section).getByRole("searchbox", { name: "Medicine" }), "amox");
    await app.user.click(
      await within(section).findByRole("button", { name: /^Amoxicillin 500 mg capsule/ }),
    );
    await app.user.type(within(section).getByRole("textbox", { name: "Dose" }), "1 capsule");
    await app.user.selectOptions(
      within(section).getByRole("combobox", { name: "How often" }),
      "tds",
    );
    await app.user.type(within(section).getByRole("spinbutton", { name: "Days" }), "5");
    expect(within(section).getByText("15 from dose, how often and days")).toBeInTheDocument();
    await app.user.click(within(section).getByRole("button", { name: "Add to prescription" }));
    expect(await within(section).findByRole("alert")).toHaveTextContent("Allergy: Penicillin");

    const search = screen.getByRole("combobox", { name: "Find an ICD-10 diagnosis" });
    await app.user.type(search, "malaria");
    const results = await screen.findByRole("listbox", { name: "Diagnoses found" });
    await app.user.click((await within(results).findAllByRole("option"))[0]!);
    await app.user.click(screen.getByRole("button", { name: "Sign and lock" }));
    expect(
      await screen.findByText("Give a reason for each allergy alert before signing."),
    ).toBeInTheDocument();

    await app.user.type(
      within(section).getByRole("textbox", { name: "Why you prescribe it anyway" }),
      "Tolerated before, mild rash only",
    );
    await app.user.click(within(section).getByRole("button", { name: "Save reason" }));
    expect(await within(section).findByText(/reason given: Tolerated before/)).toBeInTheDocument();
    await app.user.click(screen.getByRole("button", { name: "Sign and lock" }));
    expect(await screen.findByText(/^Signed by /)).toBeInTheDocument();
    const issued = screen.getByRole("region", { name: "Prescription" });
    expect(await within(issued).findByText(/^RX-2026-/)).toBeInTheDocument();
    expect(
      within(issued).getByRole("button", { name: /^Change\s*Amoxicillin/ }),
    ).toBeInTheDocument();
  });
});

describe("pharmacist question in the consultation (PQ3, #134)", () => {
  it("the doctor answers with a new addendum; the question then waits for the pharmacist", async () => {
    const app = await signIn("doctor@medilink.test");
    await app.router.navigate(`/clinical/consultations/${MOCK_PRESSURE_CONSULTATION}`);
    await screen.findByRole("heading", { level: 1, name: /^Consultation · Mukamana/ });
    const question = await screen.findByRole("group", { name: /^Question from Nshimiyimana/ });
    expect(question).toHaveTextContent("Continue 5 mg or change to 10 mg?");

    // an existing addendum can answer too; here the doctor writes a new one
    expect(within(question).getByRole("combobox", { name: "Answer with" })).toHaveValue("new");
    await app.user.click(within(question).getByRole("button", { name: "Send the answer" }));
    expect(within(question).getByText("Write the answer.")).toBeInTheDocument();
    await app.user.type(
      within(question).getByRole("textbox", { name: "Addendum reason" }),
      "Pharmacy question",
    );
    await app.user.type(
      within(question).getByRole("textbox", { name: "Your answer" }),
      "Continue 5 mg once a day.",
    );
    await app.user.click(within(question).getByRole("button", { name: "Send the answer" }));
    await stepUpIfAsked(app);
    expect(
      await screen.findByText("Answered. The pharmacist will close the question."),
    ).toBeInTheDocument();
    expect(await screen.findByText("Continue 5 mg once a day.")).toBeInTheDocument();
    expect(await axe(app.container)).toHaveNoViolations();
  });
});

/** Confirms the password when the step-up dialog opens (writing an addendum needs it). */
async function stepUpIfAsked(app: Awaited<ReturnType<typeof signIn>>) {
  const dialog = await screen.findByRole("dialog", undefined, { timeout: 1500 }).catch(() => null);
  if (!dialog) return;
  const password = within(dialog).queryByLabelText(/password/i);
  if (password) await app.user.type(password, MOCK_PASSWORD);
  const code = within(dialog).queryByLabelText(/6-digit code/i);
  if (code) await app.user.type(code, MOCK_TOTP_CODE);
  await app.user.click(within(dialog).getByRole("button", { name: /confirm|verify|continue/i }));
}
