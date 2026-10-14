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
    await page.locator(`main a[href="${next}"]`).click();
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
  await Promise.all([page.waitForEvent("load"), page.locator('main a[href="/palettes"]').click()]);
  expect(new URL(page.url()).pathname).toBe("/palettes");
  expect(await page.evaluate(() => "sameDocument" in window)).toBe(false);
});

test("a brand page's links are the app's own navigation, and focus lands on the new page", async ({
  page,
  baseURL
}) => {
  await page.goto("/about");
  await page.waitForFunction(() => !("$_TSR" in window));
  await page.evaluate(() => Object.assign(window, { sameDocument: true }));
  await page
    .getByRole("navigation", { name: "About and account" })
    .getByRole("link", { name: "Contact" })
    .click();
  await expect(page).toHaveURL(`${baseURL}/contact`);
  await expect(page).toHaveTitle("Contact | Grabient");
  await expect(page.locator("main")).toBeFocused();
  expect(await page.evaluate(() => "sameDocument" in window)).toBe(true);
});

test("an address with a parameter that has no value answers with its page", async ({ request }) => {
  // an account's pages are never kept at the edge, so each of these is rendered
  for (const address of ["/login?redirect=", "/settings?tab=", "/palettes/saved?selection"]) {
    const answer = await request.get(address, { maxRedirects: 0 });
    expect(answer.status(), address).toBe(200);
  }
  // a public page whose own word has no value, which the edge keeps: a fixed page leads any query of its away
  expect((await request.get("/palettes?selection", { maxRedirects: 0 })).status()).toBe(200);
  const fixed = await request.get("/about?x=", { maxRedirects: 0 });
  expect(fixed.status()).toBe(301);
  expect(fixed.headers().location).toMatch(/\/about$/);
});

test("an API address answers in its own way whatever the method, never with a page", async ({
  request
}) => {
  for (const path of ["/api/used", "/api/client-error"])
    expect((await request.get(path)).status()).toBe(204);
  const contact = await request.get("/api/contact");
  expect(contact.status()).toBe(405);
  expect(contact.headers()["content-type"]).toContain("application/json");
});
