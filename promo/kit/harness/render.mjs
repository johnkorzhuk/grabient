// Draws a promo's water and wordmark, frame by frame, from its timeline, in the harness (dist/, built by
// ../build-harness.sh and served on http://127.0.0.1:25361 by `python3 -m http.server 25361 --bind 127.0.0.1 --directory
// dist`).
//
//   source ../../env.sh
//   node render.mjs --theme dark|light --timeline <timeline.json> --page <page.json> --out <folder>
//     [--variant tweet|email] [--warm 200] [--fade 30] [--stop <frame>] [--dsf 2] [--marks-only]
//
// The tweet's water runs on the loop's own frames; the newsletter's on its shorter loop (timeline.email.map: each of its
// frames shows a loop frame), so its last frames lead into its own first frame as the tweet's do.
// The run starts `warm` frames before the previous loop and draws every frame at 1/30 s to the loop's last, so the frames
// kept (the previous loop's last `fade` frames, for the seam's dissolve, then the whole loop) stand on a water that has
// filled the page and holds a loop's history. The schedule repeats every loop, so the frames before the loop's first are
// what the loop's last frames lead into. Each kept frame is two pictures at deviceScaleFactor 2: w<k>.png, the water
// (opaque, over the timeline's extent: the page and the margins the end card's and the cards' cameras reach, the page
// set in it at the timeline's offset), and m<k>.png, the wordmark alone on no ground with the water in its open bar,
// clipped to its box; k = loop frame + fade. meta.json keeps each frame's wordmark box, bar and clip, in the extent's
// pixels.
// Chrome draws WebGL2 on SwiftShader, as capture.mjs launches it; time is the driver's (public/shim.js).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const here = new URL(".", import.meta.url).pathname;
const THEME = arg("theme", "dark");
const VARIANT = arg("variant", "tweet");
const need = name => arg(name) ?? (() => { throw new Error(`Give --${name}`); })();
const OUT = need("out");
const timeline = JSON.parse(readFileSync(need("timeline"), "utf8"));
const palettes = JSON.parse(readFileSync(need("page"), "utf8"));
/* the loop frame each of this run's frames shows */
const loopOf = VARIANT === "email" ? timeline.email.map : timeline.frames.map((_, f) => f);
const L = loopOf.length;
const WARM = Number(arg("warm", "200"));
const FADE = Number(arg("fade", String(timeline.parts.fade)));
/* the last of this run's frames to draw: a short run for a check stops early */
const STOP = Number(arg("stop", String(L - 1)));
const START = Number(arg("start", String(-L - WARM)));
const URL_ = arg("url", "http://127.0.0.1:25361/");
const DT = 1000 / timeline.fps;
/* device pixels per CSS pixel: 2 for the frames kept, 1 for a quick look at the whole loop */
const DSF = Number(arg("dsf", "2"));
/* the wordmark alone, for a larger video: the water never draws past twice the CSS pixels (its canvas caps the device
   ratio at 2), so a run at a higher ratio redraws only the letters and the bar, and the video takes the water from
   the ratio-2 run of the same timeline */
const MARKS_ONLY = process.argv.includes("--marks-only");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars"]
});
/* the page sits at OFFSET in a canvas of EXTENT: every place the timeline gives in the page is moved by OFFSET */
const OFFSET = timeline.offset ?? { x: 0, y: 0 };
const EXTENT = timeline.extent ?? { w: 1600, h: 900 };
const moved = p => p && { ...p, x: p.x + OFFSET.x, y: p.y + OFFSET.y };
const page = await browser.newPage({ viewport: { width: EXTENT.w, height: EXTENT.h }, deviceScaleFactor: DSF });
const problems = [];
page.on("pageerror", e => problems.push(String(e)));
page.on("console", m => {
  if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) problems.push(m.text());
});
await page.goto(`${URL_}?theme=${THEME}`);
await page.waitForFunction(() => typeof window.__setup === "function");
await page.evaluate(cfg => window.__setup(cfg), { hero: palettes.hero, page: palettes.page.slice(0, 8), glowView: palettes.hero });
await page.waitForFunction(() => window.__ready === true);
const cdp = await page.context().newCDPSession(page);
await cdp.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });

const shoot = async (clip, file) => {
  const shot = await cdp.send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: DSF } });
  writeFileSync(file, Buffer.from(shot.data, "base64"));
};
const meta = [];
const t0 = Date.now();
for (let f = START; f <= STOP; f++) {
  const s = timeline.frames[loopOf[((f % L) + L) % L]];
  const input = { t: 1000 + (f - START) * DT, mark: moved(s.mark), paint: s.paint, brand: s.brand, aim: moved(s.aim), glow: moved(s.glow) };
  const r = await page.evaluate(i => window.__frame(i), input);
  if (r.ticks < 1) throw new Error(`frame ${f}: nothing was waiting for the frame`);
  if (f < -FADE) {
    if ((f - START) % 100 === 0) console.log(`warm ${f} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    continue;
  }
  const k = String(f + FADE).padStart(5, "0");
  if (!MARKS_ONLY) await shoot({ x: 0, y: 0, width: EXTENT.w, height: EXTENT.h }, `${OUT}/w${k}.png`);
  /* the wordmark's box on whole CSS pixels, so its picture lands on whole device pixels */
  const x0 = Math.floor(r.box.x) - 2;
  const y0 = Math.floor(r.box.y) - 2;
  const clip = { x: x0, y: y0, width: Math.ceil(r.box.x + r.box.w) + 2 - x0, height: Math.ceil(r.box.y + r.box.h) + 2 - y0 };
  await page.evaluate(() => window.__layer("mark"));
  await shoot(clip, `${OUT}/m${k}.png`);
  await page.evaluate(() => window.__layer("water"));
  meta.push({ k: f + FADE, f, box: r.box, bar: r.bar, clip: { x: clip.x, y: clip.y, w: clip.width, h: clip.height }, ink: r.ink });
  if ((f + FADE) % 20 === 0) console.log(`frame ${f} (k ${k}) ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
writeFileSync(
  `${OUT}/meta.json`,
  JSON.stringify({ theme: THEME, variant: VARIANT, length: L, fade: FADE, warm: WARM, start: START, dsf: DSF, marksOnly: MARKS_ONLY, offset: OFFSET, extent: EXTENT, problems, frames: meta })
);
console.log(JSON.stringify({ kept: meta.length, problems, seconds: Math.round((Date.now() - t0) / 1000) }));
await browser.close();
