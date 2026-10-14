import { expect, type Page, test } from "@playwright/test";

/* The frame around the pages: what its header's corner writes to the address and when the route takes it. */

/** Opens a page and waits for the app to have hydrated the server's document. */
async function open(page: Page, address: string) {
  await page.goto(address);
  await page.waitForFunction(() => !("$_TSR" in window));
}

test("a view being set reaches the address in the lists' order, and the route once it rests", async ({
  page
}) => {
  await open(page, "/palettes?page=2");
  const entries = await page.evaluate(() => history.length);
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
  for (let press = 0; press < 4; press++) await page.keyboard.press("ArrowUp", { delay: 60 });
  await expect.poll(() => new URL(page.url()).search).toBe("?steps=6&page=2");
  await expect(page.locator("header a[data-home]")).toHaveAttribute("href", "/?steps=6");
  expect(await page.evaluate(() => (window as unknown as { taken: string[] }).taken)).toEqual([
    "/?steps=6"
  ]);
  expect(await page.evaluate(() => history.length)).toBe(entries);
  // the address as written is the one the server answers at, with no redirect
  const answer = await page.request.get(page.url(), { maxRedirects: 0 });
  expect(answer.status()).toBe(200);
});
