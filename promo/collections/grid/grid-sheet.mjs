// grid-candidates.png: the two marked cards of Popular, the admins' liked palettes considered for each slot, and the
// page with the two chosen in place (a screenshot of the promo's preview, http://127.0.0.1:25340, with replace.sql).
//   node grid-sheet.mjs <out.png>
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const out = process.argv[2] ?? `${process.env.WORK}/grid/candidates.png`;
const here = new URL(".", import.meta.url).pathname;
const { grid, candidates } = JSON.parse(readFileSync(`${here}candidates.json`, "utf8"));
const v1 = readFileSync(`${process.env.WORK}/frames/ui-dark/f00030.png`).toString("base64");
const find = (seed, style, steps, angle) =>
  candidates.find(c => c.seed === seed && c.style === style && c.steps === steps && c.angle === angle);
/* the soft, luminous ones looked at for each slot, in the views the admins liked them in; the first is the one chosen */
const SLOT_A = [
  ["kY70SMeJm-3mdOrzGrr66E6eWrPS", "linearGradient", 6, 345],
  ["kW6Wp47CTBOGfR3XvMQTdBA4", "linearGradient", 26, 240],
  ["kY5iKrdhA03SRt5vF7S6aW7OqXvY", "linearGradient", 7, 225],
  ["kYxo_mZTW_WijPrskry8RC4HUcu-", "linearGradient", 6, 45],
  ["kUvG4I36M8GqcNj3Jjfg", "linearGradient", 10, 225],
  ["kW4ihe8xe522aOLnGjnaI05o", "linearGradient", 32, 225],
  ["kcxqPpaL-_24twByoT-chNIO8qRRmNMGV7TCI", "linearGradient", 8, 45],
  ["kY2kfzcZ0_fkKPr7hrNdg9CGwYQ0", "linearGradient", 6, 315]
].map(a => find(...a));
const SLOT_B = [
  ["kUtmXN5yfCHMZwV4hzmA", "linearGradient", 6, 315],
  ["ka5yhI-B1FPgdQn0EsV7hlJeyrw1tKkGA", "linearGradient", 13, 0],
  ["kY2VCbcqe-Pakvz4HUAeA1C_aQTI", "linearGradient", 6, 135],
  ["kY0lD9bZzA3UPxj7mcc-55APsgwC", "linearGradient", 7, 180],
  ["kYq3393SdBeWVxTunka9rBB_c0wI", "linearGradient", 10, 150],
  ["kU0Eeu7B8--4Xwztn0VA", "linearGradient", 5, 45],
  ["kW1Tq37ZnCvEcxTwIMFbiS_w", "linearGradient", 7, 315]
].map(a => find(...a));
const month = ms => new Date(ms > 1e11 ? ms : ms * 1000).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/* the page now: the simplified grid of v1's capture, three rows, on the promo's own data */
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1300 }, deviceScaleFactor: 1, colorScheme: "dark", serviceWorkers: "block" });
await ctx.addInitScript(() => localStorage.setItem("grabient-theme", "dark"));
const v1css = readFileSync(`${here}../capture/simplify.css`, "utf8");
await ctx.addInitScript(c => {
  const add = () => {
    const s = document.createElement("style");
    s.textContent = c;
    document.head.append(s);
  };
  if (document.head) add();
  else document.addEventListener("DOMContentLoaded", add, { once: true });
}, v1css);
await ctx.route("**/*", r => (new URL(r.request().url()).host === "127.0.0.1:25340" ? r.continue() : r.abort()));
const pg = await ctx.newPage();
await pg.goto("http://127.0.0.1:25340/palettes", { waitUntil: "networkidle" });
await pg.waitForTimeout(1500);
const now = (await pg.screenshot({ clip: { x: 0, y: 40, width: 1600, height: 1180 } })).toString("base64");
await pg.close();

const card = (c, chosen) => `<div class="c${chosen ? " chosen" : ""}"><div class="p" style="background:${c.css}"></div>
  <div class="m"><span>${month(c.created_at)}</span><span>${c.likes} likes · rank ${c.rank + 1}</span></div>
  <div class="s">${c.seed}<br>${c.style.replace("Gradient", " gradient")}, ${c.steps} steps, ${c.angle}°</div></div>`;
const row = (cards, slot) => cards.map((c, i) => card(c, i === 0)).join("");
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#0c0c0e;color:#ececea;font:14px/1.45 system-ui,sans-serif;padding:28px 32px;width:1640px}
h1{font-size:22px;font-weight:600;margin:0 0 6px}h2{font-size:16px;font-weight:600;margin:28px 0 4px}p{margin:0 0 12px;color:#a8a8a6;max-width:1500px}
.two{display:flex;gap:24px}.two figure{margin:0}.two img{width:800px;display:block;border-radius:6px}figcaption{color:#a8a8a6;margin-top:6px}
.mark{position:relative}.mark i{position:absolute;border:3px solid #e33;border-radius:6px}
.row{display:grid;grid-template-columns:repeat(8,190px);gap:16px}
.c .p{height:164px;border-radius:8px}.c.chosen .p{outline:3px solid #ececea;outline-offset:3px}
.m{display:flex;justify-content:space-between;color:#9a9a98;font-size:12px;margin-top:7px}.s{color:#6d6d6b;font-size:10.5px;word-break:break-all;margin-top:2px}
</style>
<h1>Popular's two marked cards, replaced in the promo's own data</h1>
<p>Only the preview's local copy of the data changed (grid/replace.sql): the two marked palettes left Popular's order, and two palettes the admins liked, in the views they liked them in, took the likes counts that land them in the same two places. Every other card keeps its place.</p>
<div class="two">
<figure class="mark"><img src="data:image/png;base64,${v1}"><i style="left:${1206 / 2 - 3}px;top:${448 / 2 - 3}px;width:${346 / 2}px;height:${300 / 2}px"></i><i style="left:${820 / 2 - 3}px;top:${832 / 2 - 3}px;width:${346 / 2}px;height:${68 / 2}px"></i><figcaption>Before: v1's wide shot, the two cards marked (navy, gold and brown; cream, orange, black and teal bands)</figcaption></figure>
<figure><img src="data:image/png;base64,${now}"><figcaption>After: the page the promo captures, three rows (v2's frames show the first two under the wordmark)</figcaption></figure>
</div>
<h2>The second row's fourth, under the hero: candidates (the first is chosen)</h2>
<p>Chosen: peach into mint, 11 likes. Soft and bright, warm at the top where it meets the cyan to green hero above it and cool at the bottom where it meets the pink below; no other card in view shares its pairing, so the hero keeps the eye.</p>
<div class="row">${row(SLOT_A)}</div>
<h2>The third row's third, between peach and pink: candidates (the first is chosen)</h2>
<p>Chosen: pale lilac into violet. A cool, quiet note between the two warm pastels beside it, close in tone to the sky and lavender above it, with no dark band, so the row reads as one light run.</p>
<div class="row">${row(SLOT_B)}</div>`;
const page = await browser.newPage({ viewport: { width: 1704, height: 900 } });
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`wrote ${out}`);
