// Scratch helper (not committed): screenshot pages of the mock site, desktop and phone.
import { chromium } from "@playwright/test";
const out = process.argv[2];
const pages = process.argv.slice(3);
const lang = process.env.LANG_CODE || "en";
const port = process.env.PORT_NO || "5174";
const sizes = (process.env.SIZES || "d,m").split(",");
const browser = await chromium.launch();
const all = [
  ["d", { width: 1440, height: 900 }],
  ["m", { width: 390, height: 844 }],
];
for (const [name, viewport] of all.filter(([n]) => sizes.includes(n))) {
  const ctx = await browser.newContext({
    viewport,
    colorScheme: process.env.DARK ? "dark" : "light",
    reducedMotion: "reduce",
  });
  await ctx.addInitScript((l) => {
    try {
      localStorage.setItem("medilink.language", l);
    } catch {
      /* ignore */
    }
  }, lang);
  const page = await ctx.newPage();
  for (const path of pages) {
    await page.goto(`http://localhost:${port}${path}`, { waitUntil: "networkidle" });
    await page.locator("main h1").first().waitFor({ timeout: 20000 }).catch(() => {});
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
    const file = `${out}/${name}${path.replace(/[/?=&]/g, "_") || "_home"}.png`;
    await page.screenshot({ path: file, fullPage: true });
    const words = await page.evaluate(
      () => document.querySelector("main")?.innerText.split(/\s+/).filter(Boolean).length ?? 0,
    );
    console.log(name, path, "words", words);
  }
  await ctx.close();
}
await browser.close();
