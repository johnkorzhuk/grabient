import { expect, test } from "@playwright/test";

const PAGES = [
  { address: "/", lang: "en", landed: "/", next: "/palettes" },
  { address: "/ja/", lang: "ja", landed: "/ja", next: "/ja/palettes" }
];

for (const { address, lang, landed, next } of PAGES) {
  test(`${address} loads in ${lang}, hydrates and navigates in the app`, async ({
    page,
    baseURL
  }) => {
    const errors: string[] = [];
    page.on("console", message => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", error => errors.push(error.message));

    await page.goto(address);
    expect(new URL(page.url()).pathname).toBe(landed);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    // the router removes its handoff once the app has hydrated the server's document
    await page.waitForFunction(() => !("$_TSR" in window));

    // a press is now the app's own navigation: the document stays
    await page.evaluate(() => Object.assign(window, { sameDocument: true }));
    await page.locator("main a").click();
    await expect(page).toHaveURL(`${baseURL}${next}`);
    await expect(page.locator("main h1")).toBeVisible();
    expect(await page.evaluate(() => "sameDocument" in window)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("after a deploy, the next page loads whole with the build that serves it", async ({
  page
}) => {
  await page.goto("/");
  await page.waitForFunction(() => !("$_TSR" in window));
  // an answer from another build than the page's own
  await page.route("**/api/build", route =>
    route.fulfill({ status: 204, headers: { "Server-Timing": 'build;desc="newer"' } })
  );
  await page.evaluate(() => fetch("/api/build"));
  await page.evaluate(() => Object.assign(window, { sameDocument: true }));
  await Promise.all([page.waitForEvent("load"), page.locator("main a").click()]);
  expect(new URL(page.url()).pathname).toBe("/palettes");
  expect(await page.evaluate(() => "sameDocument" in window)).toBe(false);
});
