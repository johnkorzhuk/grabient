import { expect, type Page, test } from "@playwright/test";

/* The frame around the pages: what its header's corner writes to the address and when the route takes it, the document a page
   arrives in, and the tab's icon. */

/** Opens a page and waits for the app to have hydrated the server's document. */
async function open(page: Page, address: string) {
  await page.goto(address);
  await page.waitForFunction(() => !("$_TSR" in window));
}

test("a view being set reaches the address in the lists' order, and the route and the links once it rests", async ({
  page
}) => {
  await open(page, "/palettes?page=2");
  const entries = await page.evaluate(() => history.length);
  const link = page.locator("article a[href]").first();
  const own = await link.getAttribute("href");
  // the wordmark leads home in the view the route has: it changes when the route takes a value, never before
  await page.evaluate(() => {
    const home = document.querySelector("header a[data-home]");
    const taken: (string | null)[] = [];
    Object.assign(window, { taken });
    if (home)
      new MutationObserver(() => taken.push(home.getAttribute("href"))).observe(home, {
        attributeFilter: ["href"]
      });
  });
  await page.getByRole("button", { name: /^Appearance/ }).click();
  await page.getByRole("spinbutton", { name: "Steps" }).focus();
  // two seconds of steps with no rest between them: Auto, then 3 to 22
  for (let press = 0; press < 20; press++) {
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(100);
  }
  expect(new URL(page.url()).search).toMatch(/^\?steps=\d+&page=2$/);
  expect(await link.getAttribute("href")).toBe(own);
  await expect.poll(() => link.getAttribute("href")).toContain("steps=22");
  await expect(page).toHaveURL(/\/palettes\?steps=22&page=2$/);
  await expect(page.locator("header a[data-home]")).toHaveAttribute("href", "/?steps=22");
  expect(await page.evaluate(() => (window as unknown as { taken: string[] }).taken)).toEqual([
    "/?steps=22"
  ]);
  // a style takes its place ahead of the steps, where the server keeps it
  await page.getByRole("button", { name: "Radial", exact: true }).click();
  await expect(page).toHaveURL(/\/palettes\?style=radialGradient&steps=22&page=2$/);
  expect(await page.evaluate(() => history.length)).toBe(entries);
  // the address as written is the one the server answers at, with no redirect
  const answer = await page.request.get(page.url(), { maxRedirects: 0 });
  expect(answer.status()).toBe(200);
});

test("no document holds a NUL, which HTML allows nowhere", async ({ request }) => {
  for (const address of ["/", "/palettes?page=2", "/about", "/kS7CQ31Do6asvY-", "/no/such/page"]) {
    const document = await (await request.get(address)).body();
    expect(document.includes(0), address).toBe(false);
  }
});

test("the tab's icon wears a palette on its page, follows its edits, and is the week's on a list", async ({
  page
}) => {
  await open(page, "/kS7CQ31Do6asvY-");
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
  const icon = page.locator('link[rel="icon"][type="image/svg+xml"]').first();
  await expect(icon).toHaveAttribute("href", /^data:image\/svg\+xml,/);
  const first = (await icon.getAttribute("href")) ?? "";
  await page.keyboard.press("b");
  await expect(icon).not.toHaveAttribute("href", first);
  await expect(icon).toHaveAttribute("href", /^data:image\/svg\+xml,/);
  await page.locator("header a[data-home]").click();
  await expect(icon).toHaveAttribute("href", /^\/favicon\/\d{4}-w\d{2}\.svg\?v=\w+$/);
});
