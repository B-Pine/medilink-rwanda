import { expect, test, type Page } from "@playwright/test";

/**
 * S4 journey (sprint-04, FR-QUE): a walk-in is checked in at reception, called by the doctor and
 * completed. Runs against the staff-web mock build (MSW contract mocks, seed in
 * packages/api-client/src/mocks/features/queue.ts). The mock "server" lives in the page, so the
 * whole journey runs without a reload: one page load, then in-app navigation only.
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
  await page.getByRole("button", { name: /^Account menu: / }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page.getByLabel("Email")).toBeVisible();
}

const openQueue = (page: Page) =>
  page.getByRole("navigation", { name: "Main menu" }).getByRole("link", { name: "Queue" }).click();

test("walk-in: checked in at reception, called by the doctor, completed", async ({ page }) => {
  // Reception checks in a walk-in from the queue board.
  await page.goto("/queue");
  // English UI: the login page's language switch (the apps default to Kinyarwanda).
  await page.getByRole("combobox", { name: "Ururimi" }).selectOption("en");
  await logIn(page, "reception@medilink.test");
  await expect(page.getByRole("heading", { level: 1, name: "Queue" })).toBeVisible();
  const board = page.getByRole("table", { name: /General consultation/ });
  await expect(board).toBeVisible();
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
  const ticket = (await done.getByText(/^G-0\d\d$/).textContent())!.trim();
  await done.getByRole("button", { name: "Done" }).click();
  // waiting on the board
  await expect(board.getByRole("row").filter({ hasText: ticket })).toBeVisible();
  await logOut(page);

  // The doctor works through the queue until the walk-in is called, then sees and completes them.
  await logIn(page, "doctor@medilink.test");
  await page.getByRole("button", { name: "Work at Kigali Clinic" }).click();
  await openQueue(page);
  await expect(page.getByRole("heading", { level: 1, name: "My queue" })).toBeVisible();
  const current = page.getByRole("region", { name: "Current patient" });
  const callNext = page.getByRole("button", { name: "Call next" });
  const start = page.getByRole("button", { name: "Start consultation" });
  const complete = page.getByRole("button", { name: "Complete visit" });
  // the seed has a patient in consultation with this doctor
  await expect(complete).toBeVisible();

  let called = false;
  for (let turn = 0; turn < 10 && !called; turn++) {
    if (await start.isVisible()) {
      await start.click();
      await expect(complete).toBeVisible();
    }
    await complete.click();
    await expect(callNext).toBeEnabled();
    await callNext.click();
    await expect(start).toBeVisible();
    called = (await current.getByText(ticket, { exact: true }).count()) > 0;
  }
  expect(called, `ticket ${ticket} was never called`).toBe(true);
  await expect(current).toContainText("Called");

  await start.click();
  await expect(current).toContainText("In consultation");
  await complete.click();
  await expect(current.getByText(ticket, { exact: true })).toHaveCount(0);
  await expect(callNext).toBeVisible();
});
