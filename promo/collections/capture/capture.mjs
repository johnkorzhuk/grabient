// Frame-by-frame capture of the real Grabient UI for the collections promo, v3: v2's scene with a like first (the heart
// under the card, then the plus and Add to collection as before), on a transparent page, so the promo's own water and
// wordmark (../harness) can stand behind it.
//
//   source ../../env.sh && node capture.mjs --theme dark|light [--dsf 2] [--out "$WORK/frames/ui-<theme>"]
// (../render.sh --frames runs it for both themes; env.sh gives the browser and its fonts)
//
// The local preview of the current site (http://127.0.0.1:25340, a worktree of staging with its own copy of the data)
// is driven with Playwright, signed in with the mocked account (mock.mjs, collections.mjs), every write answered in the
// browser and every other host cut off. The page is simplified by CSS (simplify.css): the header keeps its place but is
// not drawn, the list's chrome goes, and the page's ground, grain and water are not drawn either; the screenshots keep
// their alpha (CDP's default background is transparent), so the cards, the checklist and their tooltips stand over the
// promo's water as they stand over the site's. The site's water still runs unseen, as it does for a reader, so a lit
// card's own glow is the 40% the page shows while the water carries the rest.
// Time is the capture's own, as in v1: the page's clock is Playwright's fake clock stepped one frame (1/30 s) at a time,
// and the document's animations are frozen (CDP Animation.setPlaybackRate 0) and set to each frame's time. Each frame is a
// screenshot at deviceScaleFactor 2; frames.json keeps the pointer, its presses, the cursor the page asked for, the lit
// card's picture (the water's glow input), the parts the camera follows and the palettes the page paints.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { COLLECTIONS } from "./collections.mjs";
import { accountServer, mockAccount, ORIGIN } from "../../kit/capture/mock.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const THEME = arg("theme", "dark");
const OUT = arg("out", process.env.WORK && `${process.env.WORK}/frames/ui-${THEME}`);
if (!OUT) throw new Error("Give --out, or WORK (the promo's work folder) in the environment");
const LIMIT = Number(arg("limit", "100000"));
const DSF = Number(arg("dsf", "2"));
const FPS = 30;
const DT = 1000 / FPS;
const VIEW = { width: 1600, height: 900 };
const SCROLL = 0;
const SIMPLIFY = readFileSync(new URL("./simplify.css", import.meta.url), "utf8");
const CLOCK_START = new Date("2026-10-14T16:00:00Z");
const HERO = 3; // the fourth card of Popular: the cyan to green palette
/* frames at rest before the pointer sets off, and after it is back */
const OPEN = 10;
const CLOSE = 30;

const sleep = ms => new Promise(r => setTimeout(r, ms));
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    // a mouse that hovers: headless Chrome reports no pointer otherwise
    "--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2",
    // WebGL for the site's own water, which runs unseen (grabient-water = software lets it draw here)
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--hide-scrollbars"
  ]
});
const context = await browser.newContext({
  viewport: VIEW,
  deviceScaleFactor: DSF,
  colorScheme: THEME,
  reducedMotion: "no-preference",
  serviceWorkers: "block",
  locale: "en-US",
  timezoneId: "UTC"
});
await context.addInitScript(theme => {
  try {
    localStorage.setItem("grabient-theme", theme);
    localStorage.setItem("grabient-water", "software");
  } catch {}
}, THEME);
await context.addInitScript(css => {
  const add = () => {
    const style = document.createElement("style");
    style.id = "promo-simplify";
    style.textContent = css;
    document.head.append(style);
  };
  if (document.head) add();
  else document.addEventListener("DOMContentLoaded", add, { once: true });
}, SIMPLIFY);
const server = accountServer(COLLECTIONS);
const seen = [];
await mockAccount(context, server, seen);

const page = await context.newPage();
const problems = [];
page.on("console", m => {
  if (m.type() === "error" && !/Service Worker registration blocked/.test(m.text())) problems.push(m.text().slice(0, 300));
});
page.on("pageerror", e => problems.push(String(e).slice(0, 300)));
const pending = new Set();
page.on("request", r => pending.add(r));
page.on("requestfinished", r => pending.delete(r));
page.on("requestfailed", r => pending.delete(r));

await page.clock.install({ time: CLOCK_START });
await page.goto(`${ORIGIN}/palettes`, { waitUntil: "networkidle" });
await page.waitForFunction(() => !("$_TSR" in window));
await page.evaluate(y => scrollTo(0, y), SCROLL);
await page.evaluate(() => document.fonts.ready);
// the account's copy has heard from the server, the cards are drawn, and the site's water is running unseen (its canvas
// never draws past twice the CSS pixels, whatever the screen's ratio)
await page.waitForFunction(
  ({ w }) =>
    document.querySelectorAll("main article").length >= 8 &&
    [...document.querySelectorAll("canvas")].some(c => c.width >= w),
  { w: VIEW.width * Math.min(DSF, 2) },
  { timeout: 120_000 }
);
await page.waitForLoadState("networkidle");
const card = page.locator("main article").nth(HERO);
const art = card.locator(":scope > div").first();
const rectOf = async locator => {
  const b = await locator.boundingBox();
  return b && { x: b.x, y: b.y, w: b.width, h: b.height };
};
const heroArt = await rectOf(art);
/* the pointer's places, as v1 set them about the hero card: at rest in the empty margin just over it (its path in
   crosses no other card), the reach toward it, and the empty margin where a press lets the focus go */
const REST = { x: 1300, y: heroArt.y - 30 };
const REACH = { x: 1384, y: heroArt.y + 142 };
const MARGIN = { x: 1468, y: heroArt.y - 34 };
await page.mouse.move(REST.x, REST.y);
const facts = await page.evaluate(() => {
  const at = el => el?.getBoundingClientRect().top;
  const header = document.querySelector("header");
  return {
    style: !!document.getElementById("promo-simplify"),
    header: header ? getComputedStyle(header).visibility : "none",
    headerHeight: header?.getBoundingClientRect().height,
    search: document.querySelector("main search")?.checkVisibility() ?? false,
    tabs: document.querySelector('nav[aria-label="Order"]')?.checkVisibility() ?? false,
    gridTop: at(document.querySelector("main article")),
    glow: getComputedStyle(document.documentElement).getPropertyValue("--card-glow"),
    ground: getComputedStyle(document.documentElement).backgroundColor
  };
});
if (!facts.style || facts.header !== "hidden" || facts.search || facts.tabs) throw new Error(`the chrome still shows: ${JSON.stringify(facts)}`);
if (facts.glow.trim() !== "0.4") throw new Error(`the site's water is not live: --card-glow ${facts.glow}`);
console.log(`simplified page: ${JSON.stringify(facts)}`);
/* what the page paints, as the frame reads it: the first eight cards, each by the Edit link the card carries, and the
   hero's picture as CSS draws it */
const painted = await page.evaluate(() =>
  [...document.querySelectorAll("main article")].slice(0, 12).map(a => {
    const link = a.querySelector("a[href]");
    const url = link ? new URL(link.getAttribute("href"), location.origin) : null;
    const paint = a.querySelector('[role="img"]');
    return {
      href: url ? url.pathname + url.search : null,
      css: paint ? getComputedStyle(paint).backgroundImage : null,
      radius: paint ? Number.parseFloat(getComputedStyle(paint).borderTopLeftRadius) : 0
    };
  })
);
await sleep(2500);
const startAt = await page.evaluate(() => Date.now());
await page.clock.pauseAt(startAt + 50);

const cdp = await context.newCDPSession(page);
await cdp.send("Animation.enable");
await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
// nothing paints the page's ground, so the screenshots keep it transparent
await cdp.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
await page.evaluate(() => {
  /* every animation of the document, set to the frame's time from the frame it was first seen in */
  const known = new Map();
  window.__capStep = (f, dt) => {
    let n = 0;
    for (const a of document.getAnimations()) {
      let s = known.get(a);
      if (!s) {
        s = { f0: f, base: Number(a.currentTime) || 0 };
        known.set(a, s);
      }
      const t = s.base + (f - s.f0) * dt;
      if (a.currentTime !== t) a.currentTime = t;
      n++;
    }
    return n;
  };
});

const press = name => card.getByRole("button", { name, exact: true });
/* the heart in the card's line under its picture, named for its count ("Like, 59") */
const heart = card.getByRole("button", { name: /^Like, \d+$/ });
const dialog = page.getByRole("dialog", { name: "Add to collection" });
const row = title => dialog.getByRole("button", { name: new RegExp(`^${title}`) });
const box = async (locator, at = { x: 0.5, y: 0.5 }) => {
  const b = await locator.boundingBox();
  if (!b) throw new Error(`nothing to aim at: ${locator}`);
  return { x: b.x + b.width * at.x, y: b.y + b.height * at.y };
};

/* ---- one frame ---- */
let tick = -1; // every frame the page lives through, warm-up included: the clock's and the animations' count
let f = -1; // the frames kept
let clockAt = 0;
let pos = { ...REST };
let down = false;
const frames = [];
const events = [];
const marks = {};
const rects = { art: heroArt };
async function settle() {
  const t = Date.now();
  let quiet = 0;
  while (Date.now() - t < 4000) {
    await sleep(12);
    if (pending.size === 0) {
      if (++quiet >= 2) break;
    } else quiet = 0;
  }
}
async function frame(keep = true) {
  tick += 1;
  if (keep) f += 1;
  if (f >= LIMIT) throw new Error("limit");
  await page.mouse.move(pos.x, pos.y);
  await settle();
  const target = Math.round((tick + 1) * DT);
  if (target > clockAt) {
    await page.clock.runFor(target - clockAt);
    clockAt = target;
  }
  await settle();
  const running = await page.evaluate(([n, dt]) => window.__capStep(n, dt), [tick, DT]);
  const under = await page.evaluate(
    ({ x, y, hero }) => {
      const el = document.elementFromPoint(x, y);
      const cursor = el ? getComputedStyle(el).cursor : "default";
      const named = el?.closest("button, a, [role=dialog], article, header");
      const what = named
        ? `${named.tagName.toLowerCase()} ${(named.getAttribute("aria-label") || named.textContent || "").trim().slice(0, 40)}`
        : (el?.tagName.toLowerCase() ?? "");
      /* the card whose glow is lit, as PaletteCard lights it: a pointer in its picture or the keyboard's focus within
         it (a press of the mouse leaves its focus on the press, which lights nothing once the pointer has gone) */
      const pic = document.querySelectorAll("main article")[hero]?.querySelector(":scope > div");
      const lit = pic && pic.matches(":hover, :has(:focus-visible)") && !pic.hasAttribute("data-removed");
      const r = lit ? pic.getBoundingClientRect() : null;
      return { cursor, what, scroll: scrollY, glow: r && { x: r.x, y: r.y, w: r.width, h: r.height } };
    },
    { ...pos, hero: HERO }
  );
  if (under.scroll !== SCROLL) throw new Error(`the page scrolled to ${under.scroll}`);
  if (keep) {
    // the clip is in the document's pixels, and its scale is what gives device pixels: without it the shot is 1x
    const shot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      optimizeForSpeed: true,
      clip: { x: 0, y: SCROLL, width: VIEW.width, height: VIEW.height, scale: DSF }
    });
    writeFileSync(`${OUT}/f${String(f).padStart(5, "0")}.png`, Buffer.from(shot.data, "base64"));
    frames.push({ f, x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), down, cursor: under.cursor, under: under.what, glow: under.glow, running });
    if (f % 10 === 0) console.log(`frame ${f} ${under.what} anims ${running} lit ${!!under.glow}`);
  }
}

/* ---- the pointer's moves: v1's ---- */
/* minimum-jerk timing: a hand's reach, still at both ends */
const reach = t => t * t * t * (t * (6 * t - 15) + 10);
async function moveTo(to, n, arc = 0.1) {
  const from = { ...pos };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // a gentle bow to the path, the way a wrist swings
  const c = { x: from.x + dx / 2 - (dy / len) * len * arc, y: from.y + dy / 2 + (dx / len) * len * arc };
  for (let i = 1; i <= n; i++) {
    const u = reach(i / n);
    pos = {
      x: (1 - u) * (1 - u) * from.x + 2 * (1 - u) * u * c.x + u * u * to.x,
      y: (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * c.y + u * u * to.y
    };
    await frame();
  }
}
async function hold(n) {
  for (let i = 0; i < n; i++) await frame();
}
async function click(name, held = 3) {
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.down();
  down = true;
  events.push({ type: "down", f: f + 1, x: pos.x, y: pos.y, name });
  for (let i = 0; i < held; i++) await frame();
  await page.mouse.up();
  down = false;
  events.push({ type: "up", f: f + 1, x: pos.x, y: pos.y, name });
  await frame();
}
const mark = name => {
  marks[name] = f + 1;
};

/* ---- the scene: v1's, from the pointer at rest to the pointer at rest again ---- */
try {
  for (let i = 0; i < 12; i++) await frame(false); // the page settles into the paused clock
  rects.card = await rectOf(card);
  rects.plus = await rectOf(press("Add to selection"));
  rects.heart = await rectOf(heart);
  /* the server counts the reader's like from the count the page shows */
  const heroSeed = new URL(painted[HERO].href, ORIGIN).pathname.slice(1);
  server.counts.set(heroSeed, Number((await heart.getAttribute("aria-label"))?.match(/\d+/)?.[0] ?? 0));
  mark("open");
  await hold(OPEN);
  mark("approach");
  await moveTo(REACH, 24, 0.14);
  await hold(4);
  /* the like first: down to the heart under the picture, long enough for its tooltip (Like) to be read, a press that
     fills it and counts the reader's like, and a beat to see it before the hand goes up to the plus */
  mark("toHeart");
  await moveTo(await box(heart, { x: 0.32, y: 0.5 }), 16, 0.12);
  mark("restHeart");
  await hold(30);
  mark("clickHeart");
  await click("Like");
  await hold(16);
  rects.liked = await rectOf(heart);
  const likedNow = { pressed: await heart.getAttribute("aria-pressed"), name: await heart.getAttribute("aria-label") };
  if (likedNow.pressed !== "true" || !/^Like, 60$/.test(likedNow.name ?? "")) throw new Error(`the like did not take: ${JSON.stringify(likedNow)}`);
  mark("toPlus");
  await moveTo(await box(press("Add to selection")), 18, -0.12);
  mark("restPlus"); // long enough for the plus's tooltip (700 ms after the pointer reaches it) to be read
  await hold(38);
  mark("clickPlus");
  await click("Add to selection");
  rects.press = await rectOf(press("Add to collection"));
  await hold(10);
  mark("toPress");
  await moveTo(await box(press("Add to collection")), 10, 0.05);
  mark("restPress"); // and the press's own tooltip, Add to collection
  await hold(37);
  mark("clickPress");
  await click("Add to collection");
  rects.dialog = await rectOf(dialog);
  for (const t of ["Autumn evenings", "Ocean moods", "Brand explorations", "Poster ideas"]) rects[t] = await rectOf(row(t));
  await hold(6);
  mark("look");
  await moveTo(await box(row("Autumn evenings"), { x: 0.42, y: 0.5 }), 12, 0.1);
  await hold(4);
  await moveTo(await box(row("Ocean moods"), { x: 0.45, y: 0.5 }), 9, 0.15);
  await hold(3);
  await moveTo(await box(row("Brand explorations"), { x: 0.43, y: 0.5 }), 9, -0.15);
  await hold(3);
  await moveTo(await box(row("Poster ideas"), { x: 0.46, y: 0.5 }), 9, 0.15);
  await hold(5);
  mark("toOcean");
  await moveTo(await box(row("Ocean moods"), { x: 0.47, y: 0.5 }), 12, -0.12);
  await hold(7);
  mark("clickOcean");
  await click("Ocean moods");
  await hold(12);
  mark("toBrand");
  await moveTo(await box(row("Brand explorations"), { x: 0.49, y: 0.5 }), 10, 0.1);
  await hold(7);
  mark("clickBrand");
  await click("Brand explorations");
  await hold(12);
  mark("toCheck");
  await moveTo(await box(press("Remove from selection")), 16, -0.1);
  await hold(8);
  mark("clickCheck"); // closes the checklist and takes the palette out of the selection
  await click("Remove from selection");
  await hold(6);
  mark("leave");
  /* v1's press on the empty margin over the card, as a reader lets a card go; the card's tools have already left with
     the pointer, which the site does after a press */
  await moveTo(MARGIN, 14, 0.1);
  await hold(3);
  mark("dismiss");
  await click("page");
  await moveTo(REST, 18, -0.1);
  mark("rest");
  await hold(CLOSE);
  mark("end");
} catch (error) {
  if (String(error?.message) !== "limit") throw error;
}

writeFileSync(
  `${OUT}/frames.json`,
  JSON.stringify(
    {
      theme: THEME,
      fps: FPS,
      dsf: DSF,
      viewport: VIEW,
      scroll: SCROLL,
      rest: REST,
      count: frames.length,
      marks,
      rects,
      painted,
      events,
      frames,
      writes: server.log,
      seen,
      problems
    },
    null,
    1
  )
);
console.log(JSON.stringify({ frames: frames.length, marks, problems, writes: server.log.map(w => `${w.op} ${w.slug ?? ""}`), seen: seen.slice(-8) }, null, 1));
await browser.close();
