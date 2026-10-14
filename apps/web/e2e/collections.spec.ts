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
