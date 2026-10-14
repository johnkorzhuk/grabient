import { devices, expect, type Page, type Route, test } from "@playwright/test";

/* The editor at a palette's address: the static page the server sends, the editor the browser draws over it, the
   address that follows each edit in place, the undo the entry keeps, and what the page asks the server. */

/* The first tests meet a dev server that has transformed nothing yet, and they run beside each other: each has a
   minute. */
test.describe.configure({ timeout: 60_000 });

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

test.describe("while the editor's code loads", () => {
  /** Holds every script the page asks for; the returned function lets them through, or fails them. */
  async function holdScripts(page: Page) {
    const held: Route[] = [];
    let holding = true;
    await page.route("**/*", route => {
      if (holding && route.request().resourceType() === "script") held.push(route);
      else void route.continue();
    });
    return async (how: "continue" | "abort") => {
      holding = false;
      await Promise.all(held.map(route => (how === "abort" ? route.abort() : route.continue())));
    };
  }
  /** Whether the static page was visible, frame by frame, from the first frame that held it. */
  const frames = (page: Page) => page.evaluate(() => (window as { shown?: boolean[] }).shown ?? []);
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const shown: boolean[] = [];
      Object.assign(window, { shown });
      const record = () => {
        const fallback = document.querySelector(".palette-static");
        if (fallback && shown.length < 2000) shown.push(fallback.checkVisibility());
        requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
    });
  });

  test("no frame shows the static page, and the editor takes its place", async ({ page }) => {
    const release = await holdScripts(page);
    await page.goto(`/${SEED}?size=2560x1664`, { waitUntil: "commit" });
    await page.locator(".palette-static").waitFor({ state: "attached" });
    await page.waitForTimeout(500);
    await expect(page.locator("html")).toHaveAttribute("data-seed-boot", "");
    await expect(page.locator(".palette-static")).toBeHidden();
    const before = await frames(page);
    expect(before.length).toBeGreaterThan(0);
    expect(before).not.toContain(true);
    await release("continue");
    await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible({
      timeout: 30_000
    });
    await expect(page.locator("html")).not.toHaveAttribute("data-seed-boot");
    await expect(page.locator(".palette-static")).toHaveCount(0);
    expect(await frames(page)).not.toContain(true);
  });

  /** The picture and the strip as a reader sees them: their boxes, the picture's paint, and each hex where it stands. */
  const drawn = (page: Page, root: string) =>
    page.evaluate(root => {
      const at = document.querySelector(root);
      const box = (el: Element | null | undefined) => {
        const r = el?.getBoundingClientRect();
        return r ? [r.x, r.y, r.width, r.height].map(v => Math.round(v * 10) / 10) : null;
      };
      const stage = at?.querySelector('[class*="_stage_"]');
      const art = stage?.firstElementChild;
      const strip = at?.querySelector('[aria-label="Palette colors"], [class*="_still_"]');
      const labels = [...(strip?.querySelectorAll('[class*="_label_"]') ?? [])]
        .filter(label => label.checkVisibility())
        .map(label => {
          const style = getComputedStyle(label);
          return [label.textContent, box(label), style.fontSize, style.writingMode].join(" ");
        });
      return {
        stage: box(stage),
        art: art ? [box(art), getComputedStyle(art).backgroundImage] : null,
        strip: box(strip),
        labels
      };
    }, root);
  for (const { name, address, size, away } of [
    {
      name: "beside its side",
      address: `/${SEED}`,
      size: { width: 1600, height: 1000 },
      away: false
    },
    {
      name: "at a fixed size with the side away",
      address: `/${SEED}?size=1920x1080`,
      size: { width: 1600, height: 1000 },
      away: true
    },
    {
      name: "in two rows of upright hexes",
      address: `/${SEED}?steps=21`,
      size: { width: 1024, height: 768 },
      away: false
    },
    { name: "on a phone", address: `/${SEED}`, size: { width: 390, height: 844 }, away: false }
  ])
    test(`the picture and the strip stand drawn before the editor's code comes, as the editor draws them: ${name}`, async ({
      page
    }) => {
      await page.setViewportSize(size);
      if (away) await page.addInitScript(() => localStorage.setItem("grabient-panel", "0"));
      const release = await holdScripts(page);
      await page.goto(address, { waitUntil: "commit" });
      const boot = '[aria-hidden="true"][data-beside-scrollbar]';
      await page.locator(boot).waitFor();
      await page.evaluate(() => document.fonts.ready);
      const before = await drawn(page, boot);
      await release("continue");
      // the scripts held come at once, which a dev server that has transformed nothing yet takes its time over
      await expect(page.getByRole("img", { name: "The gradient" })).toBeVisible({
        timeout: 30_000
      });
      const after = await drawn(page, "main#main");
      expect(before.labels.length).toBeGreaterThan(0);
      expect(before).toEqual(after);
    });

  test("a script that fails to load brings the static page back, whole", async ({ page }) => {
    const release = await holdScripts(page);
    await page.goto(`/${SEED}?size=2560x1664`, { waitUntil: "commit" });
    await page.locator(".palette-static").waitFor({ state: "attached" });
    await expect(page.locator(".palette-static")).toBeHidden();
    await release("abort");
    await expect(page.locator(".palette-static")).toBeVisible();
    await expect(page.locator("html")).not.toHaveAttribute("data-seed-boot");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download PNG" })).toHaveAttribute(
      "href",
      `/${SEED}.png?w=2560&h=1664`
    );
  });

  test("an editor whose own code fails to load leaves the static page, whole", async ({ page }) => {
    await page.route(
      /\/(assets\/Editor-[^/]+\.js|src\/features\/editor\/Editor\.tsx)(\?|$)/,
      route => route.abort()
    );
    await page.goto(`/${SEED}`);
    await expect(page.locator(".palette-static")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("html")).not.toHaveAttribute("data-seed-boot");
    await expect(page.getByRole("complementary", { name: "Editor" })).toHaveCount(0);
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });
    test("the static page is whole", async ({ page }) => {
      await page.goto(`/${SEED}?size=2560x1664`);
      await expect(page.locator("html")).not.toHaveAttribute("data-seed-boot");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const picture = await page.locator(".palette-static [data-picture]").boundingBox();
      if (!picture) throw new Error("no picture");
      expect(picture.width / picture.height).toBeCloseTo(2560 / 1664, 2);
      await expect(page.locator(".palette-static [data-stops] li")).toHaveCount(7);
      await expect(page.getByRole("link", { name: "Palette JSON" })).toHaveAttribute(
        "href",
        `/${SEED}.json`
      );
    });
  });
});

test("the editor lays itself out without an error to report", async ({ page }) => {
  const reports: string[] = [];
  page.on("request", request => {
    if (request.url().endsWith("/api/client-error")) reports.push(request.postData() ?? "");
  });
  await open(page);
  // past the first frames, where its observers measure the page, the strip and the sheet
  await page.waitForTimeout(1000);
  expect(reports).toEqual([]);
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
  const asks: URL[] = [];
  page.on("request", r => {
    const url = new URL(r.url());
    if (url.pathname === "/api/search.json") asks.push(url);
  });
  await open(page);
  // edits on the first screen ask nothing
  await page.keyboard.press("b");
  await page.keyboard.press("b");
  await page.waitForTimeout(1500);
  expect(asks).toEqual([]);
  await page.mouse.move(200, 200);
  await page.mouse.wheel(0, 2000);
  // the sheet's own code comes with the scroll, which a dev server transforms as it is asked for
  await expect.poll(() => asks.length, { timeout: 30_000 }).toBe(1);
  expect(asks[0]?.searchParams.get("query")).toBe(new URL(page.url()).pathname.slice(1));
});

test("the order of the palettes like this one is kept for the tab, in the lists' own record", async ({
  page
}) => {
  await open(page);
  const order = page.getByRole("radiogroup", { name: "Order" });
  await order.scrollIntoViewIfNeeded();
  await expect(order.getByRole("radio", { name: "Popular" })).toBeChecked();
  await order.getByRole("radio", { name: /^Rising/ }).click();
  await expect(order.getByRole("radio", { name: /^Rising/ })).toBeChecked();
  const kept = await page.evaluate(() => sessionStorage.getItem("grabient-order"));
  expect(JSON.parse(kept ?? "null")).toMatchObject({ order: "rising" });
  await page.reload();
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
  const again = page.getByRole("radiogroup", { name: "Order" });
  await again.scrollIntoViewIfNeeded();
  await expect(again.getByRole("radio", { name: /^Rising/ })).toBeChecked();
});

test("a palette in the selection offers Add to collection under its check", async ({ page }) => {
  await open(page);
  const presses = page.getByRole("group", { name: "Palette actions" }).first();
  await expect(presses.getByRole("button", { name: /^Like/ })).toBeVisible();
  await expect(presses.getByLabel("Add to collection")).toHaveCount(0);
  await presses.getByRole("button", { name: "Add to selection" }).click();
  await expect(presses.getByRole("button", { name: "Remove from selection" })).toBeVisible();
  const collect = presses.getByLabel("Add to collection");
  await expect(collect).toBeVisible();
  const check = await presses.getByRole("button", { name: "Remove from selection" }).boundingBox();
  const under = await collect.boundingBox();
  if (!check || !under) throw new Error("no check or no press under it");
  expect(under.y).toBeGreaterThanOrEqual(check.y + check.height);
  expect(Math.abs(under.x - check.x)).toBeLessThanOrEqual(1);
});

test("the header's bar carries the palette from the server's render", async ({ request }) => {
  const html = await (await request.get(`/${SEED}`)).text();
  const first = /palette-static[\s\S]*?(#[0-9a-f]{6})/.exec(html)?.[1];
  expect(first).toBeTruthy();
  const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
  expect(header).toContain(first);
});

test("an old link no map holds is fitted in the browser, and its address becomes the palette's", async ({
  page,
  request
}) => {
  const old = "/_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKa?style=angularGradient";
  // the server never fits one: to a crawler it is no page
  expect((await request.get(old, { maxRedirects: 0 })).status()).toBe(404);
  await page.goto(old);
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
  expect(here(page)).toBe("/kYq5wTxGc3MlDuPtT7O58281NAs8?style=angularGradient");
});

test("an old id nobody can read is a page not found, never a page named by the id", async ({
  page
}) => {
  const answer = await page.goto("/_abc1234");
  expect(answer?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.getByText("_abc1234")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Editor" })).toHaveCount(0);
});

test("the selection's export screen takes the page's place, and Escape closes it", async ({
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

test("About's first figure is the editor's own controls over a palette of its own, with its own undo", async ({
  page
}) => {
  await page.goto("/about");
  const chips = page.getByRole("listbox", { name: "Keyframes" }).first().getByRole("option");
  const undo = page.getByRole("button", { name: "Undo" }).first();
  const reset = page.getByRole("button", { name: "Reset", includeHidden: true }).first();
  await expect(chips).toHaveCount(5);
  await expect(undo).toBeDisabled();
  await expect(reset).toBeHidden();
  const address = here(page);
  await page.getByRole("button", { name: "Add keyframe" }).first().click();
  await expect(chips).toHaveCount(6);
  await expect(undo).toBeEnabled();
  await expect(reset).toBeVisible();
  // a held keyframe's numbers are its own, as in the editor's side
  await chips.nth(1).click();
  await expect(page.getByRole("spinbutton", { name: "Lightness", exact: true })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Lightness start" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("spinbutton", { name: "Lightness start" }).first()).toBeVisible();
  // the figure's undo is its own: the page's address and history never move
  await page.keyboard.press("ControlOrMeta+z");
  await expect(chips).toHaveCount(5);
  await expect(undo).toBeDisabled();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(chips).toHaveCount(6);
  expect(here(page)).toBe(address);
  // Reset puts the opened palette back as one step the undo takes back
  await reset.click();
  await expect(chips).toHaveCount(5);
  await expect(reset).toBeHidden();
  await undo.click();
  await expect(chips).toHaveCount(6);
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

  test("the way into the selection floats at the page's corner only once the page has moved", async ({
    page
  }) => {
    await open(page);
    // a tap on the picture shows its presses to a finger
    await page.getByRole("img", { name: "The gradient" }).tap();
    await page.getByRole("button", { name: "Add to selection" }).first().tap();
    const floating = page.locator("main > span").getByRole("button", {
      name: /^Selection/,
      includeHidden: true
    });
    await expect(floating).toHaveCount(1);
    // at rest the picture's own presses hold the way in
    await expect(floating).toBeHidden();
    await expect(
      page
        .getByRole("group", { name: "Palette actions" })
        .first()
        .getByRole("button", {
          name: /^Selection/
        })
    ).toBeVisible();
    await page.evaluate(() => scrollTo(0, 400));
    await expect(floating).toBeVisible();
    await expect(floating).toBeInViewport();
    await page.evaluate(() => scrollTo(0, 0));
    await expect(floating).toBeHidden();
  });
});
