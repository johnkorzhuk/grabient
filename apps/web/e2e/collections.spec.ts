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
