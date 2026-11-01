import { expect, test } from "@playwright/test";

/**
 * Pre-rendered public pages (ADR 0008, design 06 H8) on the patient-web mock build: the content is
 * in the HTML before JavaScript runs, and hydration doesn't change what is visible.
 */
const PATIENT = "http://localhost:4174";

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  for (const path of ["/", "/for-facilities"]) {
    test(`${path} is readable from the HTML alone`, async ({ page }) => {
      await page.goto(PATIENT + path);
      await expect(page.locator("html")).toHaveAttribute("lang", "rw");
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page).toHaveTitle(/ · MediLink Rwanda$/);
    });
  }

  test("a facility page is pre-rendered from the public profile", async ({ page }) => {
    await page.goto(PATIENT + "/facilities/kigali-clinic");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Kigali Clinic");
  });
});

test("hydration keeps the pre-rendered landing page as it is", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  const response = await page.request.get(PATIENT + "/");
  const html = await response.text();
  const prerendered = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1]?.replace(/<[^>]+>/g, "");

  await page.goto(PATIENT + "/");
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText(prerendered!.trim());
  // interactive once hydrated: the language switch re-renders the page in English
  await page.getByRole("combobox", { name: "Ururimi" }).selectOption("en");
  await expect(heading).not.toHaveText(prerendered!.trim());
  expect(errors.filter((e) => /hydrat|did not match/i.test(e))).toEqual([]);
});
