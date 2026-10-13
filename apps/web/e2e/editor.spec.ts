import { devices, expect, type Page, test } from "@playwright/test";

/* The editor at a palette's address: the static page the server sends, the editor the browser draws over it, the
   address that follows each edit in place, the undo the entry keeps, and what the page asks the server. */

const SEED = "kS7CQ31Do6asvY-";
const here = (page: Page) => {
  const url = new URL(page.url());
  return url.pathname + url.search;
};
const entries = (page: Page) => page.evaluate(() => history.length);

/** Opens a palette's page and waits for the editor to stand where the static page was. */
async function open(page: Page, address = `/${SEED}`) {
  await page.goto(address);
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
}

test("the server sends the static page, and the editor takes its place", async ({
  page,
  request
}) => {
  const html = await (await request.get(`/${SEED}`)).text();
  expect(html).toContain('class="palette-static"');
  expect(html).toMatch(/<h1 dir="auto">[^<]+<\/h1>/);
  await open(page);
  await expect(page.locator(".palette-static")).toHaveCount(0);
  await expect(page.getByRole("img", { name: "The gradient" })).toBeVisible();
});

test("another spelling of an address answers with the canonical one", async ({ request }) => {
  const answer = await request.get(`/${SEED}?angle=90&steps=7&lock=hue,lightness`, {
    maxRedirects: 0
  });
  expect(answer.status()).toBe(301);
  const to = new URL(answer.headers().location ?? "", "http://localhost");
  expect(to.pathname + to.search).toBe(`/${SEED}?lock=lightness,hue`);
});

test("random leads to a new palette at the view asked for", async ({ request }) => {
  const answer = await request.get("/random?style=radialGradient", { maxRedirects: 0 });
  expect(answer.status()).toBe(302);
  const to = new URL(answer.headers().location ?? "", "http://localhost");
  expect(to.pathname).toMatch(/^\/k[A-Za-z0-9_-]{8,49}$/);
  expect(to.searchParams.get("style")).toBe("radialGradient");
});

test("edits rewrite the address in place, and the undo walks them both ways", async ({ page }) => {
  await open(page);
  const before = await entries(page);
  await page.keyboard.press("b");
  await expect.poll(() => here(page)).not.toBe(`/${SEED}`);
  const first = here(page);
  await page.keyboard.press("i");
  await expect.poll(() => here(page)).not.toBe(first);
  const second = here(page);
  expect(await entries(page)).toBe(before);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => here(page)).toBe(first);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => here(page)).toBe(`/${SEED}`);
  // with nothing left to take back, an undo changes nothing and leaves nowhere
  await page.keyboard.press("ControlOrMeta+z");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect.poll(() => here(page)).toBe(first);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => here(page)).toBe(second);
  expect(await entries(page)).toBe(before);
});

test("the view's keys change the address, never the undo or the history", async ({ page }) => {
  await open(page);
  const before = await entries(page);
  await page.keyboard.press("]");
  await page.keyboard.press(".");
  await expect.poll(() => here(page)).toBe(`/${SEED}?steps=8&angle=105`);
  expect(await entries(page)).toBe(before);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("a drag on a number is one step, however long it rests", async ({ page }) => {
  await open(page);
  const box = await page
    .getByRole("complementary", { name: "Editor" })
    .getByRole("spinbutton", { name: "Chroma" })
    .boundingBox();
  if (!box) throw new Error("no Chroma field");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width / 2 - i * 8, y);
  await page.waitForTimeout(900);
  for (let i = 9; i <= 16; i++) await page.mouse.move(box.x + box.width / 2 - i * 8, y);
  await page.mouse.up();
  await expect.poll(() => here(page)).not.toBe(`/${SEED}`);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => here(page)).toBe(`/${SEED}`);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("Back leaves an edited palette in one press, and Forward brings it back with its undo", async ({
  page
}) => {
  await page.goto("/about");
  await open(page);
  await page.keyboard.press("b");
  await expect.poll(() => here(page)).not.toBe(`/${SEED}`);
  const first = here(page);
  await page.keyboard.press("i");
  await expect.poll(() => here(page)).not.toBe(first);
  const edited = here(page);
  await page.goBack();
  await expect.poll(() => here(page)).toBe("/about");
  await page.goForward();
  await expect.poll(() => here(page)).toBe(edited);
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => here(page)).toBe(first);
});

test("the sheet asks for the palettes like this one only once it is in view", async ({ page }) => {
  const asks: string[] = [];
  page.on("request", r => {
    if (r.url().includes("/api/palettes/search")) asks.push(r.url());
  });
  await open(page);
  // edits on the first screen ask nothing
  await page.keyboard.press("b");
  await page.keyboard.press("b");
  await page.waitForTimeout(1500);
  expect(asks).toEqual([]);
  await page.mouse.move(200, 200);
  await page.mouse.wheel(0, 2000);
  await expect.poll(() => asks.length, { timeout: 10_000 }).toBe(1);
  expect(asks[0]).toContain(`q=${new URL(page.url()).pathname.slice(1)}`);
});

test("the selection's export screen stands in the page's place, and Escape closes it", async ({
  page
}) => {
  await open(page);
  await page.getByRole("button", { name: "Add to selection" }).first().click();
  await page
    .getByRole("button", { name: /^Selection/ })
    .first()
    .click();
  await expect.poll(() => new URL(page.url()).searchParams.has("selection")).toBe(true);
  await expect(page.getByRole("button", { name: "Close selection" })).toBeVisible();
  // the editor's keys rest while the screen stands
  const opened = here(page);
  await page.keyboard.press("b");
  await page.waitForTimeout(500);
  expect(here(page)).toBe(opened);
  await page.keyboard.press("Escape");
  await expect.poll(() => here(page)).toBe(`/${SEED}`);
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
});

test.describe("on a phone", () => {
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices["Pixel 7"];
  test.use({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent });
  test("the controls follow the strip, under the first screen", async ({ page }) => {
    await open(page);
    const side = await page.getByRole("complementary", { name: "Editor" }).boundingBox();
    const art = await page.getByRole("img", { name: "The gradient" }).boundingBox();
    if (!side || !art) throw new Error("no side or picture");
    expect(side.y).toBeGreaterThanOrEqual(art.y + art.height);
    await expect(page.getByRole("spinbutton", { name: "Hue" })).toBeAttached();
  });
});
