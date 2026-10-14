import { expect, type Page, type Route, test } from "@playwright/test";

/* The collections' pages as a reader meets them when a read fails. The lists the reader moves to are answered here,
   so the tests stand whatever collections the local database holds. */

const SEED = "kS7CQ31Do6asvY-";
const SLUG = "e2e-gradients";
const hydrated = (page: Page) => page.waitForFunction(() => !("$_TSR" in window));

const summary = {
  slug: SLUG,
  title: "End to end gradients",
  description: "",
  tags: ["blue"],
  visibility: "public",
  owner: { kind: "agent", name: "grabient" },
  itemCount: 1,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  saves: 0,
  preview: [
    {
      seed: SEED,
      style: "linearGradient",
      steps: 7,
      angle: 90,
      createdAt: 1_700_000_000_000,
      likes: 0,
      position: 0
    }
  ]
};
/** Rising's first page, holding the one collection. */
const rising = (route: Route) =>
  route.fulfill({
    json: {
      query: "",
      sort: "rising",
      page: 1,
      limit: 24,
      total: 1,
      totalPages: 1,
      fetchedAt: Date.now(),
      items: [summary]
    }
  });

/** An account signed in here: the session answers with it, and its copy hears from the server once and holds
    `collections`. Every other private read is refused. */
async function signIn(page: Page, name: string, admin: boolean, collections: object[] = []) {
  const account = {
    id: `e2e-${name}`,
    name,
    email: `${name}@grabient.test`,
    emailVerified: true,
    image: null,
    username: `e2e-${name}`,
    createdAt: Date.UTC(2026, 6, 15)
  };
  await page.route("**/api/me/**", route => route.fulfill({ status: 404, json: {} }));
  await page.route("**/api/auth/get-session*", route =>
    route.fulfill({ json: { session: { id: "e2e", userId: account.id }, user: account } })
  );
  await page.route("**/api/me/sync*", route =>
    route.fulfill({
      json: {
        cursor: 1,
        likes: [],
        unliked: [],
        collections,
        removed: [],
        lastMutation: 0,
        results: [],
        admin,
        account
      }
    })
  );
  return account;
}

test("signed out, the selection's Save leads to sign in and asks for no account's collections", async ({
  page
}) => {
  const asked: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/me/")) asked.push(url.pathname);
  });
  await page.goto("/palettes");
  await hydrated(page);
  await page
    .locator("main article")
    .first()
    .getByRole("button", { name: "Add to selection" })
    .focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: /^Selection/ })
    .first()
    .click();
  await page.getByRole("radio", { name: "Save" }).click();
  await expect(page.getByText("Sign in to save collections.")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(asked).toEqual([]);
});

test("a press on another order keeps the collections page: its field, its row and the focus on the choice", async ({
  page
}) => {
  await page.route(
    url => url.pathname === "/api/collections" && url.searchParams.get("sort") === "rising",
    rising
  );
  await page.goto("/collections");
  await hydrated(page);
  await page.getByRole("searchbox").evaluate(el => el.setAttribute("data-was", "here"));
  const order = (name: RegExp) =>
    page.getByRole("navigation", { name: "Order" }).getByRole("link", { name });
  await order(/^Rising/).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/collections\/rising$/);
  await expect(page.locator(`main a[href="/${SLUG}/rising"]`)).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveAttribute("data-was", "here");
  await expect(order(/^Rising/)).toBeFocused();
  await order(/^Popular/).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/collections$/);
  await expect(page.getByRole("searchbox")).toHaveAttribute("data-was", "here");
  await expect(order(/^Popular/)).toBeFocused();
});

test("a list read again on purpose that fails keeps its groups beside the reason and Retry", async ({
  page
}) => {
  let failing = false;
  await page.route(
    url => url.pathname === "/api/collections" && url.searchParams.get("sort") === "rising",
    route => (failing ? route.abort() : rising(route))
  );
  await page.goto("/collections");
  await hydrated(page);
  const group = page.locator(`main a[href="/${SLUG}/rising"]`);
  await page.locator('main a[href="/collections/rising"]').click();
  await expect(group).toBeVisible();
  await page.locator('main a[href="/collections"]').click();
  await expect(page).toHaveURL(/\/collections$/);
  failing = true;
  await page.locator('main a[href="/collections/rising"]').click();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.locator("main")).toContainText("Couldn't load collections.");
  await expect(page.locator("main")).not.toContainText("Failed to fetch");
  await expect(group).toBeVisible();
});

test("a collection opened from a list keeps the list's summary when its own read fails", async ({
  page
}) => {
  await page.route(
    url => url.pathname === "/api/collections" && url.searchParams.get("sort") === "rising",
    rising
  );
  await page.route(
    url => url.pathname === `/api/collections/${SLUG}`,
    route => route.abort()
  );
  await page.goto("/collections");
  await hydrated(page);
  await page.locator('main a[href="/collections/rising"]').click();
  await page.locator(`main a[href="/${SLUG}/rising"]`).click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/rising$`));
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.locator("main h1")).toHaveText(summary.title);
  await expect(page.locator("main article")).toHaveCount(1);
  await expect(page.locator("main")).toContainText("Couldn't load this collection.");
});

test("each page's head holds one block of structured data, its own", async ({ page }) => {
  await page.route(
    url => url.pathname === "/api/collections" && url.searchParams.get("sort") === "rising",
    rising
  );
  const { preview, ...words } = summary;
  await page.route(
    url => url.pathname === `/api/collections/${SLUG}`,
    route =>
      route.fulfill({
        json: { ...words, items: preview.map(({ seed, ...p }) => ({ kseed: seed, ...p })) }
      })
  );
  const blocks = page.locator('script[type="application/ld+json"]');
  const kinds = () =>
    blocks.evaluateAll(scripts =>
      scripts.flatMap(script =>
        (JSON.parse(script.textContent ?? "[]") as { "@type": string }[]).map(node => node["@type"])
      )
    );
  await page.goto("/collections");
  await hydrated(page);
  await expect(blocks).toHaveCount(1);
  await page.locator('main a[href="/collections/rising"]').click();
  await page.locator(`main a[href="/${SLUG}/rising"]`).click();
  await expect(page.locator("main h1")).toHaveText(summary.title);
  await expect(blocks).toHaveCount(1);
  expect(await kinds()).toContain("BreadcrumbList");
  await page.locator("main a", { hasText: "Collections" }).first().click();
  await expect(page).toHaveURL(/\/collections\/rising$/);
  await expect(blocks).toHaveCount(1);
  expect(await kinds()).not.toContain("BreadcrumbList");
});

test("an admin's own collection made private says so at its new address, and quick presses send one write", async ({
  page
}) => {
  // the account's copy hears it is an admin's and holds none of its collections, so the writes go to the server
  const admin = await signIn(page, "admin", true);
  const { preview, ...words } = summary;
  const shown = { ...words, owner: { kind: "user", name: admin.username, display: admin.name } };
  const doc = { ...shown, items: preview.map(({ seed, ...p }) => ({ kseed: seed, ...p })) };
  const hidden = { ...doc, slug: `@${admin.username}/${SLUG}`, visibility: "private" };
  const state = (collection: typeof doc) => ({
    owned: true,
    canCurate: false,
    canDelete: true,
    copy: null,
    votes: {},
    collection
  });
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
          items: [{ ...shown, preview }]
        }
      })
  );
  const writes: string[] = [];
  await page.route(`**/api/collections/${SLUG}`, async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: doc });
    writes.push(route.request().postData() ?? "");
    await new Promise(resolve => setTimeout(resolve, 600));
    await route.fulfill({ json: { collection: hidden } });
  });
  await page.route(`**/api/collections/${encodeURIComponent(hidden.slug)}*`, route =>
    route.fulfill({ status: 404, json: {} })
  );
  await page.route(`**/api/me/collections/${SLUG}/state*`, route =>
    route.fulfill({ json: state(doc) })
  );
  await page.route(`**/api/me/collections/${encodeURIComponent(hidden.slug)}/state*`, route =>
    route.fulfill({ json: state(hidden) })
  );
  await page.goto("/collections");
  await hydrated(page);
  await page.locator('main a[href="/collections/rising"]').click();
  await page.locator(`main a[href="/${SLUG}/rising"]`).click();
  const turn = page.locator("main button", { hasText: /^\s*(Make|Now) (public|private)$/ });
  await expect(turn).toHaveText("Make private");
  // private, public and private again while the first write is on its way: one write, ending on the last press
  await turn.click();
  await expect(turn).toHaveText("Now private");
  await turn.click();
  await expect(turn).toHaveText("Now public");
  await turn.click();
  await expect(page).toHaveURL(`/${hidden.slug}/rising`);
  await expect(turn).toHaveText("Now private");
  expect(writes).toEqual([JSON.stringify({ visibility: "private" })]);
});

test("a search of Saved whose server read fails answers from the account's copy", async ({
  page
}) => {
  const { preview, ...words } = summary;
  const blues = {
    ...words,
    id: "e2e-blues",
    slug: "@e2e-ada/my-blues",
    title: "My blues",
    visibility: "private",
    owner: { kind: "user", name: "e2e-ada", display: "ada" },
    url: "/@e2e-ada/my-blues",
    preview,
    items: preview.map(({ seed, ...p }) => ({ kseed: seed, ...p }))
  };
  await signIn(page, "ada", false, [blues]);
  await page.route(
    url => url.pathname === "/api/me/collections" && url.searchParams.has("q"),
    route => route.abort()
  );
  await page.goto("/collections/saved");
  await hydrated(page);
  const group = page.locator("main").getByRole("heading", { name: "My blues" });
  await expect(group).toBeVisible();
  await page.getByRole("searchbox").fill("blues");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/collections\/saved\?q=blues$/);
  await expect(group).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("Couldn't load your collections.");
});

test("a signed-in reader's one look at a public collection is counted once", async ({ page }) => {
  await signIn(page, "reader", false);
  await page.route(
    url => url.pathname === "/api/collections" && url.searchParams.get("sort") === "rising",
    rising
  );
  const { preview, ...words } = summary;
  await page.route(`**/api/collections/${SLUG}`, route =>
    route.fulfill({
      json: { ...words, items: preview.map(({ seed, ...p }) => ({ kseed: seed, ...p })) }
    })
  );
  const seen: string[] = [];
  page.on("request", request => {
    const body = request.postData() ?? "";
    if (new URL(request.url()).pathname === "/api/used" && body.includes('"view"')) seen.push(body);
  });
  await page.goto("/collections");
  await hydrated(page);
  await page.locator('main a[href="/collections/rising"]').click();
  await page.locator(`main a[href="/${SLUG}/rising"]`).click();
  await expect(page.locator("main h1")).toHaveText(summary.title);
  // what a page saw is sent once the reader is there: at the first input
  await page.mouse.move(200, 300);
  await page.keyboard.press("Shift");
  await page.waitForLoadState("networkidle");
  await page.mouse.move(300, 400);
  await expect.poll(() => seen.length).toBe(1);
  await page.waitForTimeout(1000);
  expect(seen).toHaveLength(1);
});

test("each undo and redo of a pick says what it did, and a new collection goes back through the copy offline", async ({
  page
}) => {
  const { preview, ...words } = summary;
  const blues = {
    ...words,
    id: "e2e-blues",
    slug: "@e2e-ada/my-blues",
    title: "My blues",
    visibility: "private",
    owner: { kind: "user", name: "e2e-ada", display: "ada" },
    url: "/@e2e-ada/my-blues",
    preview,
    items: preview.map(({ seed, ...p }) => ({ kseed: seed, ...p }))
  };
  await signIn(page, "ada", false, [blues]);
  // the checklist may ask before the copy has heard from the server
  await page.route(
    url => url.pathname === "/api/me/collections",
    route =>
      route.fulfill({
        json: {
          query: "",
          sort: "newest",
          page: 1,
          limit: 96,
          total: 1,
          totalPages: 1,
          fetchedAt: Date.now(),
          items: [{ ...words, ...blues, items: undefined }]
        }
      })
  );
  await page.goto("/palettes");
  await hydrated(page);
  const card = page.locator("main article").first();
  await card.getByRole("button", { name: "Add to selection" }).focus();
  await page.keyboard.press("Enter");
  await card.getByRole("button", { name: "Add to collection" }).click();
  const list = page.getByRole("dialog", { name: "Add to collection" });
  const said = page.locator("main p[aria-live]").first();
  await list.getByRole("button", { name: /My blues/ }).click();
  await expect(said).toHaveText("Added to My blues.");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(said).toHaveText("Removed from My blues.");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(said).toHaveText("Added to My blues.");
  await list.getByRole("button", { name: "New collection" }).click();
  const title = list.getByRole("textbox", { name: "Title" });
  await expect(title).toBeFocused();
  await title.fill("Review temp");
  await title.press("Enter");
  await expect(said).toHaveText("Added to Review temp.");
  await page.context().setOffline(true);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(said).toHaveText("Review temp deleted.");
});

test("a crawler's search of the collections whose words were read in part is kept by no cache", async ({
  request
}) => {
  const crawler = {
    "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
  };
  for (const path of [
    "/collections?q=quetzalcoatl+marsh+zz",
    "/collections/rising?q=quetzalcoatl+marsh+zz"
  ]) {
    const answer = await request.get(path, { headers: crawler, maxRedirects: 0 });
    expect(answer.status()).toBe(200);
    expect(answer.headers()["cdn-cache-control"]).toBe("no-store");
  }
});

test("a palette the admin likes is offered no curation", async ({ page }) => {
  await signIn(page, "admin", true);
  await page.route(
    url => url.pathname === "/api/collections" && url.searchParams.get("sort") === "rising",
    rising
  );
  const { preview, ...words } = summary;
  await page.route(`**/api/collections/${SLUG}`, route =>
    route.fulfill({
      json: { ...words, items: preview.map(({ seed, ...p }) => ({ kseed: seed, ...p })) }
    })
  );
  await page.route(`**/api/me/collections/${SLUG}/state*`, route =>
    route.fulfill({
      json: { owned: false, canCurate: true, canDelete: true, copy: null, votes: {}, notes: [] }
    })
  );
  // no person liked it, as the server knows: it leaves out the admin's own likes
  await page.route("**/api/me/palettes?*", route => route.fulfill({ json: { liked: [] } }));
  await page.goto("/collections");
  await hydrated(page);
  await page.locator('main a[href="/collections/rising"]').click();
  await page.locator(`main a[href="/${SLUG}/rising"]`).click();
  const card = page.locator("main article").first();
  const view = card.getByRole("button", { name: "Set view" });
  await expect(view).toBeEnabled();
  await card.getByRole("button", { name: /^Like/ }).click();
  await expect(view).toBeDisabled();
});

test("Saved shows a pick made on another page when the reader comes back", async ({ page }) => {
  const { preview, ...words } = summary;
  await signIn(page, "ada", false, [
    {
      ...words,
      id: "e2e-blues",
      slug: "@e2e-ada/my-blues",
      title: "My blues",
      visibility: "private",
      owner: { kind: "user", name: "e2e-ada", display: "ada" },
      url: "/@e2e-ada/my-blues",
      preview,
      items: preview.map(({ seed, ...p }) => ({ kseed: seed, ...p }))
    }
  ]);
  await page.goto("/collections/saved");
  await hydrated(page);
  const blues = page.getByRole("region", { name: "My blues" });
  await expect(blues).toContainText("1 palette");
  await page
    .getByRole("navigation", { name: "Order" })
    .getByRole("link", { name: /^Popular/ })
    .click();
  await expect(page).toHaveURL(/\/collections$/);
  const card = page.locator("main article").first();
  await card.hover();
  await card.getByRole("button", { name: "Add to selection" }).click();
  await card.getByRole("button", { name: "Add to collection" }).click();
  await page
    .getByRole("dialog", { name: "Add to collection" })
    .getByRole("button", { name: /My blues/ })
    .click();
  await expect(page.locator("main p[aria-live]").first()).toHaveText("Added to My blues.");
  await page.goBack();
  await expect(page).toHaveURL(/\/collections\/saved$/);
  await expect(blues).toContainText("2 palettes");
});

test("a fit vote made on a collection's page is there when the reader comes back", async ({
  page
}) => {
  await signIn(page, "reader", false);
  await page.route(
    url => url.pathname === "/api/collections" && url.searchParams.get("sort") === "rising",
    rising
  );
  const { preview, ...words } = summary;
  await page.route(`**/api/collections/${SLUG}`, route =>
    route.fulfill({
      json: { ...words, items: preview.map(({ seed, ...p }) => ({ kseed: seed, ...p })) }
    })
  );
  // the server keeps the reader's votes
  const votes: Record<string, string> = {};
  await page.route(`**/api/me/collections/${SLUG}/state*`, route =>
    route.fulfill({
      json: { owned: false, canCurate: false, canDelete: false, copy: null, votes }
    })
  );
  await page.route(`**/api/me/collections/${SLUG}/votes`, route => {
    const { seed, vote } = route.request().postDataJSON() as { seed: string; vote: string };
    votes[seed] = vote;
    return route.fulfill({ json: { seed, vote } });
  });
  await page.goto("/collections");
  await hydrated(page);
  await page.locator('main a[href="/collections/rising"]').click();
  await page.locator(`main a[href="/${SLUG}/rising"]`).click();
  const good = page
    .locator("main article")
    .first()
    .getByRole("button", { name: /^Good fit/ });
  await expect(good).toHaveAttribute("aria-pressed", "false");
  await good.click();
  await expect(good).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => votes[SEED]).toBe("up");
  await page.locator("main a", { hasText: "Collections" }).first().click();
  await expect(page).toHaveURL(/\/collections\/rising$/);
  await page.goBack();
  await expect(page.locator("main h1")).toHaveText(summary.title);
  await expect(good).toHaveAttribute("aria-pressed", "true");
});
