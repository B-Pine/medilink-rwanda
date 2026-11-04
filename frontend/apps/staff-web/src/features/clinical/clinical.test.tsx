import { MOCK_NO_CARE_FP, MOCK_PASSWORD, MOCK_TOTP_CODE } from "@medilink/api-client/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { logIn, renderApp } from "../../test/render";

/** S6-F1..F6 (staff-web `clinical`) against the contract mocks. */

async function signIn(email = "doctor@medilink.test", path = "/today") {
  const app = renderApp(path);
  await logIn(app.user, email, MOCK_PASSWORD);
  await app.user.type(await screen.findByLabelText("6-digit code"), MOCK_TOTP_CODE);
  await app.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  // The doctor works at two facilities and chooses one first.
  const facility = await screen.findByRole("heading", {
    level: 1,
    name: /^(Choose your facility|Good (morning|afternoon|evening))/,
  });
  if (facility.textContent === "Choose your facility")
    await app.user.click(screen.getByRole("button", { name: "Work at Kigali Clinic" }));
  await screen.findByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ });
  return app;
}

/** Open yesterday's unsigned draft for Mukamana Jeanne from the Unsigned records list. */
async function openDraft(app: Awaited<ReturnType<typeof signIn>>) {
  await app.router.navigate("/clinical/unsigned");
  expect(
    await screen.findByRole("heading", { level: 1, name: "Unsigned records" }),
  ).toBeInTheDocument();
  await app.user.click(await screen.findByRole("link", { name: /Open the draft for Mukamana/ }));
  return screen.findByRole("heading", { level: 1, name: /^Consultation · Mukamana/ });
}

describe("doctor's day (upgrade 05 §3)", () => {
  it("Today shows my day, what waits for me, and the consultation says why the patient came", async () => {
    const app = await signIn();
    const day = await screen.findByRole("region", { name: "Your day" });
    expect(await within(day).findByText("Seen today")).toBeInTheDocument();
    expect(
      within(day).getByRole("link", { name: /Pharmacy question about Mukamana/ }),
    ).toBeInTheDocument();
    expect(await axe(app.container)).toHaveNoViolations();
    await openDraft(app);
    const reason = screen.getByRole("region", { name: "Why the patient came" });
    expect(within(reason).getByText(/my blood pressure tablets ran out/)).toBeInTheDocument();
    expect(within(reason).getByText("Be seen today")).toBeInTheDocument();
    // a dangerous number is flagged in words, not only in red
    expect(await screen.findByText("Very high blood pressure")).toBeInTheDocument();
  }, 40_000);
});

describe("doctor tools (upgrade 05 §3)", () => {
  it("answers a pharmacy question in one step", async () => {
    const app = await signIn();
    await app.router.navigate("/clinical/questions");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Pharmacy questions" }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Amlodipine 5 mg is out of stock/)).toBeInTheDocument();
    await app.user.type(screen.getByRole("textbox", { name: /Your answer/ }), "Yes, two tablets.");
    await app.user.click(screen.getByRole("button", { name: "Send answer" }));
    expect(await screen.findByText("No questions waiting")).toBeInTheDocument();
    expect(await axe(app.container)).toHaveNoViolations();
  }, 40_000);

  it("follow-ups by state, activity and templates", async () => {
    const app = await signIn();
    await app.router.navigate("/clinical/follow-ups");
    await app.user.click(await screen.findByRole("button", { name: /^Missed/ }));
    expect(await screen.findByRole("table", { name: "Missed" })).toBeInTheDocument();
    expect(screen.getByText("Habimana Jean")).toBeInTheDocument();

    await app.router.navigate("/clinical/activity");
    expect((await screen.findAllByText("Patients seen")).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Most frequent diagnoses" })).toBeInTheDocument();

    await app.router.navigate("/clinical/templates");
    expect(await screen.findByText("Fever (adult)")).toBeInTheDocument();
    await app.user.click(screen.getByRole("button", { name: "New template" }));
    await app.user.type(await screen.findByRole("textbox", { name: /^Name/ }), "Cough (child)");
    await app.user.click(screen.getByRole("button", { name: "Save template" }));
    expect(await screen.findByText("Cough (child)")).toBeInTheDocument();
    expect(await axe(app.container)).toHaveNoViolations();
  }, 60_000);

  it("a template fills an empty plan in the consultation", async () => {
    const app = await signIn();
    await openDraft(app);
    await app.user.click(screen.getByRole("button", { name: "Use a template" }));
    await app.user.click(await screen.findByRole("button", { name: /Hypertension review/ }));
    await app.user.click(await screen.findByRole("button", { name: "Back to the note" }));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Plan" })).toHaveValue(
        "Continue amlodipine. Check BP in one month.",
      ),
    );
  }, 40_000);
});

describe("doctor's quick note (W3, #202)", () => {
  it("an order set fills the note in one click and lists what it did", async () => {
    const app = await signIn();
    await openDraft(app);
    await app.user.click(screen.getByRole("button", { name: "Use a template" }));
    await app.user.click(await screen.findByRole("button", { name: /Uncomplicated malaria/ }));
    const summary = await screen.findByRole("list", { name: "What the template changed" });
    expect(within(summary).getByText(/Diagnosis added as provisional: B54/)).toBeInTheDocument();
    expect(within(summary).getByText(/Text added to: Plan/)).toBeInTheDocument();
    // lab tests are not ordered from a template yet, and the doctor is told so
    expect(within(summary).getByText(/Order them yourself: Malaria \(RDT\)/)).toBeInTheDocument();
    expect(await within(summary).findByText(/prescription: Paracetamol/)).toBeInTheDocument();
    await app.user.click(await screen.findByRole("button", { name: "Back to the note" }));
    const plan = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Plan" });
    expect(plan.value).toContain("Artemether-lumefantrine");
    const chosen = screen.getByRole("list", { name: "Chosen diagnoses" });
    expect(within(chosen).getByRole("button", { name: "Remove B54" })).toBeInTheDocument();
    // still a draft: the doctor signs
    expect(screen.getByRole("button", { name: "Sign and lock" })).toBeInTheDocument();
  }, 40_000);

  it("my frequent diagnoses are one click away", async () => {
    const app = await signIn();
    await openDraft(app);
    const frequent = await screen.findByRole("group", { name: "Your frequent diagnoses" });
    await app.user.click(within(frequent).getByRole("button", { name: /^Add B54/ }));
    const chosen = screen.getByRole("list", { name: "Chosen diagnoses" });
    expect(within(chosen).getByRole("button", { name: "Remove B54" })).toBeInTheDocument();
    // a chosen favourite leaves the shortcuts
    expect(within(frequent).queryByRole("button", { name: /^Add B54/ })).not.toBeInTheDocument();
    expect(await axe(app.container)).toHaveNoViolations();
  }, 40_000);
});

describe("results inbox (S6b R1)", () => {
  it("lists outside results to review and marks one reviewed", async () => {
    const app = await signIn();
    await app.router.navigate("/clinical/results");
    expect(await screen.findByRole("heading", { level: 1, name: "Results" })).toBeInTheDocument();
    await app.user.click(
      await screen.findByRole("button", { name: /Mark reviewed: Chest X-ray report/ }),
    );
    await waitFor(() => expect(screen.queryByText("Chest X-ray report")).not.toBeInTheDocument());
    expect(screen.getByText(/Kidney function/)).toBeInTheDocument();
    expect(await axe(app.container)).toHaveNoViolations();
  }, 40_000);
});

describe("consultation page (S6-F1, F2, F3)", () => {
  it("one scroll with anchors, autosave status, permanent allergy banner, private notes marked", async () => {
    const app = await signIn();
    await openDraft(app);
    expect(screen.getByRole("navigation", { name: "Consultation sections" })).toBeInTheDocument();
    // The allergy banner shows the allergy as text, not only as a colour or icon.
    expect(screen.getByText(/Penicillin/)).toBeInTheDocument();
    expect(screen.getByText("Never shown to the patient")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Private notes/ })).toBeInTheDocument();

    const plan = screen.getByRole("textbox", { name: "Plan" });
    await app.user.type(plan, " Review in two days.");
    expect(await screen.findByText(/^Draft · (changes not saved yet|saved)/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/^Draft · saved /)).toBeInTheDocument(), {
      timeout: 5000,
    });
    expect(await axe(app.container)).toHaveNoViolations();
  });

  it("ICD-10 type-ahead in plain language; primary and certainty; sign and lock", async () => {
    const app = await signIn();
    await openDraft(app);
    const search = screen.getByRole("combobox", { name: "Find an ICD-10 diagnosis" });
    await app.user.type(search, "malaria");
    const results = await screen.findByRole("listbox", { name: "Diagnoses found" });
    const option = await within(results).findAllByRole("option");
    expect(option.length).toBeGreaterThan(0);
    await app.user.click(option[0]!);
    const chosen = screen.getByRole("list", { name: "Chosen diagnoses" });
    expect(within(chosen).getAllByRole("listitem").length).toBeGreaterThan(0);

    await app.user.click(screen.getByRole("button", { name: "Sign and lock" }));
    expect(await screen.findByText(/^Signed by /)).toBeInTheDocument();
    // Signed records are locked: no editing, no second signature.
    expect(screen.queryByRole("button", { name: "Sign and lock" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Plan" })).not.toBeInTheDocument();
  });
});

describe("history and access (S6-F4, F5)", () => {
  it("the history drawer opens beside the record with filters and the problem summary", async () => {
    const app = await signIn();
    await openDraft(app);
    await app.user.click(screen.getByRole("button", { name: "History" }));
    const drawer = await screen.findByRole("dialog", { name: /^History · Mukamana/ });
    expect(
      await within(drawer).findByRole("heading", { name: "Problem summary" }),
    ).toBeInTheDocument();
    expect(within(drawer).getByRole("group", { name: "Filter the history" })).toBeInTheDocument();
    expect(await within(drawer).findByText(/Hypertension/)).toBeInTheDocument();
    expect(await axe(drawer)).toHaveNoViolations();
  });

  it("a patient not in care is blocked until a reason is given", async () => {
    const app = await signIn();
    await app.router.navigate(`/clinical/patients/${MOCK_NO_CARE_FP}/history`);
    const prompt = await screen.findByRole("heading", {
      name: "Why are you opening this record?",
    });
    expect(prompt).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Problem summary" })).not.toBeInTheDocument();
    await app.user.selectOptions(screen.getByLabelText("Reason"), "care_continuity");
    await app.user.click(screen.getByRole("button", { name: "Open record" }));
    expect(await screen.findByRole("heading", { name: "Problem summary" })).toBeInTheDocument();
  });
});

describe("role gating (S6-F1)", () => {
  it("reception has no consultation or unsigned-records actions", async () => {
    const app = await signIn("reception@medilink.test");
    await app.router.navigate("/clinical/unsigned");
    expect(
      await screen.findByRole("heading", { level: 1, name: "You don't have access to this page" }),
    ).toBeInTheDocument();
  });
});
