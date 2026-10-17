import { expect, type Locator, type Page, type Route, test } from "@playwright/test";

/* The collections' pages as a reader meets them. The lists, collections and accounts a test moves through are answered
   here, so the tests stand whatever the local database holds. */

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
const risingWith = (collection: object) => (route: Route) =>
  route.fulfill({
    json: {
      query: "",
      sort: "rising",
      page: 1,
      limit: 24,
      total: 1,
      totalPages: 1,
      fetchedAt: Date.now(),
      items: [collection]
    }
  });
const rising = risingWith(summary);

/** A private collection of the account's own, as its copy holds it. */
const blues = {
  ...summary,
  id: "e2e-blues",
  slug: "@e2e-ada/my-blues",
  title: "My blues",
  visibility: "private",
  owner: { kind: "user", name: "e2e-ada", display: "ada" },
  url: "/@e2e-ada/my-blues",
  items: summary.preview.map(({ seed, ...p }) => ({ kseed: seed, ...p }))
};

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

test("a press on a collection's other order leaves the focus on it, in the page it leads to", async ({
  page
}) => {
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
  await page.goto("/collections");
  await hydrated(page);
  await page.locator('main a[href="/collections/rising"]').click();
  await page.locator(`main a[href="/${SLUG}/rising"]`).click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/rising$`));
  // the list stands until the collection has drawn
  await expect(page.locator("main h1")).toHaveText(summary.title);
  const order = page.locator("main").getByRole("navigation", { name: "Order" });
  await order.getByRole("link", { name: /^Popular/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/${SLUG}$`));
  await expect(order.getByRole("link", { name: /^Popular/ })).toBeFocused();
  await order.getByRole("link", { name: /^Rising/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/rising$`));
  await expect(order.getByRole("link", { name: /^Rising/ })).toBeFocused();
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

test("Save on someone else's collection says it saved, the keyboard on the Saved link that takes its place", async ({
  page
}) => {
  await signIn(page, "reader", false);
  await page.route(
    url => url.pathname === "/api/collections" && url.searchParams.get("sort") === "rising",
    rising
  );
  const { preview, ...words } = summary;
  const items = preview.map(({ seed, ...p }) => ({ kseed: seed, ...p }));
  await page.route(`**/api/collections/${SLUG}`, route =>
    route.fulfill({ json: { ...words, items } })
  );
  const copy = {
    ...words,
    slug: "@e2e-reader/e2e-gradients",
    visibility: "private",
    owner: { kind: "user", name: "e2e-reader" },
    items
  };
  await page.route(`**/api/collections/${SLUG}/copies`, route =>
    route.fulfill({
      json: {
        collection: copy,
        made: true,
        copy: {
          slug: copy.slug,
          source: { slug: SLUG, title: summary.title, colors: [] },
          behind: false,
          differs: false
        }
      }
    })
  );
  await page.goto("/collections");
  await hydrated(page);
  await page.locator('main a[href="/collections/rising"]').click();
  await page.locator(`main a[href="/${SLUG}/rising"]`).click();
  await expect(page.locator("main h1")).toHaveText(summary.title);
  await page.getByRole("button", { name: "Save", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: "Saved", exact: true })).toBeFocused();
  await expect(page.locator("main").getByRole("status")).toHaveText("Saved.");
});

test("each undo and redo of a pick says what it did, and a new collection goes back through the copy offline", async ({
  page
}) => {
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
          items: [{ ...blues, items: undefined }]
        }
      })
  );
  await page.goto("/palettes");
  await hydrated(page);
  // the account's copy has heard from the server, so the checklist names its collections
  await page.waitForLoadState("networkidle");
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

test("a pick leaves each of the account's collections where the checklist drew it, and opened again the latest changed lead", async ({
  page
}) => {
  const warm = {
    ...blues,
    id: "e2e-warm",
    slug: "@e2e-ada/warm-evenings",
    title: "Warm evenings",
    url: "/@e2e-ada/warm-evenings",
    updatedAt: blues.updatedAt + 60_000
  };
  await signIn(page, "ada", false, [blues, warm]);
  await page.goto("/palettes");
  await hydrated(page);
  // the account's copy has heard from the server, so the checklist names its collections
  await page.waitForLoadState("networkidle");
  const card = page.locator("main article").first();
  await card.getByRole("button", { name: "Add to selection" }).focus();
  await page.keyboard.press("Enter");
  await card.getByRole("button", { name: "Add to collection" }).click();
  const list = page.getByRole("dialog", { name: "Add to collection" });
  const rows = list.getByRole("button", { name: /^(My blues|Warm evenings)/ });
  await expect(rows).toHaveText([/^Warm evenings/, /^My blues/]);
  // the pick makes My blues the latest changed, and moves nothing under the pointer
  await rows.nth(1).click();
  await expect(page.locator("main p[aria-live]").first()).toHaveText(
    /^(Added to|Removed from) My blues\.$/
  );
  await page.waitForTimeout(500);
  await expect(rows).toHaveText([/^Warm evenings/, /^My blues/]);
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await card.getByRole("button", { name: "Add to collection" }).click();
  await expect(rows).toHaveText([/^My blues/, /^Warm evenings/]);
});

test("Add to collection open over a card is one piece: square where its parts meet, round at its outer corners", async ({
  page
}) => {
  await signIn(page, "ada", false, [blues]);
  await page.goto("/palettes");
  await hydrated(page);
  // the account's copy has heard from the server, so the checklist names its collections
  await page.waitForLoadState("networkidle");
  const card = page.locator("main article").first();
  await card.getByRole("button", { name: "Add to selection" }).focus();
  await page.keyboard.press("Enter");
  await card.getByRole("button", { name: "Add to collection" }).click();
  const list = page.getByRole("dialog", { name: "Add to collection" });
  await expect(list.getByRole("button", { name: /My blues/ })).toBeVisible();
  /* each corner in the order start-start, start-end, end-end, end-start: round, or square */
  const corners = (part: Locator) =>
    part.evaluate(el => {
      const s = getComputedStyle(el);
      return [
        s.borderStartStartRadius,
        s.borderStartEndRadius,
        s.borderEndEndRadius,
        s.borderEndStartRadius
      ].map(radius => (radius === "0px" ? "square" : "round"));
    });
  // New collection meets the close press at its end and the list under it
  expect(await corners(list.getByRole("button", { name: "New collection" }))).toEqual([
    "round",
    "square",
    "square",
    "square"
  ]);
  // the close press meets New collection at its start and the list under it
  expect(await corners(list.getByRole("button", { name: "Close" }))).toEqual([
    "square",
    "round",
    "square",
    "square"
  ]);
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
  // a palette of its own, so the list's first card is one it does not hold
  const held = [{ ...preview[0]!, seed: "kS7Q8Yy5S_SChv0" }];
  await signIn(page, "ada", false, [
    {
      ...words,
      id: "e2e-blues",
      slug: "@e2e-ada/my-blues",
      title: "My blues",
      visibility: "private",
      owner: { kind: "user", name: "e2e-ada", display: "ada" },
      url: "/@e2e-ada/my-blues",
      preview: held,
      items: held.map(({ seed, ...p }) => ({ kseed: seed, ...p }))
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
  await page.waitForLoadState("networkidle");
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

test("a reader's votes on a collection that could not be read are read again when the reader comes back", async ({
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
  // the first read of what the reader may do finds no connection; the server keeps a vote of theirs
  let reads = 0;
  await page.route(`**/api/me/collections/${SLUG}/state*`, route =>
    reads++ === 0
      ? route.abort("internetdisconnected")
      : route.fulfill({
          json: {
            owned: false,
            canCurate: false,
            canDelete: false,
            copy: null,
            votes: { [SEED]: "up" }
          }
        })
  );
  await page.goto("/collections");
  await hydrated(page);
  await page.locator('main a[href="/collections/rising"]').click();
  await page.locator(`main a[href="/${SLUG}/rising"]`).click();
  const good = page
    .locator("main article")
    .first()
    .getByRole("button", { name: /^Good fit/ });
  await expect.poll(() => reads).toBe(1);
  await expect(good).toHaveAttribute("aria-pressed", "false");
  await page.locator("main a", { hasText: "Collections" }).first().click();
  await expect(page).toHaveURL(/\/collections\/rising$/);
  await page.goBack();
  await expect(page.locator("main h1")).toHaveText(summary.title);
  await expect(good).toHaveAttribute("aria-pressed", "true");
});

test("a palette removed with the keyboard leaves the focus on its Undo, which gives it back", async ({
  page
}) => {
  await signIn(page, "ada", false, [blues]);
  await page.goto("/@e2e-ada/my-blues");
  await hydrated(page);
  const card = page.locator("main article").first();
  const remove = card.getByRole("button", { name: "Remove from collection" });
  await remove.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(card.getByRole("button", { name: "Undo" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(remove).toBeFocused();
});

test("a collection's read that failed and answers on Retry gives the tab the collection's title", async ({
  page
}) => {
  let failing = true;
  const { preview, ...words } = summary;
  await page.route(
    url => url.pathname === `/api/collections/${SLUG}`,
    route =>
      failing
        ? route.abort()
        : route.fulfill({
            json: { ...words, items: preview.map(({ seed, ...p }) => ({ kseed: seed, ...p })) }
          })
  );
  // a page that holds no summary of it, so the collection's own read is all the route has
  await page.goto("/palettes");
  await hydrated(page);
  await page.evaluate(href => {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = "into the collection";
    document.querySelector("main")!.append(link);
  }, `/${SLUG}`);
  await page.locator(`main a[href="/${SLUG}"]`).last().click();
  const retry = page.getByRole("button", { name: "Retry" });
  await expect(retry).toBeVisible();
  await expect(page).toHaveTitle(/^Palette collection/);
  failing = false;
  await retry.click();
  await expect(page.locator("main h1")).toHaveText(summary.title);
  await expect(page).toHaveTitle(new RegExp(`^${summary.title}`));
});

test("a private collection renamed on its page is the account's own at its new address", async ({
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
  const renamed = {
    ...blues,
    slug: "@e2e-ada/deep-blues",
    title: "Deep blues",
    url: "/@e2e-ada/deep-blues"
  };
  await page.route(
    url => url.pathname === `/api/collections/${encodeURIComponent(blues.slug)}`,
    route =>
      route.request().method() === "PATCH"
        ? route.fulfill({
            json: { collection: renamed, moved: { from: blues.slug, to: renamed.slug } }
          })
        : route.fallback()
  );
  // the server holds it at its new address, and says so to its owner
  await page.route(
    url => url.pathname === `/api/me/collections/${encodeURIComponent(renamed.slug)}/state`,
    route =>
      route.fulfill({
        json: {
          owned: true,
          canCurate: false,
          canDelete: true,
          copy: null,
          votes: {},
          collection: renamed
        }
      })
  );
  // the public read of an account's address, which can only refuse a private one
  const asked: string[] = [];
  page.on("request", request => {
    const { pathname } = new URL(request.url());
    if (request.method() === "GET" && pathname.startsWith("/api/collections/%40"))
      asked.push(pathname);
  });
  await page.goto(blues.url);
  await hydrated(page);
  await page.getByRole("button", { name: "Edit My blues", exact: true }).focus();
  await page.keyboard.press("Enter");
  const title = page.getByRole("textbox", { name: "Title" });
  await expect(title).toBeFocused();
  await title.fill("Deep blues");
  // the page at the new address reads its state once it stands, after anything its address read
  const stands = page.waitForResponse(answer =>
    answer.url().includes(`/api/me/collections/${encodeURIComponent(renamed.slug)}/state`)
  );
  await title.press("Enter");
  await stands;
  await expect(page).toHaveURL(/\/@e2e-ada\/deep-blues$/);
  await expect(page.locator("main h1")).toHaveText("Deep blues");
  expect(asked).toEqual([]);
  // the keyboard the form had is on Edit at the new address, and a reader who listens hears the words were saved
  await expect(page.getByRole("button", { name: "Edit Deep blues", exact: true })).toBeFocused();
  await expect(page.locator("[data-announce]")).toHaveText("Saved.");
});

test("a collection's words edited by keyboard take the focus into the title and back to Edit, under the page's heading", async ({
  page
}) => {
  await signIn(page, "ada", false, [blues]);
  await page.goto(blues.url);
  await hydrated(page);
  const edit = page.getByRole("button", { name: "Edit My blues", exact: true });
  const title = page.getByRole("textbox", { name: "Title" });
  await edit.focus();
  await page.keyboard.press("Enter");
  await expect(title).toBeFocused();
  await expect(page.getByRole("heading", { level: 1, name: "My blues" })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(edit).toBeFocused();
  // Cancel comes after the title and the description, and gives the keyboard back
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(edit).toBeFocused();
  // words saved as they were close the form the same way
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(title).toBeHidden();
  await expect(edit).toBeFocused();
});

test("a collection's title in a list, cut short at its line's end, shows its whole ring to the keyboard", async ({
  page
}) => {
  const long = {
    ...summary,
    title:
      "End to end gradients, a collection whose title keeps going well past the end of its line on any screen at all, so it is cut"
  };
  await page.route(
    url => url.pathname === "/api/collections" && url.searchParams.get("sort") === "rising",
    risingWith(long)
  );
  await page.goto("/collections");
  await hydrated(page);
  await page.locator('main a[href="/collections/rising"]').click();
  const title = page.locator(`main a[href="/${SLUG}/rising"]`);
  await title.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(title).toBeFocused();
  await expect(title).toHaveCSS("outline-width", "1px");
  // the title is cut short, inside the link: the first box its words run past is the link's own, so its ring stands
  // around the words that show
  expect(
    await title.evaluate(link => {
      const text = document.createTreeWalker(link, NodeFilter.SHOW_TEXT).nextNode()!;
      const words = document.createRange();
      words.selectNodeContents(text);
      const end = words.getBoundingClientRect().right;
      for (let box = text.parentElement; box; box = box.parentElement)
        if (
          getComputedStyle(box).overflowX !== "visible" &&
          end > box.getBoundingClientRect().right + 1
        )
          return link.contains(box);
      return false;
    })
  ).toBe(true);
  // the ring stands past the link by its offset and width; no box around it may cut it
  const cut = await title.evaluate(link => {
    const own = getComputedStyle(link);
    const out = Number.parseFloat(own.outlineOffset) + Number.parseFloat(own.outlineWidth);
    const r = link.getBoundingClientRect();
    const cuts: string[] = [];
    for (let box = link.parentElement; box; box = box.parentElement) {
      const s = getComputedStyle(box);
      if (s.overflowX === "visible" && s.overflowY === "visible") continue;
      const b = box.getBoundingClientRect();
      if (
        r.left - out < b.left ||
        r.top - out < b.top ||
        r.right + out > b.right ||
        r.bottom + out > b.bottom
      )
        cuts.push(box.tagName);
    }
    return cuts;
  });
  expect(cut).toEqual([]);
});

test("a title entered on Saved at once opens the account's collection", async ({ page }) => {
  await signIn(page, "ada", false, [blues]);
  await page.goto("/collections/saved");
  await hydrated(page);
  await expect(page.locator("main").getByRole("heading", { name: "My blues" })).toBeVisible();
  await page.getByRole("searchbox").fill("my blues");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/@e2e-ada\/my-blues$/);
});

/* With no connection, on the build a deploy serves: the service worker answers every document, and the account's copy
   its collections. */
for (const viewport of [
  { width: 1600, height: 1000 },
  { width: 390, height: 844 }
])
  test(`with no connection the account's collections open from its copy, loaded whole and from another page, ${viewport.width} wide`, {
    tag: "@served"
  }, async ({ page }) => {
    await page.setViewportSize(viewport);
    const group = page.locator("main").getByRole("heading", { name: "My blues" });
    const own = async () => {
      await expect(page.locator("main h1")).toHaveText("My blues");
      await expect(page.locator(`main article a[href^="/${SEED}"]`)).toBeVisible();
    };
    await signIn(page, "ada", false, [blues]);
    await page.goto("/collections/saved");
    await expect(group).toBeVisible();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.context().setOffline(true);
    await page.goto("/collections/saved");
    await expect(group).toBeVisible();
    await page.goto("/@e2e-ada/my-blues");
    await own();
    await page.goto("/palettes/saved");
    await page.locator("header").getByRole("button", { name: "Your account" }).click();
    await page.getByRole("menuitem", { name: "Your collections" }).click();
    await expect(page).toHaveURL(/\/collections\/saved$/);
    await expect(group).toBeVisible();
    await page.locator("main").getByRole("link", { name: "My blues" }).first().click();
    await expect(page).toHaveURL(/\/@e2e-ada\/my-blues$/);
    await own();
    // deleted here, it leaves for the list, which the copy draws without it
    await page.getByRole("button", { name: "Delete collection" }).click();
    await page.getByRole("button", { name: "Press again to delete" }).click();
    await expect(page).toHaveURL(/\/collections\/saved$/);
    await expect(page.locator("main")).toContainText("No collections yet.");
  });

test("with no connection Your collections' tags answer the account's own, and the popular ones are read once it returns", {
  tag: "@served"
}, async ({ page }) => {
  const group = page.locator("main").getByRole("heading", { name: "My blues" });
  const tags = page.getByRole("toolbar", { name: "Tags" });
  await signIn(page, "ada", false, [blues]);
  await page.goto("/collections/saved");
  await expect(group).toBeVisible();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.context().setOffline(true);
  await page.goto("/collections/saved");
  await expect(group).toBeVisible();
  await page.getByRole("searchbox").fill("blu");
  await expect(tags.getByRole("link", { name: "My blues" })).toBeVisible();
  await page.getByRole("searchbox").fill("");
  await signIn(page, "ada", false, [blues]);
  await page.route("**/api/collections/suggest?*", route =>
    route.fulfill({
      json: { items: [{ title: summary.title, slug: SLUG, href: `/${SLUG}`, colors: ["#3366cc"] }] }
    })
  );
  await page.context().setOffline(false);
  // the row in view, and the next page's
  await expect(tags.getByRole("link", { name: summary.title })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Order" })
    .getByRole("link", { name: /^Popular/ })
    .click();
  await expect(page).toHaveURL(/\/collections$/);
  await expect(tags.getByRole("link", { name: summary.title })).toBeVisible();
});

test("a collection's tags on a page in another language search palettes for the words they show", async ({
  page
}) => {
  await page.route(
    url => url.pathname === "/api/collections" && url.searchParams.get("sort") === "rising",
    rising
  );
  const { preview, ...words } = summary;
  await page.route(
    url => url.pathname === `/api/collections/${SLUG}`,
    route =>
      route.fulfill({
        json: {
          ...words,
          // Grabient's tags as a German page reads them
          tags: ["blaue Stunde", "Ozean"],
          items: preview.map(({ seed, ...p }) => ({ kseed: seed, ...p }))
        }
      })
  );
  await page.goto("/de/collections");
  await hydrated(page);
  await page.locator('main a[href="/de/collections/rising"]').click();
  await page.locator(`main a[href="/de/${SLUG}/rising"]`).click();
  const tag = page.getByRole("toolbar").getByRole("link", { name: "blaue Stunde" });
  await expect(tag).toHaveAttribute("href", "/de/palettes/rising?q=blaue+stunde");
  await tag.click();
  await expect(page).toHaveURL(/\/de\/palettes\/rising\?q=blaue\+stunde$/);
  await expect(page.getByRole("searchbox")).toHaveValue("blaue stunde");
});

/** The coins beside a link: its host's, which open under the link's pointer or keyboard focus. */
const coinsBy = (link: Locator) => link.locator("xpath=..").locator("[data-coins] > span");
/** Every coin at one opacity once its motion ends. */
const coinsAt = async (coins: Locator, opacity: string) => {
  for (const coin of await coins.all()) await expect(coin).toHaveCSS("opacity", opacity);
};

test("a collection's tags show their colors under the pointer and keyboard focus, and nothing moves", async ({
  page
}) => {
  await page.route(
    url => url.pathname === "/api/collections" && url.searchParams.get("sort") === "rising",
    rising
  );
  const { preview, ...words } = summary;
  await page.route(
    url => url.pathname === `/api/collections/${SLUG}`,
    route =>
      route.fulfill({
        json: {
          ...words,
          tags: ["blue", "zzqx"],
          // the colors each tag's words show in the palettes' search row: none for words it does not read
          tagColors: [["#1d3b8a", "#4a90d9", "#a7d3f2"], []],
          items: preview.map(({ seed, ...p }) => ({ kseed: seed, ...p }))
        }
      })
  );
  await page.goto("/collections");
  await hydrated(page);
  await page.locator('main a[href="/collections/rising"]').click();
  await page.locator(`main a[href="/${SLUG}/rising"]`).click();
  const row = page.getByRole("toolbar", { name: "Tags" });
  const blue = row.getByRole("link", { name: "blue" });
  const coins = coinsBy(blue);
  await expect(coins).toHaveCount(3);
  await expect(coinsBy(row.getByRole("link", { name: "zzqx" }))).toHaveCount(0);
  await coinsAt(coins, "0");
  const before = [await blue.boundingBox(), await row.boundingBox()];
  await blue.hover();
  await coinsAt(coins, "1");
  expect(await coins.evaluateAll(all => all.map(c => getComputedStyle(c).backgroundColor))).toEqual(
    ["rgb(29, 59, 138)", "rgb(74, 144, 217)", "rgb(167, 211, 242)"]
  );
  expect([await blue.boundingBox(), await row.boundingBox()]).toEqual(before);
  await page.mouse.move(0, 0);
  await coinsAt(coins, "0");
  // the row is one stop for the keyboard, after the way back
  await page.locator("main").getByRole("link", { name: "Collections" }).focus();
  await page.keyboard.press("Tab");
  await expect(blue).toBeFocused();
  await coinsAt(coins, "1");
});

test("the collection a saved one came from shows its colors under the pointer and keyboard focus", async ({
  page
}) => {
  const sunny = {
    ...blues,
    id: "e2e-sunny",
    slug: "@e2e-ada/sunny",
    title: "Sunny",
    url: "/@e2e-ada/sunny"
  };
  await signIn(page, "ada", false, [sunny]);
  await page.route(
    url => url.pathname === `/api/me/collections/${encodeURIComponent(sunny.slug)}/state`,
    route =>
      route.fulfill({
        json: {
          owned: true,
          canCurate: false,
          canDelete: true,
          votes: {},
          copy: {
            slug: sunny.slug,
            source: { slug: SLUG, title: summary.title, colors: ["#ff8800", "#3366cc"] },
            behind: false,
            differs: false
          }
        }
      })
  );
  await page.goto(sunny.url);
  await hydrated(page);
  const source = page.locator("main").getByRole("link", { name: summary.title });
  await expect(source).toHaveAttribute("href", `/${SLUG}`);
  const coins = coinsBy(source);
  await expect(coins).toHaveCount(2);
  await coinsAt(coins, "0");
  const line = source.locator("xpath=ancestor::span[@data-saved]");
  const before = [await source.boundingBox(), await line.boundingBox()];
  await source.hover();
  await coinsAt(coins, "1");
  expect([await source.boundingBox(), await line.boundingBox()]).toEqual(before);
  await page.mouse.move(0, 0);
  await coinsAt(coins, "0");
  await source.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(source).toBeFocused();
  await coinsAt(coins, "1");
});

test("a palette's title stands in its age's place under the pointer and the keyboard, its words in its tooltip, and nothing moves", async ({
  page
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.route(
    url => url.pathname === "/api/collections" && url.searchParams.get("sort") === "rising",
    rising
  );
  const { preview, ...words } = summary;
  await page.route(
    url => url.pathname === `/api/collections/${SLUG}`,
    route =>
      route.fulfill({
        json: {
          ...words,
          items: preview.map(({ seed, ...p }) => ({
            kseed: seed,
            ...p,
            title: "Violet hour",
            description: "Cobalt into a gold horizon."
          }))
        }
      })
  );
  await page.goto("/collections");
  await hydrated(page);
  await page.locator('main a[href="/collections/rising"]').click();
  await page.locator(`main a[href="/${SLUG}/rising"]`).click();
  const card = page.getByRole("article", { name: "Violet hour palette" });
  const title = card.getByText("Violet hour", { exact: true });
  const age = title.locator("xpath=preceding-sibling::span[1]");
  await expect(title).toHaveCSS("opacity", "0");
  await expect(age).toHaveCSS("opacity", "1");
  const before = [await card.boundingBox(), await title.boundingBox()];
  await card.getByRole("img").hover();
  await expect(title).toHaveCSS("opacity", "1");
  await expect(age).toHaveCSS("opacity", "0");
  expect([await card.boundingBox(), await title.boundingBox()]).toEqual(before);
  // resting on the title says what is said of the palette, then the age it stands over
  await title.hover();
  const tip = page.getByRole("tooltip");
  await expect(tip).toContainText("Cobalt into a gold horizon.");
  await expect(tip).toContainText((await age.textContent()) ?? "");
  await page.mouse.move(0, 0);
  await expect(title).toHaveCSS("opacity", "0");
  // the keyboard in the card opens it as the pointer does
  const edit = card.getByRole("link", { name: "Edit Violet hour" });
  await edit.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(edit).toBeFocused();
  await expect(title).toHaveCSS("opacity", "1");
});

test("the owner titles a palette on its card, an undo takes the title back, and the palette's page is called by it", async ({
  page
}) => {
  await signIn(page, "ada", false, [blues]);
  const sent: unknown[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/me/sync")
      for (const change of (request.postDataJSON() as { mutations?: { op: unknown }[] })
        .mutations ?? [])
        sent.push(change.op);
  });
  await page.goto(blues.url);
  await hydrated(page);
  const card = page.locator("main article").first();
  await card.getByRole("img").hover();
  await card.getByRole("button", { name: "Add a title" }).click();
  const field = card.getByRole("textbox", { name: "Palette title" });
  await expect(field).toBeFocused();
  await field.fill("Hallowe'en Night");
  await page.keyboard.press("Enter");
  const named = card.getByRole("button", { name: "Rename Hallowe'en Night" });
  await expect(named).toBeFocused();
  await expect
    .poll(() => sent)
    .toContainEqual(
      expect.objectContaining({
        op: "collection.name",
        slug: blues.slug,
        seed: SEED,
        view: { style: "linearGradient", steps: 7, angle: 90 },
        title: "Hallowe'en Night"
      })
    );
  await page.keyboard.press("ControlOrMeta+z");
  await expect(card.getByRole("button", { name: "Add a title" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(named).toBeVisible();
  // its page, opened from the collection, is called by the collection's title for it
  await card.getByRole("link", { name: "Edit Hallowe'en Night" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/${SEED}`));
  await expect(page.getByRole("region", { name: "Hallowe'en Night" })).toBeVisible();
});

for (const [width, words] of [
  [1600, true],
  [390, false]
] as const)
  test(`at ${width} pixels a saved copy behind its collection is brought up to it by a press that says so, ${
    words ? "in words at the row's start" : "its icon at the row's end"
  }`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const copy = {
      ...blues,
      id: "e2e-copy",
      slug: "@e2e-ada/end-to-end-gradients",
      title: summary.title,
      url: "/@e2e-ada/end-to-end-gradients"
    };
    await signIn(page, "ada", false, [copy]);
    await page.route(
      url => url.pathname === "/api/collections" && url.searchParams.get("sort") === "rising",
      rising
    );
    const { preview, ...said } = summary;
    await page.route(`**/api/collections/${SLUG}`, route =>
      route.fulfill({
        json: { ...said, items: preview.map(({ seed, ...p }) => ({ kseed: seed, ...p })) }
      })
    );
    await page.route(
      url => url.pathname === `/api/me/collections/${SLUG}/state`,
      route =>
        route.fulfill({
          json: {
            owned: false,
            canCurate: false,
            canDelete: false,
            votes: {},
            copy: {
              slug: copy.slug,
              source: { slug: SLUG, title: summary.title, colors: [] },
              behind: true,
              differs: true
            }
          }
        })
    );
    await page.goto("/collections");
    await hydrated(page);
    await page.locator('main a[href="/collections/rising"]').click();
    await page.locator(`main a[href="/${SLUG}/rising"]`).click();
    const update = page.getByRole("button", { name: "Update your copy" });
    const saved = page.getByRole("link", { name: "Saved", exact: true });
    const addAll = page.getByRole("button", { name: "Add all to selection" });
    await expect(update).toHaveCount(1);
    await expect(update).toBeVisible();
    const [at, after, before] = await Promise.all(
      [update, saved, addAll].map(press => press.boundingBox())
    );
    if (words) {
      expect(await update.textContent()).toContain("Update your copy");
      expect(at!.x).toBeLessThan(before!.x);
      await update.hover();
      await expect(page.getByRole("tooltip")).toHaveText(
        "Brings in what changed here since you saved it. Your own changes stay."
      );
      await saved.hover();
      await expect(page.getByRole("tooltip")).toHaveText("Open your saved copy");
    } else {
      expect(at!.x).toBeGreaterThan(after!.x);
      expect(at!.y).toBe(after!.y);
    }
  });
