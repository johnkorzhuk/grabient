import { expect, type Locator, type Page, test } from "@playwright/test";

/* The frame around the pages: what its header's corner writes to the address and when the route takes it, the view a
   list takes on the way back, the document a page arrives in, the tab's icon, and the way from a list to the palette or
   collection it opens and back. */

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

test("a list that Back returns to takes the view chosen since it was left", async ({ page }) => {
  await open(page, "/palettes");
  await page.getByRole("link", { name: /^Rising/ }).click();
  await expect(page).toHaveURL(/\/palettes\/rising$/);
  await page.getByRole("button", { name: /^Appearance/ }).click();
  await page.getByRole("button", { name: "Radial", exact: true }).click();
  await expect(page).toHaveURL(/\/palettes\/rising\?style=radialGradient$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/palettes\?style=radialGradient$/);
  // the tab still remembers it: the wordmark leads home in it
  await expect(page.locator("header a[data-home]")).toHaveAttribute(
    "href",
    "/?style=radialGradient"
  );
  await page.goForward();
  await expect(page).toHaveURL(/\/palettes\/rising\?style=radialGradient$/);
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

/** Whether the site's stylesheet applies to the page: the design system's tokens stand on the document. */
const styled = (page: Page) =>
  page.evaluate(
    () => getComputedStyle(document.documentElement).getPropertyValue("--space-s1") !== ""
  );
/** Every error the page reports as its own from now on: a page that threw posts one. */
function reported(page: Page): string[] {
  const reports: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/client-error")
      reports.push(request.postData() ?? "");
  });
  return reports;
}
/** Goes down the page to where `link` stands and presses it from there with the keyboard. Returns that depth. */
async function pressFrom(page: Page, link: Locator): Promise<number> {
  await link.evaluate(a => scrollTo(0, Math.max(0, a.getBoundingClientRect().top + scrollY - 400)));
  const depth = await page.evaluate(() => scrollY);
  await link.evaluate(a => (a as HTMLElement).focus({ preventScroll: true }));
  await page.keyboard.press("Enter");
  return depth;
}
/** Back from the page a list opened: the list's own heading, at the depth it was left at. */
async function backTo(page: Page, heading: string, depth: number) {
  await page.goBack();
  await expect(page.locator("main h1").first()).toHaveText(heading);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(depth);
}
const editor = (page: Page) => page.getByRole("complementary", { name: "Editor" });

for (const address of ["/", "/?q=blue", "/palettes", "/palettes/rising", "/palettes?q=blue"]) {
  test(`a palette opened from ${address} lands styled, and Back returns to the list at its depth`, async ({
    page
  }) => {
    const reports = reported(page);
    await open(page, address);
    const heading = (await page.locator("main h1").first().textContent()) ?? "";
    const depth = await pressFrom(page, page.locator('main article a[aria-label="Edit"]').nth(8));
    await expect(editor(page)).toBeVisible();
    expect(await styled(page)).toBe(true);
    await backTo(page, heading, depth);
    expect(await styled(page)).toBe(true);
    expect(reports).toEqual([]);
  });
}

test("the palette a search's heading pictures opens from it, and Back returns to the search", async ({
  page
}) => {
  const reports = reported(page);
  await open(page, "/palettes?q=kS7CQ31Do6asvY-");
  const heading = (await page.locator("main h1").first().textContent()) ?? "";
  const depth = await pressFrom(
    page,
    page.locator('main a[href^="/kS7CQ31Do6asvY-"]:not(article a)').first()
  );
  await expect(editor(page)).toBeVisible();
  expect(await styled(page)).toBe(true);
  await backTo(page, heading, depth);
  expect(reports).toEqual([]);
});

test("a palette opened from Saved lands styled, and Back returns to Saved", async ({ page }) => {
  const reports = reported(page);
  const reader = {
    id: "e2e-reader",
    name: "Reader",
    email: "reader@grabient.test",
    emailVerified: true,
    image: null,
    username: "reader",
    createdAt: Date.UTC(2026, 6, 15)
  };
  await page.route("**/api/auth/get-session*", route =>
    route.fulfill({ json: { session: { id: "e2e", userId: reader.id }, user: reader } })
  );
  await page.route("**/api/me/**", route => route.fulfill({ status: 401, json: {} }));
  const items = ["kS7CQ31Do6asvY-", "kSEiS3qzo6dQvY-"].map((kseed, i) => ({
    kseed,
    style: "linearGradient",
    steps: 7,
    angle: 90,
    likes: 1,
    createdAt: 1_700_000_000_000 - i
  }));
  await page.route(
    url => url.pathname === "/api/saved",
    route =>
      route.fulfill({
        json: { items, total: 2, page: 1, totalPages: 1, fetchedAt: Date.now() }
      })
  );
  await open(page, "/palettes/saved");
  const heading = (await page.locator("main h1").first().textContent()) ?? "";
  const depth = await pressFrom(page, page.locator('main article a[aria-label="Edit"]').nth(1));
  await expect(page).toHaveURL(/\/kSEiS3qzo6dQvY-/);
  await expect(editor(page)).toBeVisible();
  expect(await styled(page)).toBe(true);
  await backTo(page, heading, depth);
  await expect(page.locator("main article")).toHaveCount(2);
  expect(reports).toEqual([]);
});

test("a collection opened from a list by its title, and a palette from the collection, each land styled and Back returns to each", async ({
  page
}) => {
  const reports = reported(page);
  const slug = "e2e-gradients";
  const preview = [{ seed: "kS7CQ31Do6asvY-", style: "linearGradient", steps: 7, angle: 90 }];
  const words = {
    slug,
    title: "End to end gradients",
    description: "",
    tags: ["blue"],
    visibility: "public",
    owner: { kind: "agent", name: "grabient" },
    itemCount: 1,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    saves: 0
  };
  const item = { createdAt: 1_700_000_000_000, likes: 0, position: 0 };
  await page.route(
    url => url.pathname === "/api/collections" && url.searchParams.get("sort") === "rising",
    route =>
      route.fulfill({
        json: {
          query: "",
          sort: "rising",
          page: 1,
          limit: 24,
          total: 1,
          totalPages: 1,
          fetchedAt: Date.now(),
          items: [{ ...words, preview: preview.map(p => ({ ...p, ...item })) }]
        }
      })
  );
  await page.route(
    url => url.pathname === `/api/collections/${slug}`,
    route =>
      route.fulfill({
        json: { ...words, items: preview.map(({ seed, ...p }) => ({ kseed: seed, ...p, ...item })) }
      })
  );
  await open(page, "/collections");
  await page.locator('main a[href="/collections/rising"]').click();
  const list = page.locator("main h1").first();
  await expect(page.locator(`main a[href="/${slug}/rising"]`)).toBeVisible();
  const heading = (await list.textContent()) ?? "";
  const depth = await pressFrom(page, page.locator(`main a[href="/${slug}/rising"]`));
  await expect(list).toHaveText(words.title);
  expect(await styled(page)).toBe(true);
  const inside = await pressFrom(page, page.locator('main article a[aria-label="Edit"]').first());
  await expect(editor(page)).toBeVisible();
  expect(await styled(page)).toBe(true);
  await backTo(page, words.title, inside);
  await backTo(page, heading, depth);
  expect(reports).toEqual([]);
});

test("an address the browser refuses to write lands once it lets writes through again", async ({
  page
}) => {
  // Safari's way past its rate: every history write throws while the page is refused
  await page.addInitScript(() => {
    const refusable = (write: History["pushState"]) =>
      function (this: History, ...args: Parameters<History["pushState"]>) {
        if ((window as { refusing?: boolean }).refusing)
          throw new DOMException("Too many calls to the history", "SecurityError");
        return write.apply(this, args);
      };
    History.prototype.pushState = refusable(History.prototype.pushState);
    History.prototype.replaceState = refusable(History.prototype.replaceState);
  });
  const here = () => new URL(page.url()).pathname;
  await open(page, "/kS7CQ31Do6asvY-");
  await expect(editor(page)).toBeVisible();
  await page.evaluate(() => Object.assign(window, { refusing: true }));
  await page.keyboard.press("i");
  await page.keyboard.press("e");
  await page.waitForTimeout(1000);
  expect(here()).toBe("/kS7CQ31Do6asvY-");
  await page.evaluate(() => Object.assign(window, { refusing: false }));
  // the latest edit, a second after the last refusal, and the writes after it as they come
  await expect.poll(here).toBe("/kSqF5vKzob4kSRW");
  await page.keyboard.press("i");
  await expect.poll(here).not.toBe("/kSqF5vKzob4kSRW");
});

test("a page whose reactivity stopped loads whole once, and after that loads whole each page it is asked for", async ({
  page
}) => {
  /** Stops the app's own Solid as an error that escapes every boundary does. */
  const halt = () =>
    page.evaluate(async () => {
      const url = performance
        .getEntriesByType("resource")
        .map(entry => entry.name)
        .find(name => /\/\.vite\/deps\/solid-js\.js/.test(name));
      const { createRoot, createEffect } = await import(url ?? "");
      createRoot(() =>
        createEffect(
          () => 1,
          () => {
            throw new Error("escaped every boundary");
          }
        )
      );
    });
  /** Marks this document, which a whole load replaces. */
  const mark = () => page.evaluate(() => Object.assign(window, { marked: true }));
  const marked = () => page.evaluate(() => "marked" in window);
  /** Waits for the page to answer a press: it has hydrated, which would revive a reactivity stopped before. */
  const live = async () => {
    const appearance = page.getByRole("button", { name: /^Appearance/ });
    await appearance.click();
    await expect(appearance).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(appearance).toHaveAttribute("aria-expanded", "false");
  };
  await open(page, "/palettes");
  await live();
  await mark();
  await halt();
  await page.waitForFunction(() => !("marked" in window));
  await live();
  // stopped again within ten seconds: the page stays as it stands
  await mark();
  await halt();
  await page.waitForTimeout(1000);
  expect(await marked()).toBe(true);
  // and the page a press asks for loads whole
  await page.locator('main a[href="/palettes/rising"]').first().click();
  await expect(page).toHaveURL(/\/palettes\/rising$/);
  await page.waitForFunction(() => !("marked" in window));
  await expect(page).toHaveTitle(/^Rising/);
});

test("a page opened with the service worker's stored shell wears its own frame", async ({
  page,
  request
}) => {
  // with no connection the worker answers a page it never kept with Saved's document
  const shell = await (await request.get("/palettes/saved")).text();
  await page.route(
    url => url.pathname === "/settings" || url.pathname === "/login",
    route =>
      route.request().isNavigationRequest()
        ? route.fulfill({ contentType: "text/html", body: shell })
        : route.continue()
  );
  const header = page.locator("header");
  await page.goto("/settings");
  await expect(page.locator("main h1")).toHaveText("Settings");
  await expect(header.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(header.getByRole("button", { name: /^Appearance/ })).toHaveCount(0);
  // a sheet's corner holds the theme alone
  await page.goto("/login");
  await expect(page.locator("main h1")).toHaveText("Sign in");
  await expect(header.getByRole("button", { name: /theme$/ })).toBeVisible();
  await expect(header.getByRole("button", { name: "Sign in" })).toHaveCount(0);
  await expect(header.getByRole("button", { name: /^Appearance/ })).toHaveCount(0);
});
