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
  // interactive once hydrated: the language switch re-renders the page in English. A change
  // made before React attaches is lost, so retry until hydration has taken over.
  await expect(async () => {
    await page.getByRole("combobox", { name: "Ururimi" }).first().selectOption("en");
    await expect(heading).not.toHaveText(prerendered!.trim(), { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  expect(errors.filter((e) => /hydrat|did not match/i.test(e))).toEqual([]);
});

/**
 * Public site audit 2026-11-07 (A1 #1–2): every doctor and service link on the directories opens a
 * real page with its own <h1>, never "not found".
 */
for (const [list, prefix, missing] of [
  ["/doctors", "/doctors/", "Doctor not found"],
  ["/services", "/services/", "Service not found"],
] as const) {
  test(`every link on ${list} opens its page`, async ({ page }) => {
    // English names, so "not found" is matched in one language (the site defaults to Kinyarwanda)
    await page.addInitScript({ content: `localStorage.setItem("medilink.language", "en")` });
    await page.goto(PATIENT + list);
    const links = page.locator(`main a[href^="${prefix}"]`);
    await expect(links.first()).toBeVisible();
    const hrefs = new Set<string>();
    for (const link of await links.all()) hrefs.add((await link.getAttribute("href")) ?? "");
    expect(hrefs.size).toBeGreaterThan(3);
    for (const href of hrefs) {
      await page.goto(PATIENT + href);
      const heading = page.getByRole("heading", { level: 1 });
      await expect(heading).toHaveCount(1);
      await expect(heading, href).not.toHaveText(missing);
    }
  });
}
