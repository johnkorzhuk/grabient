import { devices, expect, type Page, test } from "@playwright/test";

/* The gallery's lists as a signed-out reader meets them: what a page asks the server, the cards the server drew that
   wait for the reader, the selection, a heart and Saved. They read the palettes `pnpm db:setup` loads. */

const SEED = "kS7CQ31Do6asvY-";
const hydrated = (page: Page) => page.waitForFunction(() => !("$_TSR" in window));
const here = (page: Page) => {
  const url = new URL(page.url());
  return decodeURIComponent(url.pathname + url.search);
};
/** Every call to the API the page makes from now on, as its path and query. */
function calls(page: Page): string[] {
  const asked: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) asked.push(url.pathname + url.search);
  });
  return asked;
}
const card = (page: Page, at: number) => page.locator("main article").nth(at);
/** Searches by a picture of four colors, one to each quarter, and answers the picture its colors are read from. */
async function searchByQuarters(page: Page) {
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 200;
    const pen = canvas.getContext("2d")!;
    for (const [i, color] of ["#2f5fd0", "#39a64b", "#d93a3a", "#e8c534"].entries()) {
      pen.fillStyle = color;
      pen.fillRect((i % 2) * 100, Math.floor(i / 2) * 100, 100, 100);
    }
    return canvas.toDataURL("image/png").split(",")[1]!;
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "quarters.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64")
  });
  return page.getByRole("group", { name: "Your image" });
}
const middle = (box: { x: number; y: number; width: number; height: number }) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2
});
const like = (page: Page, at: number) => card(page, at).locator('button[aria-label^="Like"]');
/** Whether a card is the server's own markup, which no handler is bound to. */
const still = (page: Page, at: number) =>
  card(page, at).evaluate(el => !!el.closest('[class*="still"]'));

test("a list hydrates from what the server read, and the next page joins as the reader nears the end", async ({
  page
}) => {
  const asked = calls(page);
  await page.goto("/palettes");
  await hydrated(page);
  await expect(page.locator("main article")).toHaveCount(24);
  await page.waitForTimeout(1000);
  // the session is the one thing a page asks for: the palettes and their counts came with the document
  expect(asked.filter(path => !path.startsWith("/api/auth/"))).toEqual([]);
  await page.mouse.move(600, 600);
  await page.mouse.wheel(0, 3000);
  await expect
    .poll(() => asked.find(path => path.startsWith("/api/palettes")))
    .toBe("/api/palettes?sort=popular&page=2&limit=24");
  await expect
    .poll(async () => Number(await page.locator("[data-count]").first().getAttribute("data-count")))
    .toBeGreaterThanOrEqual(48);
  expect(here(page)).toBe("/palettes");
});

test("a screen taller than the first page asks for the next one once, and draws it", async ({
  page
}) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  const asked = calls(page);
  await page.goto("/palettes");
  await hydrated(page);
  const feed = page.locator("[data-count]").first();
  await expect(feed).toHaveAttribute("data-count", "48");
  const tall = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.waitForTimeout(1500);
  // the page that joined pushed the end out of reach, so no other page was asked for
  expect(asked.filter(path => path.startsWith("/api/palettes"))).toEqual([
    "/api/palettes?sort=popular&page=2&limit=24"
  ]);
  await expect(feed).toHaveAttribute("data-count", "48");
  expect(await page.locator("main article").count()).toBeGreaterThan(24);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(tall);
});

test("the footer under a list that grows as it scrolls is reached by the keyboard and stays in view, until a wheel moves on", async ({
  page
}) => {
  const asked = calls(page);
  await page.goto("/palettes");
  await hydrated(page);
  // from the page's first stop, Shift+Tab goes round to its last: the footer's
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  const footer = page.locator("footer");
  await expect(footer.locator(":focus")).toHaveCount(1);
  for (let press = 0; press < 3; press++) {
    await page.waitForTimeout(800);
    await expect(page.locator(":focus")).toBeInViewport();
    await page.keyboard.press("Shift+Tab");
  }
  await expect(footer.locator(":focus")).toHaveCount(1);
  expect(asked.filter(path => path.startsWith("/api/palettes"))).toEqual([]);
  // a wheel is the reader going on by other means: the list grows again under the focus left in the footer
  await page.mouse.move(600, 400);
  await page.mouse.wheel(0, -2000);
  await page.mouse.wheel(0, 4000);
  await expect
    .poll(() => asked.find(path => path.startsWith("/api/palettes")))
    .toBe("/api/palettes?sort=popular&page=2&limit=24");
});

test("the search field is named in the browser's own tree, empty and with words in it", async ({
  page
}) => {
  await page.goto("/palettes");
  await hydrated(page);
  // Chrome's computed name, which a screen reader and voice control are given
  const cdp = await page.context().newCDPSession(page);
  const name = async () => {
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    return nodes.find(node => node.role?.value === "searchbox")?.name?.value;
  };
  expect(await name()).toBe("Search palettes");
  await page.getByRole("searchbox").fill("sunset");
  expect(await name()).toBe("Search palettes");
});

test("forced colors leave every palette its own colors: the cards, the stage, the strip, the chips and the tiles", async ({
  page
}) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/palettes");
  await hydrated(page);
  const painted = async (paint: ReturnType<Page["locator"]>) => {
    await expect(paint).toHaveCSS("forced-color-adjust", "none");
    expect(await paint.evaluate(el => getComputedStyle(el).backgroundImage)).not.toBe("none");
  };
  await painted(page.locator("main article [role=img]").first());
  await page.goto(`/${SEED}`);
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
  await painted(page.getByRole("img", { name: "The gradient" }));
  await expect(
    page.getByRole("group", { name: "Palette colors" }).getByRole("button").first()
  ).toHaveCSS("forced-color-adjust", "none");
  const chip = page.getByRole("option", { name: /^Keyframe 1,/ });
  await expect(chip).toHaveCSS("forced-color-adjust", "none");
  expect(await chip.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(
    await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)
  );
  await page.getByRole("button", { name: /^Appearance/ }).click();
  await painted(page.locator("#appearance-menu button[aria-label='Radial'] > span").first());
});

test("a card the server drew answers focus and a press that reach it before the reader moves", async ({
  page
}) => {
  await page.goto("/palettes");
  await hydrated(page);
  expect(await still(page, 3)).toBe(false);
  expect(await still(page, 6)).toBe(true);
  // a screen reader's own cursor: the focus lands on a control with no key and no pointer
  await like(page, 6).evaluate(el => (el as HTMLElement).focus());
  expect(await still(page, 6)).toBe(false);
  await expect(like(page, 6)).toBeFocused();
  // and the control answers: signed out, a heart leads to sign in and back
  await page.keyboard.press("Enter");
  await expect.poll(() => here(page)).toBe("/login?redirect=/palettes");
});

test("a card's tools leave with the pointer after a press of the mouse, and stay with the keyboard's focus", async ({
  page
}) => {
  await page.goto("/palettes");
  await hydrated(page);
  const card = page.locator("main article").first();
  const art = card.locator('[class*="_art_"]').first();
  const shown = () => art.evaluate(el => getComputedStyle(el).getPropertyValue("--show").trim());
  await card.hover();
  await card.getByRole("button", { name: "Add to selection" }).click();
  await expect.poll(shown).toBe("1");
  // the press keeps the focus, and the tools go with the pointer all the same
  await page.mouse.move(4, 4);
  await expect.poll(shown).toBe("0");
  // the keyboard's focus shows them where the pointer is not
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect.poll(shown).toBe("1");
});

test("Tab leads from the last live card into the next, live by then", async ({ page }) => {
  await page.goto("/palettes/rising");
  await hydrated(page);
  await like(page, 3).focus();
  await page.keyboard.press("Tab");
  const next = await page.evaluate(() => {
    const at = document.activeElement?.closest("article");
    return {
      card: at ? [...document.querySelectorAll("main article")].indexOf(at) : -1,
      still: !!at?.closest('[class*="still"]')
    };
  });
  expect(next).toEqual({ card: 4, still: false });
});

test("a press on another order keeps the page: its field, its row and the focus on the choice pressed", async ({
  page
}) => {
  await page.goto("/palettes");
  await hydrated(page);
  await page.getByRole("searchbox").evaluate(el => el.setAttribute("data-was", "here"));
  const rising = page
    .getByRole("navigation", { name: "Order" })
    .getByRole("link", { name: /^Rising/ });
  await rising.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => here(page)).toBe("/palettes/rising");
  await expect(page.getByRole("heading", { name: "Rising", level: 2 })).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveAttribute("data-was", "here");
  await expect(rising).toBeFocused();
});

test("a card's plus starts the selection, and its screen stands in the page's place until Escape", async ({
  page
}) => {
  await page.goto("/palettes");
  await hydrated(page);
  // the keyboard's way: a card's tools show to the focus
  await card(page, 0).getByRole("button", { name: "Add to selection" }).focus();
  await page.keyboard.press("Enter");
  const open = page.getByRole("button", { name: /^Selection/ }).first();
  await expect(open).toContainText("1");
  await open.click();
  await expect.poll(() => here(page)).toBe("/palettes?selection");
  await expect(page.getByRole("button", { name: "Close selection" })).toBeVisible();
  await expect(page.locator("main#main")).toBeHidden();
  await expect(page.locator("footer")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect.poll(() => here(page)).toBe("/palettes");
  await expect(page.locator("main#main")).toBeVisible();
  await expect(page.locator("footer")).toBeVisible();
  // the press is a step of the page's undo
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("button", { name: /^Selection/ })).toHaveCount(0);
});

/** A browser new to an account, which the session, the copy's sync and Saved's search answer as the server would:
    one like, of an admin's. Says each read of Saved. */
async function signedIn(page: Page): Promise<string[]> {
  const user = {
    id: "e2e-admin",
    name: "Admin",
    email: "admin@grabient.test",
    emailVerified: true,
    image: null,
    username: "admin",
    createdAt: Date.UTC(2026, 6, 15)
  };
  const view = { style: "linearGradient", steps: 7, angle: 90 } as const;
  const at = Date.UTC(2026, 9, 1);
  await page.route("**/api/auth/get-session*", route =>
    route.fulfill({ json: { session: { id: "e2e", userId: user.id }, user } })
  );
  // the copy's first sync lands after the page has asked for Saved, as it does over a network
  await page.route("**/api/me/sync", async route => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    await route.fulfill({
      json: {
        ...{ cursor: 1, reset: true, lastMutation: 0, admin: true },
        ...{ likes: [{ seed: SEED, ...view, at, likes: 3 }], unliked: [], collections: [] },
        ...{ removed: [], results: [] }
      }
    });
  });
  const read: string[] = [];
  await page.route("**/api/saved?*", route => {
    read.push(new URL(route.request().url()).search);
    return route.fulfill({
      json: {
        items: [{ kseed: SEED, ...view, likes: 3, createdAt: at }],
        ...{ total: 1, page: 1, totalPages: 1, query: "blue", tier: "vocabulary" },
        fetchedAt: Date.now()
      }
    });
  });
  return read;
}

test("Saved searched in a browser new to the account reads its page once", async ({ page }) => {
  const read = await signedIn(page);
  await page.goto("/palettes/saved?q=blue");
  await expect(card(page, 0)).toBeVisible();
  await page.waitForTimeout(1000);
  expect(read).toEqual(["?page=1&limit=24&q=blue"]);
});

test("Saved offers an admin no curation: every palette there is their own like", async ({
  page
}) => {
  await signedIn(page);
  await page.goto("/palettes/saved?q=blue");
  await card(page, 0).hover();
  await expect(card(page, 0).getByRole("link", { name: "Edit" })).toBeVisible();
  await expect(
    card(page, 0).getByRole("button", { name: /^(Set view|Delete palette)/ })
  ).toHaveCount(0);
});

test("a press between Saved and the public lists keeps the focus on the choice pressed", async ({
  page
}) => {
  await signedIn(page);
  await page.goto("/palettes");
  await hydrated(page);
  const order = page.getByRole("navigation", { name: "Order" });
  await order.getByRole("button", { name: "Saved" }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => here(page)).toBe("/palettes/saved");
  // Saved's own page stands, not the list it left while it came
  await expect(order.getByRole("button", { name: "Saved" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(order.getByRole("button", { name: "Saved" })).toBeFocused();
  await order.getByRole("link", { name: "Popular" }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => here(page)).toBe("/palettes");
  await expect(order.getByRole("link", { name: "Popular" })).toBeFocused();
});

/* With no connection, on the build a deploy serves: the service worker answers every document, and the account's copy
   what it holds. */
for (const viewport of [
  { width: 1600, height: 1000 },
  { width: 390, height: 844 }
])
  test(`with no connection Saved opens from the account's copy, loaded whole and from another page, ${viewport.width} wide`, {
    tag: "@served"
  }, async ({ page }) => {
    await page.setViewportSize(viewport);
    const asked = calls(page);
    const liked = card(page, 0).locator(`a[href^="/${SEED}"]`);
    await signedIn(page);
    await page.goto("/palettes/saved");
    await expect(liked).toBeVisible();
    // the copy's first sync, which Saved may have stopped waiting for, has landed
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.context().setOffline(true);
    await page.goto("/palettes/saved");
    await expect(liked).toBeVisible();
    await page.goto("/about");
    await page.locator("header").getByRole("button", { name: "Your account" }).click();
    await page.getByRole("menuitem", { name: "Saved palettes" }).click();
    await expect.poll(() => here(page)).toBe("/palettes/saved");
    await expect(liked).toBeVisible();
    // searched, its tags are a read that fails, which the page reports to nobody
    await page.goto("/palettes/saved?q=blue");
    await expect
      .poll(() => asked.some(path => path.startsWith("/api/search-suggestions?q=blue")))
      .toBe(true);
    await page.waitForLoadState("networkidle");
    expect(asked.filter(path => path === "/api/client-error")).toEqual([]);
  });

test("Saved opened with no connection asks for Rising's frames again once the connection returns", {
  tag: "@served"
}, async ({ page }) => {
  const rising = page
    .getByRole("navigation", { name: "Order" })
    .getByRole("link", { name: /^Rising/ });
  await signedIn(page);
  await page.goto("/palettes/saved");
  await expect(card(page, 0)).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.context().setOffline(true);
  await page.goto("/palettes/saved");
  await expect(card(page, 0)).toBeVisible();
  // an admin turned a second frame on meanwhile: Rising offers it once it is read
  await signedIn(page);
  await page.route("**/api/frames", route => route.fulfill({ json: { frames: ["1w", "3m"] } }));
  await page.context().setOffline(false);
  await expect(rising).toHaveAccessibleName(/^Rising 1w/);
});

test("with no connection a list never kept offers the account's own lists, which open", {
  tag: "@served"
}, async ({ page }) => {
  const liked = card(page, 0).locator(`a[href^="/${SEED}"]`);
  await signedIn(page);
  await page.goto("/palettes/saved");
  await expect(liked).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.context().setOffline(true);
  await page.goto("/");
  const main = page.locator("main");
  await expect(main.getByText("You're offline.")).toBeVisible();
  await expect(main.getByRole("link", { name: "Your collections" })).toHaveAttribute(
    "href",
    "/collections/saved"
  );
  await main.getByRole("link", { name: "Saved palettes" }).click();
  await expect.poll(() => here(page)).toBe("/palettes/saved");
  await expect(liked).toBeVisible();
});

test("signed out, Saved offers the way in and asks for nothing of an account", async ({ page }) => {
  const asked = calls(page);
  await page.goto("/palettes/saved?q=blue");
  await hydrated(page);
  await expect(
    page.getByRole("heading", { name: "Sign in to see your saved palettes." })
  ).toBeVisible();
  await expect(page.locator("main").getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    `/login?redirect=${encodeURIComponent("/palettes/saved?q=blue")}`
  );
  await page.waitForTimeout(500);
  expect(asked.filter(path => /^\/api\/(saved|me\/)/.test(path))).toEqual([]);
});

test("the home leads to the lists in the order the tab read last", async ({ page }) => {
  await page.goto("/palettes/rising");
  await hydrated(page);
  await page.locator("a[data-home]").click();
  await expect.poll(() => here(page)).toBe("/");
  await expect(
    page.getByRole("navigation", { name: "Lists" }).getByRole("link", { name: "Palettes" })
  ).toHaveAttribute("href", "/palettes/rising");
});

test("a color dragged on a picture searched by is let go where it lands: a click on the picture then leaves it, and a double-click adds one", async ({
  page
}) => {
  await page.goto("/palettes");
  await hydrated(page);
  const picture = await searchByQuarters(page);
  const colors = picture.getByRole("button", { name: /^Color \d+,/ });
  const first = colors.first();
  await expect(first).toBeVisible();
  await expect(colors).toHaveCount(4);
  const frame = await picture.locator("img").boundingBox();
  const was = await first.boundingBox();
  if (!frame || !was) throw new Error("no picture");
  const at = middle(was);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 15, at.y + 10, { steps: 5 });
  await page.mouse.up();
  await expect(first).toHaveAttribute("aria-pressed", "false");
  const dropped = await first.boundingBox();
  await page.mouse.click(frame.x + frame.width * 0.9, frame.y + frame.height * 0.9);
  await page.mouse.dblclick(frame.x + frame.width * 0.1, frame.y + frame.height * 0.85);
  await expect(colors).toHaveCount(5);
  expect(await first.boundingBox()).toEqual(dropped);
});

test.describe("on a phone", () => {
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices["Pixel 7"];
  test.use({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent });

  test("a color of a picture searched by moves to where the picture is pressed after its point, with no drag", async ({
    page
  }) => {
    await page.goto("/palettes");
    await hydrated(page);
    const picture = await searchByQuarters(page);
    const first = picture.getByRole("button", { name: /^Color 1,/ });
    await expect(first).toBeVisible();
    const named = await first.getAttribute("aria-label");
    const frame = await picture.locator("img").boundingBox();
    const was = await first.boundingBox();
    if (!frame || !was) throw new Error("no picture");
    // the far corner of the quarter across from the point's own, where no other point stands
    const at = middle(was);
    const to = {
      x: frame.x + frame.width * (at.x < middle(frame).x ? 0.92 : 0.08),
      y: frame.y + frame.height * (at.y < middle(frame).y ? 0.92 : 0.08)
    };
    await first.tap();
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await page.touchscreen.tap(to.x, to.y);
    await expect(first).not.toHaveAttribute("aria-label", named ?? "");
    await expect(first).toHaveAttribute("aria-pressed", "false");
    const now = await first.boundingBox();
    if (!now) throw new Error("no point");
    expect(Math.abs(middle(now).x - to.x)).toBeLessThan(2);
    expect(Math.abs(middle(now).y - to.y)).toBeLessThan(2);
  });
});
