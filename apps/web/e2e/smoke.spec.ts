import { readdirSync, readFileSync } from "node:fs";
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

test("the Worker's modules go up with their maps, and a reader is sent none", {
  tag: "@served"
}, async ({ page, request }) => {
  // the build this project serves, as `cf deploy --prebuilt` uploads it: each map in the Worker's bundle goes up with
  // the module that names it; Start's generated manifest and the bundler's runtime helpers have no source to map
  const output = new URL("../.cloudflare/output/v0/workers/default/", import.meta.url);
  const bundle = new URL("bundle/", output);
  const files = readdirSync(bundle, { recursive: true }).map(String);
  const unmapped = files
    .filter(file => file.endsWith(".js"))
    .filter(file => {
      const name = file.split("/").at(-1);
      const code = readFileSync(new URL(file, bundle), "utf8").trimEnd();
      return !files.includes(`${file}.map`) || !code.endsWith(`//# sourceMappingURL=${name}.map`);
    });
  expect(unmapped).toContainEqual(expect.stringMatching(/^assets\/_tanstack-start-manifest_v-/));
  expect(
    unmapped.filter(
      file => !/^assets\/(?:_tanstack-start-manifest_v-|rolldown-runtime-)/.test(file)
    )
  ).toEqual([]);
  const main = JSON.parse(readFileSync(new URL("index.js.map", bundle), "utf8"));
  expect(main.sources).toContainEqual(expect.stringMatching(/src\/server\/pipeline\.ts$/));
  // the files the site serves are the browser's, and none of them is a map
  const served = readdirSync(new URL("assets/", output), { recursive: true }).map(String);
  expect(served.filter(file => file.endsWith(".map"))).toEqual([]);

  const scripts: string[] = [];
  page.on("response", response => {
    // the site's own files: a worker the page makes from a blob has no address to ask
    if (response.request().resourceType() === "script" && response.url().startsWith("http"))
      scripts.push(response.url());
  });
  await page.goto("/palettes");
  await page.waitForFunction(() => !("$_TSR" in window));
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) {
    expect(await (await request.get(script)).text()).not.toContain("sourceMappingURL");
    expect((await request.get(`${script}.map`)).status()).toBe(404);
  }
});
