import { expect, type Page, test } from "@playwright/test";

/* The gallery's lists as a reader sets how they are drawn: the header's control, the address it writes, what the feed
   keeps through a change and the view the tab remembers. Then the home searched, which reads the collections list's
   own pages. They read the palettes `pnpm db:setup` loads. */

const hydrated = (page: Page) => page.waitForFunction(() => !("$_TSR" in window));
const remembered = (page: Page) => page.evaluate(() => sessionStorage.getItem("grabient-view"));

test("a change of view keeps the pages that joined and the depth the reader scrolled to", async ({
  page
}) => {
  await page.goto("/palettes");
  await hydrated(page);
  const feed = page.locator("[data-count]").first();
  const cards = async () => Number(await feed.getAttribute("data-count"));
  await page.mouse.move(600, 600);
  // three pages deep: a feed that let its pages go would take back only the next one
  await expect
    .poll(
      async () => {
        await page.mouse.wheel(0, 1500);
        return cards();
      },
      { timeout: 20_000 }
    )
    .toBeGreaterThanOrEqual(96);
  const joined = await cards();
  await page.getByRole("button", { name: /^Appearance/ }).click();
  const depth = await page.evaluate(() => scrollY);
  await page.getByRole("button", { name: "Radial", exact: true }).click();
  await expect(page).toHaveURL(/\/palettes\?style=radialGradient$/);
  await expect(page.locator("article").first()).toBeVisible();
  // a page still on its way may join, and none is let go
  expect(await cards()).toBeGreaterThanOrEqual(joined);
  expect(await page.evaluate(() => scrollY)).toBe(depth);
});

test("steps draw at once, the address follows, and the links take them once the change rests", async ({
  page
}) => {
  await page.goto("/palettes");
  await hydrated(page);
  const link = page.locator("article a[href]").first();
  const own = await link.getAttribute("href");
  await page.getByRole("button", { name: /^Appearance/ }).click();
  await page.getByRole("spinbutton", { name: "Steps" }).focus();
  // two seconds of steps with no rest between them: Auto, then 3 to 22
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(100);
  }
  expect(new URL(page.url()).searchParams.get("steps")).not.toBeNull();
  expect(await link.getAttribute("href")).toBe(own);
  await expect.poll(() => link.getAttribute("href")).toContain("steps=22");
  await expect(page).toHaveURL(/\/palettes\?steps=22$/);
});

test("the control writes a list's address in the one order the server keeps", async ({
  page,
  request
}) => {
  await page.goto("/palettes?limit=48");
  await hydrated(page);
  await page.getByRole("button", { name: /^Appearance/ }).click();
  await page.getByRole("spinbutton", { name: "Steps" }).focus();
  await page.keyboard.press("ArrowUp");
  await expect(page).toHaveURL(/\/palettes\?steps=3&limit=48$/);
  await page.getByRole("button", { name: "Radial", exact: true }).click();
  await expect(page).toHaveURL(/\/palettes\?style=radialGradient&steps=3&limit=48$/);
  const answer = await request.get(page.url(), { maxRedirects: 0 });
  expect(answer.status()).toBe(200);
});

test("a document that opens on a list takes its view, which the wordmark leads home in", async ({
  page
}) => {
  const home = page.locator("a[data-home]");
  await page.goto("/palettes?style=linearSwatches&steps=5");
  await expect(home).toHaveAttribute("href", "/?style=linearSwatches&steps=5");
  // a page that draws no palettes keeps it
  await page.goto("/about");
  await expect(home).toHaveAttribute("href", "/?style=linearSwatches&steps=5");
  // and a list opened in every palette's own view lets it go
  await page.goto("/palettes");
  await expect.poll(() => remembered(page)).toContain('"style":"auto"');
  await expect(home).toHaveAttribute("href", "/");
});

test("the home searched reads the collections list's own page, which the list then asks for no more", async ({
  page
}) => {
  const asked: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname === "/api/collections") asked.push(url.search);
  });
  await page.goto("/");
  await hydrated(page);
  const field = page.getByPlaceholder("Search palettes and collections");
  await field.fill("blue");
  await field.press("Enter");
  await expect(page).toHaveURL(/\/\?q=blue$/);
  // as the list asks: the popular order, and the words read through the model
  await expect.poll(() => asked[0]).toBe("?sort=popular&page=1&limit=24&q=blue&model=1");
  await page.locator('main a[href="/collections?q=blue"]').click();
  await expect(page).toHaveURL(/\/collections\?q=blue$/);
  await expect(page.locator("main h1")).toBeVisible();
  expect(asked.filter(query => query.includes("page=1&"))).toHaveLength(1);
});
