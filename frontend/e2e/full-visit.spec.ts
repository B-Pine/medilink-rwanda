import { expect, test, type Page } from "@playwright/test";

/**
 * Full visit (upgrade 13 W10, #209): every station of an outpatient visit in one session, against
 * the staff-web mock build. The mock "server" lives in the page, so the journey never reloads: one
 * page load, then in-app navigation and log-ins only.
 *
 * - Reception checks in a walk-in.
 * - The triage nurse takes vitals and sends the next triage patient to the doctor (#200).
 * - The doctor orders a malaria test for the patient in consultation (Uwase Claudine) and sends
 *   her to the lab; the lab technician enters the result; she comes back to the same doctor, who
 *   reviews it and releases it to her (#201).
 * - The pharmacist gives a prescription and prints the labels with their pictograms (#207).
 *
 * Payment is covered by the cashier tests; the patient's view of a released result by patient-web.
 */
// MOCK_PASSWORD and MOCK_TOTP_CODE in packages/api-client/src/mocks/data.ts (test fixtures)
const PASSWORD = "MediLink-demo-2026";
const TOTP = "123456";

async function logIn(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByLabel("6-digit code").fill(TOTP);
  await page.getByRole("button", { name: "Verify and log in" }).click();
}

async function logOut(page: Page) {
  await page.getByRole("button", { name: /Account menu$/ }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page.getByLabel("Email")).toBeVisible();
}

const menu = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Main menu" }).getByRole("link", { name }).click();

test("full visit: reception, triage, doctor, laboratory, doctor again, pharmacy", async ({
  page,
}) => {
  test.setTimeout(420_000);
  await page.goto("/queue");
  await page.getByRole("combobox", { name: "Ururimi" }).selectOption("en");

  // ---- Reception: a walk-in is checked in
  await logIn(page, "reception@medilink.test");
  await expect(page.getByRole("heading", { level: 1, name: "Queue" })).toBeVisible();
  await page.getByRole("button", { name: "Check in patient" }).click();
  const checkIn = page.getByRole("dialog", { name: "Check in a patient" });
  const find = checkIn.getByRole("combobox", { name: "Find a patient" });
  await find.fill("Mukamana");
  await find.press("Enter");
  await checkIn
    .getByRole("button", { name: /Choose/ })
    .first()
    .click();
  await checkIn.getByRole("button", { name: "Check in" }).click();
  const done = page.getByRole("dialog", { name: "Checked in" });
  await expect(done.getByText(/^G-0\d\d$/)).toBeVisible();
  await done.getByRole("button", { name: "Done" }).click();
  await logOut(page);

  // ---- Triage nurse: vitals, urgency, to the doctor
  await logIn(page, "triage@medilink.test");
  await menu(page, "Triage");
  await expect(page.getByRole("heading", { level: 1, name: "Triage" })).toBeVisible();
  await page.getByRole("button", { name: "Call next" }).click();
  await page.getByRole("button", { name: "Start triage" }).click();
  await page.getByLabel(/^Temperature/).fill("37.8");
  await page.getByRole("button", { name: "Save vitals" }).click();
  await expect(page.getByLabel("Why no vitals?")).toHaveCount(0);
  await page.getByRole("button", { name: "Send to the doctor" }).click();
  await expect(page.getByText(/is waiting for the doctor/)).toBeVisible();
  await logOut(page);

  // ---- Doctor: orders a malaria test and sends the patient to the lab
  await logIn(page, "doctor@medilink.test");
  await page.getByRole("button", { name: "Work at Kigali Clinic" }).click();
  await menu(page, "Queue");
  await expect(page.getByRole("heading", { level: 1, name: "My queue" })).toBeVisible();
  const current = page.getByRole("region", { name: "Current patient" });
  await expect(current).toContainText("Uwase C.");
  await page.getByRole("link", { name: "Open record" }).click();
  const order = page.getByRole("form", { name: "Order tests" });
  await order.getByRole("checkbox", { name: /Malaria rapid test/ }).check();
  await order.getByLabel(/Why these tests/).fill("Fever for 2 days, rule out malaria.");
  await order.getByRole("button", { name: "Order" }).click();
  await page.getByRole("button", { name: "Send to lab" }).click();
  // the mock consultation carries a seeded patient name, so match the message, not the name
  await expect(page.getByText(/is on the way to the lab/)).toBeVisible();
  await logOut(page);

  // ---- Laboratory: the patient already there first, then ours
  await logIn(page, "lab@medilink.test");
  await menu(page, "Laboratory");
  await expect(page.getByRole("heading", { level: 1, name: "Laboratory" })).toBeVisible();
  await page.getByRole("button", { name: "Call next" }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByText("Uwimana Grace").first()).toBeVisible();
  await page.getByRole("button", { name: "Sample taken: Malaria rapid test (RDT)" }).click();
  await page.getByRole("button", { name: "Sample taken: Full blood count" }).click();
  const graceRdt = page.getByRole("form", { name: "Enter the result: Malaria rapid test (RDT)" });
  await graceRdt.getByLabel("Result").selectOption("negative");
  await graceRdt.getByRole("button", { name: "Save result" }).click();
  const fbc = page.getByRole("form", { name: "Enter the result: Full blood count" });
  await fbc.getByLabel("Haemoglobin (g/dL)").fill("12.8");
  await fbc.getByLabel("White cells (×10⁹/L)").fill("6.2");
  await fbc.getByLabel("Platelets (×10⁹/L)").fill("240");
  await fbc.getByRole("button", { name: "Save result" }).click();
  const doneToday = page.getByRole("region", { name: /^Done today/ });
  await expect(doneToday).toContainText("Uwimana Grace");

  await page.getByRole("button", { name: "Call next" }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("button", { name: "Sample taken: Malaria rapid test (RDT)" }).click();
  const rdt = page.getByRole("form", { name: "Enter the result: Malaria rapid test (RDT)" });
  await rdt.getByLabel("Result").selectOption("positive");
  await rdt.getByRole("button", { name: "Save result" }).click();
  await expect(page.getByText(/Every result is in. .* goes back to the doctor./)).toBeVisible();
  await expect(doneToday.getByRole("listitem")).toHaveCount(2);
  await logOut(page);

  // ---- Doctor again: the patient is back first; review and release the result
  await logIn(page, "doctor@medilink.test");
  await page.getByRole("button", { name: "Work at Kigali Clinic" }).click();
  await menu(page, "Queue");
  // emergencies go first; the doctor sees whoever is called until the lab patient is back
  const callNext = page.getByRole("button", { name: "Call next", exact: true });
  const start = page.getByRole("button", { name: "Start consultation" });
  const complete = page.getByRole("button", { name: "Complete visit" });
  let back = false;
  for (let turn = 0; turn < 8 && !back; turn++) {
    await callNext.click();
    await expect(start).toBeVisible();
    back = (await current.getByText("Uwase C.").count()) > 0;
    if (!back) {
      await start.click();
      await complete.click();
      await expect(callNext).toBeEnabled();
    }
  }
  expect(back, "the lab patient never came back to the doctor").toBe(true);
  await start.click();
  await page.getByRole("link", { name: "Open record" }).click();
  await page
    .getByRole("textbox", { name: "Note for the patient" })
    .fill("Malaria: take the tablets for 3 days and come back if the fever stays.");
  await page.getByRole("button", { name: "Mark reviewed: Malaria rapid test (RDT)" }).click();
  await page
    .getByRole("button", { name: "Release to the patient: Malaria rapid test (RDT)" })
    .click();
  await expect(page.getByText("Released").first()).toBeVisible();
  await logOut(page);

  // ---- Pharmacy: give a prescription and print labels with pictograms
  await logIn(page, "pharmacist@medilink.test");
  await menu(page, "Pharmacy");
  await page
    .getByRole("link", { name: /Mukamana Jeanne/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Mukamana Jeanne" })).toBeVisible();
  await page.getByRole("radio", { name: /Ticket, name and date of birth/ }).click();
  for (const giveAll of await page.getByRole("radio", { name: /^Give all/ }).all())
    await giveAll.check({ force: true });
  await page.getByRole("button", { name: "Sign and give" }).click();
  await expect(page.getByText("Signed")).toBeVisible();
  await page.getByRole("link", { name: "Print labels" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Dosing labels" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Igihe cyo kuwunywa" }).first()).toBeVisible();
});
