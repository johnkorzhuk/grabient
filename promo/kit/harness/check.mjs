// The harness against the site: the real header's wordmark over the real water on a brand page (its bar open on the
// water, as the promo draws it), next to the harness's wordmark over its water at the same place and size, holding the
// same colors, at the same age of the water.
//   node check.mjs [--theme dark] [--out ../harness-check.png]     (the preview on 25340 and the harness on 25341 running)
import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const THEME = arg("theme", "dark");
/* the site's chance, seeded, so its water picks the same palettes on every run */
const SEED = Number(arg("seed", "7"));
const OUT = arg("out", `${process.env.PROMO_WORK ?? "."}/harness-check-${THEME}`);
const AGE = 4; // seconds of water before the picture
const REGION = { x: 0, y: 0, width: 560, height: 260 };
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars"]
});

/* the site: a brand page, whose header has no surface and leaves the wordmark's bar open on the water */
const site = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2, colorScheme: THEME, serviceWorkers: "block" });
await site.addInitScript(
  ([t, seed]) => {
    try {
      localStorage.setItem("grabient-theme", t);
      localStorage.setItem("grabient-water", "software");
    } catch {}
    let s = seed | 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let x = Math.imul(s ^ (s >>> 15), 1 | s);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  },
  [THEME, SEED]
);
await site.route("**/*", r => (new URL(r.request().url()).host === "127.0.0.1:25340" ? r.continue() : r.abort()));
const sp = await site.newPage();
/* the site's clock is Playwright's, stepped a frame at a time as the capture steps it, so its water's age is exact */
await sp.clock.install({ time: new Date("2026-10-14T16:00:00Z") });
await sp.goto("http://127.0.0.1:25340/privacy", { waitUntil: "networkidle" });
let steps = 0;
while (!(await sp.$("header svg[data-window]"))) {
  await sp.clock.runFor(33);
  if (++steps > 600) throw new Error("the site's water never drew");
}
/* the water's first frame lit the header's window; AGE seconds more of frames */
for (let i = 0; i < AGE * 30; i++) await sp.clock.runFor(1000 / 30);
/* CDP's own screenshot: Playwright's waits for an animation frame, which the paused clock never gives */
const siteCdp = await site.newCDPSession(sp);
const siteShot = Buffer.from((await siteCdp.send("Page.captureScreenshot", { format: "png", clip: { ...REGION, scale: 2 } })).data, "base64");
const seen = await sp.evaluate(() => {
  const svg = document.querySelector("header svg[aria-label=Grabient]");
  const r = svg.getBoundingClientRect();
  return {
    mark: { x: r.x, y: r.y, h: r.height },
    stops: [...svg.querySelectorAll("stop")].map(s => {
      const [r0, g, b] = getComputedStyle(s).stopColor.match(/\d+/g).map(Number);
      return `#${[r0, g, b].map(v => v.toString(16).padStart(2, "0")).join("")}`;
    })
  };
});
console.log(`site: lit after ${steps} steps, then ${AGE * 30} frames; wordmark ${JSON.stringify(seen.mark)}, ${seen.stops.length} stops, ${seen.stops.filter((_, i) => i % 16 === 0).join(" ")}`);
await site.close();

/* the harness: the same place, size and colors, the water drawn to the same age */
const hp = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
await hp.goto(`http://127.0.0.1:25341/?theme=${THEME}`);
await hp.waitForFunction(() => typeof window.__setup === "function");
const view = { seed: "kWs2um4jE-G62O7xwb3bkk-4", style: "linearGradient", steps: 5, angle: 90 };
await hp.evaluate(cfg => window.__setup(cfg), { hero: view, page: [view], glowView: view, heroHexes: seen.stops });
await hp.waitForFunction(() => window.__ready === true);
for (let i = 0; i <= AGE * 30; i++) {
  await hp.evaluate(inp => window.__frame(inp), {
    t: 1000 + (i * 1000) / 30,
    mark: seen.mark,
    paint: "hero",
    brand: false,
    aim: { x: 800, y: 450 },
    glow: null
  });
}
await hp.evaluate(() => window.__layer("both"));
const hCdp = await hp.context().newCDPSession(hp);
const harnessShot = Buffer.from((await hCdp.send("Page.captureScreenshot", { format: "png", clip: { ...REGION, scale: 2 } })).data, "base64");
writeFileSync(`${OUT}-site.png`, siteShot);
writeFileSync(`${OUT}-harness.png`, harnessShot);
await browser.close();
console.log(`wrote ${OUT}-site.png and ${OUT}-harness.png`);
