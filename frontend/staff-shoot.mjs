// Scratch helper (not committed): sign in to the staff mock and screenshot pages.
import { chromium } from "@playwright/test";
const out = process.argv[2];
const pages = process.argv.slice(3);
const user = process.env.STAFF || "admin";
const port = process.env.PORT_NO || "5175";
const full = !!process.env.FULL;
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: process.env.DARK ? "dark" : "light",
  reducedMotion: "reduce",
});
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("medilink.language", "en");
  } catch {
    /* ignore */
  }
});
const page = await ctx.newPage();
await page.goto(`http://localhost:${port}/login`, { waitUntil: "networkidle" });
await page.locator('input[type="email"]').fill(`${user}@medilink.test`);
await page.locator('input[type="password"]').fill("MediLink-demo-2026");
await page.locator('button[type="submit"]').first().click();
await page.waitForURL(/mfa|select-facility|today|\/$/, { timeout: 20000 }).catch(() => {});
if (page.url().includes("mfa")) {
  await page.locator("input").first().fill("123456");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(Number(process.env.WAIT || 1500));
}
if (page.url().includes("select-facility")) {
  await page.locator("main button, main a").first().click();
  await page.waitForTimeout(Number(process.env.WAIT || 1500));
}
console.log("after login", page.url());
const tag = process.env.DARK ? "dark" : "light";
for (const path of pages) {
  await page.goto(`http://localhost:${port}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(Number(process.env.WAIT || 1500));
  const file = `${out}/staff-${user}-${tag}${path.replace(/[/?=&]/g, "_")}.png`;
  await page.screenshot({ path: file, fullPage: full });
  const words = await page.evaluate(
    () => document.querySelector("main")?.innerText.split(/\s+/).filter(Boolean).length ?? 0,
  );
  console.log(path, "words", words);
}
await browser.close();
