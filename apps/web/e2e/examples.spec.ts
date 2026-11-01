import { expect, type Page, test } from "@playwright/test";

/* A palette's examples (features/examples): the same examples whatever style the address names, its hero under the
   header to the window's top, the editor's keys turning the palette here too, and the way back to the editor. */

const SEED = "kWPgBjqiK5UIirpZorp5IA6Y";
/* the examples every palette fits; the rest stand where their checks pass (features/examples/fit.ts) */
const ALWAYS = ["cards", "profile", "wallpapers", "swatches"];

/** Opens a page and waits for the app to have hydrated the server's document. */
async function open(page: Page, address: string) {
  await page.goto(address);
  await page.waitForFunction(() => !("$_TSR" in window));
}

/** Presses B until the palette turns: the shell listens for keys once the page has settled, a moment after it
    hydrates, and a press before that does nothing. */
async function random(page: Page, from: string) {
  await expect(async () => {
    await page.keyboard.press("b");
    await expect(page).not.toHaveURL(new RegExp(`/${from}/`), { timeout: 3000 });
  }).toPass();
}

test("every style shows the examples its palette suits, numbered as they stand, and the page says nothing is wrong", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  for (const query of [
    "",
    "?style=linearSwatches&steps=5&angle=45",
    "?style=angularGradient&steps=32&angle=0",
    "?style=radialSwatches&steps=6",
    "?style=glass",
    "?style=blob&angle=45&speed=0.3&frost=0.6&shape=5894"
  ]) {
    await open(page, `/${SEED}/examples${query}`);
    for (const id of ALWAYS) await expect(page.locator(`section#${id}`)).toHaveCount(1);
    /* the palette's own name as drawn, which names the colors its steps show */
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^[A-Z][\w ,-]+$/);
    const numbers = await page
      .locator("main section[id] h2")
      .evaluateAll(headings => headings.map(h => Number.parseInt(h.textContent ?? "", 10)));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  }
  expect(errors).toEqual([]);
});

test("the hero runs under the header to the window's top, and the header is frosted over it until the page scrolls", async ({
  page
}) => {
  await open(page, `/${SEED}/examples`);
  const hero = page.locator("main > section").first();
  expect((await hero.boundingBox())?.y).toBe(0);
  const surface = page.locator("header > span").first();
  await expect(surface).toHaveAttribute("data-frost", "");
  await page.mouse.wheel(0, 400);
  await expect(surface).not.toHaveAttribute("data-frost", /.*/);
  await expect(surface).toHaveAttribute("data-on", "");
});

test("the editor's keys turn the palette, the address follows in place, and the undo walks the turns back", async ({
  page
}) => {
  await open(page, `/${SEED}/examples`);
  const entries = await page.evaluate(() => history.length);
  await random(page, SEED);
  await expect(page).toHaveURL(/\/k[\w-]+\/examples$/);
  await page.keyboard.press("]");
  await expect(page).toHaveURL(/\/examples\?steps=8$/);
  await page.keyboard.press(".");
  await expect(page).toHaveURL(/\/examples\?steps=8&angle=105$/);
  expect(await page.evaluate(() => history.length)).toBe(entries);
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page).toHaveURL(new RegExp(`/${SEED}/examples$`));
  // the address as written is the one the server answers at, with no redirect
  expect((await page.request.get(page.url(), { maxRedirects: 0 })).status()).toBe(200);
});

test("the way back opens the editor at the palette the keys left", async ({ page }) => {
  await open(page, `/${SEED}/examples?style=glass`);
  await random(page, SEED);
  const turned = new URL(page.url()).pathname.split("/")[1];
  await page.getByRole("link", { name: "Editor" }).click();
  await expect(page).toHaveURL(new RegExp(`/${turned}\\?style=glass$`));
});

test("a press on a tile turns it to the palette's next look", async ({ page }) => {
  await open(page, `/${SEED}/examples`);
  await expect(page.locator("#cards [role=group]")).toHaveCount(11);
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
  await expect(poster).toHaveAttribute("aria-label", "Poster");
  await poster.focus();
  const scrolled = await page.evaluate(() => scrollY);
  await page.keyboard.press("Enter");
  await expect(poster).toHaveAttribute("aria-label", /^Poster, Linear bands · \d+ steps$/);
  await expect(page.locator("[data-announce]")).toHaveText(/^Linear bands · \d+ steps$/);
  await page.keyboard.press(" ");
  await expect(poster).toHaveAttribute("aria-label", "Poster, Fluted glass");
  // Space turns the tile and leaves the page where it stands
  expect(await page.evaluate(() => scrollY)).toBe(scrolled);
  await random(page, SEED);
  await expect(poster).toHaveAttribute("aria-label", "Poster");
});
