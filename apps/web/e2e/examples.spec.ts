import { encodePalette } from "@grabient/engine/codec.ts";
import { EFFECTS, isVectorKind, type VectorKind } from "@grabient/engine/effect.ts";
import { isKitKind, type KitKind } from "@grabient/engine/kit/kinds.ts";
import { KIT_LABELS } from "@grabient/engine/kit/names.ts";
import { kitRng } from "@grabient/engine/kit/scene.ts";
import { randomPalette } from "@grabient/engine/random.ts";
import { expect, type Page, test } from "@playwright/test";
import { HERO_LOOKS } from "../src/features/examples/hero.ts";
import { shuffled } from "../src/features/examples/looks.ts";
import { live } from "./live.ts";

/* A palette's examples (features/examples): one page for each palette, whatever view or effect a link names, its parts
   in the looks its seed picks; its hero under the app's own header, the editor's keys turning the palette here too, and
   the way back to the editor. */

const SEED = "kWPgBjqiK5UIirpZorp5IA6Y";
/* the examples every palette fits; the rest stand where their checks pass (features/examples/fit.ts) */
const ALWAYS = ["cards", "profile", "wallpapers", "swatches"];

/** Opens a page and waits for the app to have hydrated the server's document. */
async function open(page: Page, address: string) {
  await page.goto(address);
  await live(page);
}

/** Presses B until the palette turns: the shell listens for keys once the page has settled, a moment after it
    hydrates, and a press before that does nothing. The hero's way back to the editor names the palette as soon as it
    turns, and the address follows a moment later: a turn that draws a new effect's shader takes a second or more where
    a browser draws WebGL without a GPU, and a second press then would turn it twice. */
async function random(page: Page, from: string) {
  const editor = page.getByRole("link", { name: "Editor" });
  await expect(async () => {
    await page.keyboard.press("b");
    await expect(editor).not.toHaveAttribute("href", new RegExp(`/${from}$`), { timeout: 10000 });
  }).toPass({ timeout: 60000 });
  await expect(page).not.toHaveURL(new RegExp(`/${from}/`), { timeout: 10000 });
}

/** Each tile of the cards' grid by its name, which says its look. */
const tilesOf = (page: Page) =>
  page
    .locator("#cards [role=group][data-kind]")
    .evaluateAll(tiles => tiles.map(t => t.getAttribute("aria-label")));

test("a palette's examples are one page whatever view or effect a link names, which moves there for good", async ({
  page
}) => {
  /* five pages, each starting the hero's effect, which a browser with no GPU draws on its processor */
  test.slow();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  await open(page, `/${SEED}/examples`);
  const tiles = await tilesOf(page);
  /* the tiles take the palette's range of looks, which their names say */
  expect(new Set(tiles.map(name => name?.split(", ")[1])).size).toBeGreaterThan(3);
  for (const query of [
    "?style=linearSwatches&steps=5&angle=45",
    "?style=radialSwatches&steps=6",
    "?style=glass",
    "?style=blob&angle=45&speed=0.3&frost=0.6&shape=5894"
  ]) {
    const answer = await page.request.get(`/${SEED}/examples${query}`, { maxRedirects: 0 });
    expect(answer.status()).toBe(301);
    expect(new URL(answer.headers().location, page.url()).href).toBe(
      new URL(`/${SEED}/examples`, page.url()).href
    );
    await open(page, `/${SEED}/examples${query}`);
    await expect(page).toHaveURL(new RegExp(`/${SEED}/examples$`));
    expect(await tilesOf(page)).toEqual(tiles);
    for (const id of ALWAYS) await expect(page.locator(`section#${id}`)).toHaveCount(1);
    /* the palette's own name */
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^[A-Z][\w ,-]+$/);
    const numbers = await page
      .locator("main section[id] h2")
      .evaluateAll(headings => headings.map(h => Number.parseInt(h.textContent ?? "", 10)));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  }
  expect(errors).toEqual([]);
});

test("the header is the app's own, its surface and dashed rule as over the editor, and the hero starts under it", async ({
  page
}) => {
  await open(page, `/${SEED}/examples`);
  await expect(page.locator("header > span").first()).toHaveAttribute("data-on", "");
  await expect(page.locator("header > div").last()).not.toHaveAttribute("data-off", /.*/);
  const [hero, header] = await Promise.all(
    ["main > section", "header"].map(selector =>
      page
        .locator(selector)
        .first()
        .evaluate(el => {
          const { top, bottom } = el.getBoundingClientRect();
          return { top, bottom };
        })
    )
  );
  expect(hero.top).toBe(header.bottom);
});

test("the editor's keys turn the palette, the address follows in place, and the undo walks the turns back", async ({
  page
}) => {
  await open(page, `/${SEED}/examples`);
  const entries = await page.evaluate(() => history.length);
  await random(page, SEED);
  await expect(page).toHaveURL(/\/k[\w-]+\/examples$/);
  const rolled = new URL(page.url()).pathname;
  await page.keyboard.press("i");
  await expect(page).not.toHaveURL(new RegExp(`${rolled}$`), { timeout: 10000 });
  await expect(page).toHaveURL(/\/k[\w-]+\/examples$/);
  /* the steps' and the angle's keys have nothing to turn on a page of the palette's own looks */
  const inverted = page.url();
  await page.keyboard.press("]");
  await page.keyboard.press(".");
  await expect(page).toHaveURL(inverted);
  expect(await page.evaluate(() => history.length)).toBe(entries);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page).toHaveURL(new RegExp(`${rolled}$`), { timeout: 10000 });
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page).toHaveURL(new RegExp(`/${SEED}/examples$`), { timeout: 10000 });
  // the address as written is the one the server answers at, with no redirect
  expect((await page.request.get(page.url(), { maxRedirects: 0 })).status()).toBe(200);
});

test("the way back opens the editor at the palette the keys left", async ({ page }) => {
  await open(page, `/${SEED}/examples`);
  await random(page, SEED);
  const turned = new URL(page.url()).pathname.split("/")[1];
  await page.getByRole("link", { name: "Editor" }).click();
  await expect(page).toHaveURL(new RegExp(`/${turned}$`));
});

test("a press on a tile turns it to the palette's next look", async ({ page }) => {
  await open(page, `/${SEED}/examples`);
  await expect(page.locator("#cards [role=group][data-kind]")).toHaveCount(11);
  const album = page.locator('#cards [data-kind="album"]');
  const before = await album.getAttribute("aria-label");
  await album.click({ position: { x: 12, y: 12 } });
  await expect(album).not.toHaveAttribute("aria-label", before ?? "");
});

test("a tile turns with Enter and Space as with a press, says its new look, and starts from its own on another palette", async ({
  page
}) => {
  await open(page, `/${SEED}/examples`);
  const poster = page.locator('#cards [data-kind="poster"]');
  const first = await poster.getAttribute("aria-label");
  expect(first).toMatch(/^Poster, /);
  await poster.focus();
  const scrolled = await page.evaluate(() => scrollY);
  await page.keyboard.press("Enter");
  await expect(poster).not.toHaveAttribute("aria-label", first ?? "");
  const turned = ((await poster.getAttribute("aria-label")) ?? "").replace(/^Poster, /, "");
  await expect(page.locator("[data-announce]")).toHaveText(turned);
  await page.keyboard.press(" ");
  await expect(poster).not.toHaveAttribute("aria-label", `Poster, ${turned}`);
  // Space turns the tile and leaves the page where it stands
  expect(await page.evaluate(() => scrollY)).toBe(scrolled);
  /* another palette's poster shows that palette's own look, as its page opened afresh does */
  await random(page, SEED);
  const fresh = await page.context().newPage();
  await open(fresh, new URL(page.url()).pathname);
  const own = await fresh.locator('#cards [data-kind="poster"]').getAttribute("aria-label");
  await expect(poster).toHaveAttribute("aria-label", own ?? "");
});

/** The tag under a part's stage, which names the look it is drawn in. */
const tagOf = (page: Page, id: string) => page.locator(`#${id} figcaption > span`).first();

/** A part's stage brought to the window's middle at once, so a pointer meets it where it was measured. */
async function stageOf(page: Page, id: string) {
  const stage = page.locator(`[data-look="${id}"]`);
  await stage.evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
  return stage;
}

test("a part turns to another look with the arrow keys while it holds the focus, says it, and turns back; the keys show beside its tag", async ({
  page
}) => {
  await open(page, `/${SEED}/examples`);
  const stage = await stageOf(page, "profile");
  const tag = tagOf(page, "profile");
  const first = (await tag.textContent()) ?? "";
  await expect(page.locator("#profile figcaption kbd")).toHaveText(["←", "→"]);
  await expect(
    page.locator("#profile figcaption").getByText("Swipe for another look")
  ).toBeHidden();
  await stage.focus();
  /* the shell listens for keys once the page has settled, a moment after it hydrates */
  await expect(async () => {
    await page.keyboard.press("ArrowRight");
    await expect(tag).not.toHaveText(first, { timeout: 2000 });
  }).toPass({ timeout: 30000 });
  const turned = (await tag.textContent()) ?? "";
  await expect(page.locator("[data-announce]")).toHaveText(turned);
  await page.keyboard.press("ArrowLeft");
  await expect(tag).toHaveText(first);
  /* the address stays the palette's: a part's look is the reader's own, for this visit */
  await expect(page).toHaveURL(new RegExp(`/${SEED}/examples$`));
});

test("a drag across a part turns it once, the press it ends with turning nothing more, and a press turns it as the drag did", async ({
  page
}) => {
  await open(page, `/${SEED}/examples`);
  const stage = await stageOf(page, "wallpapers");
  const tag = tagOf(page, "wallpapers");
  const first = (await tag.textContent()) ?? "";
  const box = await stage.boundingBox();
  if (!box) throw new Error("the wallpapers' stage is not drawn");
  const x = box.x + box.width * 0.75;
  const y = box.y + Math.min(box.height / 2, 120);
  /* toward the line's start: on to the next look */
  await expect(async () => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 80, y + 4, { steps: 5 });
    await page.mouse.move(x - 160, y + 6, { steps: 5 });
    await page.mouse.up();
    await expect(tag).not.toHaveText(first, { timeout: 2000 });
  }).toPass({ timeout: 30000 });
  const dragged = (await tag.textContent()) ?? "";
  /* one key back finds the first look, so the drag turned it once (it holds the focus the drag gave it) */
  await page.keyboard.press("ArrowLeft");
  await expect(tag).toHaveText(first);
  await stage.click({ position: { x: 12, y: 12 } });
  await expect(tag).toHaveText(dragged);
});

test("the hero plays the glass for a reader whose own choice is another style", async ({
  page
}) => {
  /* a turn may start another effect, which a browser with no GPU draws on its processor */
  test.slow();
  /* the address names no style, so the first screen marks the glass off for a reader who chose the gradient
     (effectScript): the mark stands for the editor's first screen, and the hero's own glass never answers to it */
  await page.addInitScript(() =>
    localStorage.setItem("grabient-effect", JSON.stringify({ kind: null }))
  );
  await open(page, `/${SEED}/examples`);
  await expect(page.locator("html")).toHaveAttribute("data-glass", "off");
  const glass = page.locator('[data-look="hero"] [data-glass-still]');
  /* a key turns the hero to its next look, until it plays the glass */
  await expect(async () => {
    if ((await glass.count()) === 0) await page.keyboard.press("ArrowRight");
    await expect(glass).toBeVisible({ timeout: 4000 });
  }).toPass({ timeout: 60000 });
});

/** The menu's names of the vector effects drawn by code of their own; a field effect's is the kit's (kit/names.ts). */
const DRAWN_ALONE: Record<Exclude<VectorKind, KitKind>, string> = {
  silk: "Silk",
  rosette: "Rosette",
  papercut: "Papercut",
  strings: "Strings"
};
/** A palette whose seed puts the kind first for its examples page's hero (features/examples/hero.ts: the look its
    seed's shuffle puts first): the first of a seeded run of palettes, found as the test runs, so a new effect, which
    changes every seed's shuffle, needs no seed written here. */
function heroSeed(kind: VectorKind): string {
  const rand = kitRng(20261108);
  for (let i = 0; i < 10000; i++) {
    const seed = encodePalette(randomPalette(rand));
    if (shuffled(HERO_LOOKS, seed, "hero")[0] === kind) return seed;
  }
  throw new Error(`no palette of 10,000 puts the ${kind} first for the hero`);
}

/* every vector effect (EFFECT_KINDS), the field effects among them, each a test of its own on a palette whose seed puts
   it first, so a new effect adds a test rather than seconds to one test's limit (all eleven in one test took 28.4 s of
   its 30, 8 Nov 2026) */
for (const kind of EFFECTS.filter(isVectorKind))
  test(`the hero plays the ${kind} from the server's still, in the page's first paint`, async ({
    page
  }) => {
    const seed = heroSeed(kind);
    const label = isKitKind(kind) ? KIT_LABELS[kind] : DRAWN_ALONE[kind];
    const html = await (await page.request.get(`/${seed}/examples`)).text();
    /* the hero's holder names its still, which the head paints */
    const named = /data-look="hero"[\s\S]*?data-fx-still="([^"]+)"/.exec(html)?.[1];
    expect(named).toMatch(new RegExp(`^${kind}\\|${seed}\\|`));
    const painted = /<style id="fx-still" data-key="([^"]*)">/.exec(html)?.[1].split(" ");
    expect(painted).toContain(named);
    await open(page, `/${seed}/examples`);
    await expect(page.locator('[data-look="hero"] [data-hold] p').first()).toContainText(
      `${label} · 1×`
    );
    const still = page.locator(`[data-look="hero"] [data-fx-still="${named}"]`);
    await expect(still).toHaveCount(1);
    expect(await still.evaluate(el => getComputedStyle(el).backgroundImage)).toContain(
      "data:image/svg+xml"
    );
  });

test("soft and grained looks are drawn as the server drew them, none drawn plain a moment while the blur's code comes", async ({
  page
}) => {
  /* a palette whose hero is a soft, grained rosette, the rosette's own finish, among soft bands and effects and
     grained ones (features/examples/looks.ts finishFor) */
  const seed = "kYXjusxyM5F01Plru0A8DfB2s0Qu";
  /* any soft picture's gradient the page draws again otherwise than the server did, were it drawn plain a moment
     while the blur's code came */
  await page.addInitScript(() => {
    const changed: string[] = [];
    Object.assign(window, { softChanged: changed });
    new MutationObserver(records => {
      for (const record of records) {
        const el = record.target as Element;
        const was = record.oldValue ?? "";
        if (
          was.includes("gradient(") &&
          el.closest("[data-soft]") &&
          el.getAttribute("style") !== was
        )
          changed.push(was);
      }
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
      attributeOldValue: true
    });
  });
  const html = await (await page.request.get(`/${seed}/examples`)).text();
  await open(page, `/${seed}/examples`);
  expect(
    await page.evaluate(() => (window as unknown as { softChanged: string[] }).softChanged)
  ).toEqual([]);
  await expect(page.locator('[data-look="hero"] [data-hold] p').first()).toContainText(
    "Rosette · 1× · 135° · Soft 28 · Grain 16"
  );
  const drawn = await page.evaluate(served => {
    /* every soft picture's gradient, as the server wrote it and as the page shows it now */
    const soft = (root: ParentNode) =>
      [
        ...root.querySelectorAll(
          '[data-soft][style*="gradient("], [data-soft] [style*="gradient("]'
        )
      ].map(el => el.getAttribute("style"));
    return {
      served: soft(new DOMParser().parseFromString(served, "text/html")),
      shown: soft(document)
    };
  }, html);
  expect(drawn.served.length).toBeGreaterThan(1);
  expect(drawn.shown).toEqual(drawn.served);
  /* the grain over the grained ones, the tile at its strength's share */
  const grain = page.locator("#cards [data-grain]").first();
  await expect(grain).toBeAttached();
  expect(Number(await grain.evaluate(el => getComputedStyle(el).opacity))).toBeLessThan(1);
});

test("the hero turns with a key while it fills the window, and a press on its words leaves it", async ({
  page
}) => {
  /* each turn may start the other effect, which a browser with no GPU draws on its processor */
  test.slow();
  await open(page, `/${SEED}/examples`);
  const drawn = page.locator('[data-look="hero"] [data-hold] p').first();
  /* the words before the hint the paragraph ends with */
  const words = () =>
    drawn.evaluate(p =>
      [...p.childNodes]
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent)
        .join("")
    );
  const first = await words();
  await expect(drawn.locator("kbd")).toHaveText(["←", "→"]);
  await expect(async () => {
    await page.keyboard.press("ArrowRight");
    await expect.poll(words, { timeout: 4000 }).not.toBe(first);
  }).toPass({ timeout: 60000 });
  const turned = await words();
  await page.locator('[data-look="hero"] [data-hold]').click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(500);
  expect(await words()).toBe(turned);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(words, { timeout: 10000 }).toBe(first);
});

test.describe("on a touch screen", () => {
  test.use({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });

  test("a finger drawn across a part turns it, one drawn up the page scrolls it, and the hint says to swipe", async ({
    page
  }) => {
    await open(page, `/${SEED}/examples`);
    const caption = page.locator("#wallpapers figcaption");
    await expect(caption.getByText("Swipe for another look")).toBeVisible();
    await expect(caption.locator("kbd").first()).toBeHidden();
    const stage = await stageOf(page, "wallpapers");
    const tag = tagOf(page, "wallpapers");
    const first = (await tag.textContent()) ?? "";
    const box = await stage.boundingBox();
    if (!box) throw new Error("the wallpapers' stage is not drawn");
    const touch = await page.context().newCDPSession(page);
    /** A finger set down at `from` and drawn to `to` in eight moves, a frame apart. */
    async function finger(from: { x: number; y: number }, to: { x: number; y: number }) {
      await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
      for (let i = 1; i <= 8; i++) {
        const at = { x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8 };
        await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [at] });
        await page.waitForTimeout(16);
      }
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    const y = box.y + Math.min(box.height / 2, 150);
    await expect(async () => {
      await finger({ x: box.x + box.width * 0.8, y }, { x: box.x + box.width * 0.2, y: y + 8 });
      await expect(tag).not.toHaveText(first, { timeout: 2000 });
    }).toPass({ timeout: 30000 });
    const swiped = (await tag.textContent()) ?? "";
    const scrolled = await page.evaluate(() => scrollY);
    const x = box.x + box.width / 2;
    await finger({ x, y: y + 100 }, { x: x + 2, y: y - 100 });
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scrolled + 50);
    await expect(tag).toHaveText(swiped);
  });
});
