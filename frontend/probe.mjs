import { chromium } from "@playwright/test";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errors = [];
p.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
p.on("pageerror", (e) => errors.push("PAGEERROR " + e.message.slice(0, 160)));
await p.goto("http://localhost:5174/", { waitUntil: "networkidle" });
await p.waitForTimeout(3000);
const info = await p.evaluate(() => [...document.querySelectorAll("main > *, main section")].slice(0, 30).map((el) => {
  const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
  return `${el.tagName}.${(el.className || "").toString().slice(0, 50)} y=${Math.round(r.top + scrollY)} h=${Math.round(r.height)} op=${cs.opacity} vis=${cs.visibility} | ${(el.querySelector("h2,h1")?.textContent || "").slice(0, 40)}`;
}));
console.log(info.join("\n")); console.log("ERR", errors.slice(0, 8).join("\n"));
console.log("lang", await p.evaluate(() => [document.documentElement.lang, localStorage.getItem("medilink.language")]));
await b.close();
