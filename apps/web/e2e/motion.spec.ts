import { expect, type Page, test } from "@playwright/test";

/* The reader's motion setting over the effects (ui/motion.ts): what she chose in Settings, Off or On, holds over the
   device's own setting either way for the fluted glass and the blob, on a list's cards and the editor's picture, and
   a choice made while one plays, in another tab too, stops it there. Behind another site's page (src/embed), which has
   no Settings, the device's setting does. The tests' browser draws WebGL on the CPU, where the players play nothing;
   here its renderer is said to be a GPU's, and the water is drawn anyway, so no probe of the renderer stops them first
   (renderer.ts). */

const SEED = "kS7CQ31Do6asvY-";
const hydrated = (page: Page) => page.waitForFunction(() => !("$_TSR" in window));

/** The players play here, and the reader's choice in Settings is `choice` where one is given. */
async function playing(page: Page, choice?: "full" | "reduce") {
  await page.addInitScript(choice => {
    const own = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function (
      this: WebGL2RenderingContext,
      p: number
    ) {
      return p === 0x9246 ? "A GPU" : own.call(this, p);
    };
    localStorage.setItem("grabient-water", "software");
    if (choice) localStorage.setItem("grabient-motion", choice);
  }, choice);
}

/** The first card's picture, lit by the pointer: its effect's holder, which says when a player covers its still. */
async function litCard(page: Page) {
  const picture = page.locator("main article [role=img]").first();
  await picture.hover();
  return picture.locator("span[data-kind]");
}

/** Settings in another tab of the same browser, its motion set to On. */
async function reduceElsewhere(page: Page) {
  const settings = await page.context().newPage();
  await settings.goto("/settings");
  await hydrated(settings);
  const motion = settings.getByRole("button", { name: /^Reduce motion:/ });
  await expect(async () => {
    await motion.click();
    await expect(motion).toHaveAccessibleName("Reduce motion: On", { timeout: 1000 });
  }).toPass();
  await settings.close();
}

test("behind another page, where there are no Settings, the effect holds its first frame while the device asks for less motion, and moves on once it no longer does", async ({
  page
}) => {
  await playing(page);
  await page.addInitScript(() => {
    const drawn = { count: 0 };
    Object.assign(window, { drawn });
    const own = WebGL2RenderingContext.prototype.drawArrays;
    WebGL2RenderingContext.prototype.drawArrays = function (
      this: WebGL2RenderingContext,
      ...a: Parameters<typeof own>
    ) {
      drawn.count++;
      return own.apply(this, a);
    };
  });
  /* a page of the app's origin that only holds the effect's tags, as another site's would */
  await page.route("**/a-page-with-an-effect", route =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="/${SEED}.css?style=blob&shape=3"><script src="/${SEED}.js?style=blob&shape=3" async></script></head><body><p>A page with an effect behind it.</p></body></html>`
    })
  );
  await page.goto("/a-page-with-an-effect");
  await expect(page.locator("html")).toHaveAttribute("data-grabient-playing", "", {
    timeout: 15_000
  });
  const drawn = () =>
    page.evaluate(() => (window as unknown as { drawn: { count: number } }).drawn.count);
  const moves = async () => {
    const from = await drawn();
    await page.waitForTimeout(600);
    return (await drawn()) > from;
  };
  expect(await moves()).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(200);
  expect(await moves()).toBe(false);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(moves).toBe(true);
});

test("a reader who chose Off sees a list's cards and the editor's picture move on a device that asks for less motion", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await playing(page, "full");
  await page.goto("/palettes?style=glass");
  await hydrated(page);
  const art = await litCard(page);
  await expect(art).toHaveAttribute("data-covered", "", { timeout: 15_000 });

  await page.goto(`/${SEED}?style=glass`);
  await hydrated(page);
  await expect(page.locator("canvas[data-live]")).toHaveCount(1, { timeout: 15_000 });
});

test("a card playing the blob stops at once when the reader chooses On in another tab, and plays no more", async ({
  page
}) => {
  await playing(page);
  await page.goto("/palettes?style=blob");
  await hydrated(page);
  const art = await litCard(page);
  await expect(art).toHaveAttribute("data-covered", "", { timeout: 15_000 });
  await reduceElsewhere(page);
  // its still back in its place, the player let go with its canvas
  await expect(art).not.toHaveAttribute("data-covered", /.*/);
  await expect(art.locator("canvas")).toHaveCount(0);
  // lit again, it stays still
  await page.mouse.move(2, 2);
  await litCard(page);
  await page.waitForTimeout(1000);
  await expect(art).not.toHaveAttribute("data-covered", /.*/);
});

test("the editor's fluted glass fades to its still when the reader chooses On in another tab, and makes no context once she has", async ({
  page
}) => {
  await playing(page);
  await page.goto(`/${SEED}?style=glass`);
  await hydrated(page);
  const canvas = page.locator("canvas[data-live]");
  await expect(canvas).toHaveCount(1, { timeout: 15_000 });
  await reduceElsewhere(page);
  await expect(canvas).toHaveCount(0);

  // a page loaded from then on holds the still from its first frame: no player is made
  const contexts = await page.context().newPage();
  await contexts.addInitScript(() => {
    const made: string[] = [];
    Object.assign(window, { made });
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...rest: unknown[]
    ) {
      if (kind === "webgl2") made.push(kind);
      return (get as (...a: unknown[]) => RenderingContext | null).call(this, kind, ...rest);
    } as typeof get;
  });
  await contexts.goto(`/${SEED}?style=glass`);
  await hydrated(contexts);
  await contexts.waitForTimeout(3000);
  expect(await contexts.evaluate(() => (window as unknown as { made: string[] }).made)).toEqual([]);
});
