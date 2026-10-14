import { expect, type Page, test } from "@playwright/test";

/* The gallery's lists as a signed-out reader meets them: what a page asks the server, the cards the server drew that
   wait for the reader, the selection, a heart and Saved. They read the palettes `pnpm db:setup` loads. */

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
