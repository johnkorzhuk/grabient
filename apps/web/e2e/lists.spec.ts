import { expect, type Page, test } from "@playwright/test";

/* The gallery's lists as a reader sets how they are drawn: the header's control, the address it writes, what the feed
   keeps through a change and the view the tab remembers. Then the home searched, which reads the collections list's
   own pages, and what a page keeps on screen when a read is cut short or fails. They read the palettes
   `pnpm db:setup` loads. */

const SEED = "kS7CQ31Do6asvY-";
const hydrated = (page: Page) => page.waitForFunction(() => !("$_TSR" in window));
const remembered = (page: Page) => page.evaluate(() => sessionStorage.getItem("grabient-view"));
/** Every error the page reports as its own from now on: a page that threw posts one. */
function reported(page: Page): string[] {
  const reports: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/client-error")
      reports.push(request.postData() ?? "");
  });
  return reports;
}
/** Searches from the page's own field. */
async function search(page: Page, words: string) {
  const field = page.getByRole("searchbox");
  await field.fill(words);
  await field.press("Enter");
  await expect(page).toHaveURL(new RegExp(`[?&]q=${words}$`));
}

test("a change of view keeps the pages that joined and the depth the reader scrolled to", async ({
  page
}) => {
  await page.goto("/palettes");
  await hydrated(page);
  const feed = page.locator("[data-count]").first();
  const cards = async () => Number(await feed.getAttribute("data-count"));
  await page.mouse.move(600, 600);
  // three pages deep: a feed that let its pages go would take back only the next one
  await expect
    .poll(
      async () => {
        await page.mouse.wheel(0, 1500);
        return cards();
      },
      { timeout: 20_000 }
    )
    .toBeGreaterThanOrEqual(96);
  const joined = await cards();
  await page.getByRole("button", { name: /^Appearance/ }).click();
  const depth = await page.evaluate(() => scrollY);
  await page.getByRole("button", { name: "Radial", exact: true }).click();
  await expect(page).toHaveURL(/\/palettes\?style=radialGradient$/);
  await expect(page.locator("article").first()).toBeVisible();
  // a page still on its way may join, and none is let go
  expect(await cards()).toBeGreaterThanOrEqual(joined);
  expect(await page.evaluate(() => scrollY)).toBe(depth);
});

test("a document that opens on a list takes its view, which the wordmark leads home in", async ({
  page
}) => {
  const home = page.locator("a[data-home]");
  await page.goto("/palettes?style=linearSwatches&steps=5");
  await expect(home).toHaveAttribute("href", "/?style=linearSwatches&steps=5");
  // a list opened in every palette's own view lets it go
  await page.goto("/palettes");
  await expect.poll(() => remembered(page)).toContain('"style":"auto"');
  await expect(home).toHaveAttribute("href", "/");
});

test("the home searched reads the collections list's own page, which the list then asks for no more", async ({
  page
}) => {
  const reports = reported(page);
  const asked: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname === "/api/collections") asked.push(url.search);
  });
  await page.goto("/");
  await hydrated(page);
  await search(page, "blue");
  // as the list asks: the popular order, and the words read through the model
  await expect.poll(() => asked[0]).toBe("?sort=popular&page=1&limit=24&q=blue&model=1");
  await expect(page.getByRole("heading", { name: "Trending: blue" })).toBeVisible();
  await page.locator('main a[href="/collections?q=blue"]').click();
  await expect(page).toHaveURL(/\/collections\?q=blue$/);
  await expect(page.locator("main h1")).toBeVisible();
  expect(asked.filter(query => query.includes("page=1&"))).toHaveLength(1);
  expect(reports).toEqual([]);
});

test("the home shows a search cut short as its answer, and a read that fails leaves that answer standing", async ({
  page
}) => {
  const reports = reported(page);
  const words = (url: URL) => (url.pathname === "/api/hot" ? url.searchParams.get("q") : null);
  // an allowance ran out: the route answers 429 with what the search found as its body
  await page.route(
    url => words(url) === "blue",
    route =>
      route.fulfill({
        status: 429,
        json: {
          query: "blue",
          palettes: [
            { kseed: SEED, style: "linearGradient", steps: 7, angle: 90, likes: 3, createdAt: 0 }
          ],
          tier: "vocabulary",
          limited: true,
          fetchedAt: Date.now()
        }
      })
  );
  await page.route(
    url => words(url) === "red",
    route => route.abort()
  );
  await page.goto("/");
  await hydrated(page);
  const head = page.locator("[data-count]").first();
  const retry = page.getByRole("button", { name: "Retry" });
  await search(page, "blue");
  await expect(head).toHaveAttribute("data-count", "1");
  await expect(retry).toHaveCount(0);
  await search(page, "red");
  await expect(retry).toBeVisible();
  await expect(page.locator("main")).toContainText("Couldn't load the home page.");
  await expect(head).toHaveAttribute("data-count", "1");
  await expect(head.locator("article")).toBeVisible();
  expect(reports).toEqual([]);
});

test("a list whose read fails keeps the cards of the list before it, beside Retry", async ({
  page
}) => {
  const reports = reported(page);
  await page.route(
    url => url.pathname === "/api/palettes" && url.searchParams.get("sort") === "rising",
    route => route.abort()
  );
  await page.goto("/palettes");
  await hydrated(page);
  const feed = page.locator("[data-count]").first();
  const first = await feed.locator("article a[href]").first().getAttribute("href");
  await page.locator('main a[href="/palettes/rising"]').click();
  await expect(page).toHaveURL(/\/palettes\/rising$/);
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.locator("main")).toContainText("Couldn't load palettes.");
  await expect(feed).toHaveAttribute("data-count", "24");
  await expect(feed.locator("article a[href]").first()).toHaveAttribute("href", first ?? "");
  expect(reports).toEqual([]);
});

for (const [path, read] of [
  ["/palettes", "/api/palettes"],
  ["/", "/api/hot"]
] as const) {
  test(`${path} left until its palettes are old reads them again once, saying so while its cards stand`, async ({
    page
  }) => {
    // the browser's clock six minutes on: what the server read is past its five minutes
    await page.addInitScript(() => {
      const now = Date.now;
      Date.now = () => now() + 6 * 60_000;
    });
    const asked: string[] = [];
    await page.route(
      url => url.pathname === read,
      async route => {
        asked.push(read);
        await new Promise(resolve => setTimeout(resolve, 1500));
        await route.continue();
      }
    );
    await page.goto(path);
    const line = page.locator("main p[role=status]").last();
    await expect(line).toHaveText("Updating…");
    await expect(page.locator("main article").first()).toBeVisible();
    await expect(line).toHaveText("");
    expect(asked).toEqual([read]);
  });
}

/* With no connection, on the build a deploy serves. A list the service worker never kept opens from its shell: its own
   frame, with why it cannot be read in the list's place, until the connection returns and the list is read where it
   stands. So does a collection, at each of its orders. The collections' reads are answered here once the connection is
   back, so the tests stand whatever the local database holds. */
const GROUP = "e2e-gradients";
const group = {
  slug: GROUP,
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
const member = {
  style: "linearGradient",
  steps: 7,
  angle: 90,
  createdAt: 1_700_000_000_000,
  likes: 0
};
/** The collections' reads, answered with the one collection. */
async function answerCollections(page: Page) {
  await page.route(
    url => url.pathname === "/api/collections",
    route => {
      const asked = new URL(route.request().url()).searchParams;
      return route.fulfill({
        json: {
          ...{ query: asked.get("q") ?? "", sort: asked.get("sort"), page: 1, limit: 24 },
          ...{ total: 1, totalPages: 1, fetchedAt: Date.now() },
          items: [{ ...group, preview: [{ seed: SEED, ...member, position: 0 }] }]
        }
      });
    }
  );
  await page.route(
    url => url.pathname === `/api/collections/${GROUP}`,
    route => route.fulfill({ json: { ...group, items: [{ kseed: SEED, ...member, position: 0 }] } })
  );
}
/** The worker in charge of a page it never kept any list from, and the connection cut. */
async function cutOff(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/about");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.context().setOffline(true);
}

for (const [path, why] of [
  ["/", "This list opens offline once you've seen it online."],
  ["/?q=blue", "This list opens offline once you've seen it online."],
  ["/palettes", "This list opens offline once you've seen it online."],
  ["/palettes/rising", "This list opens offline once you've seen it online."],
  ["/palettes?q=blue", "This list opens offline once you've seen it online."],
  ["/collections", "This list opens offline once you've seen it online."],
  ["/collections/rising", "This list opens offline once you've seen it online."],
  ["/collections?q=blue", "This list opens offline once you've seen it online."],
  [`/${GROUP}`, "This collection opens offline once you've seen it online."],
  [`/${GROUP}/rising`, "This collection opens offline once you've seen it online."]
] as const)
  test(`with no connection ${path}, never kept, stands in its frame saying why, and reads its list once the connection returns`, {
    tag: "@served"
  }, async ({ page }) => {
    const reports = reported(page);
    await cutOff(page);
    await page.goto(path);
    const main = page.locator("main");
    await expect(main.getByText("You're offline.")).toBeVisible();
    await expect(main.getByText(why)).toBeVisible();
    await expect(main).not.toContainText(/Something went wrong|Couldn't load/);
    await expect(main.getByRole("button", { name: "Retry" })).toHaveCount(0);
    // its frame: the search, the lists' row and the list's heading; a collection's orders and its title's place
    const frame = path.startsWith(`/${GROUP}`)
      ? [main.getByRole("navigation", { name: "Order" }), main.locator("h1").first()]
      : [
          page.getByRole("searchbox"),
          main.getByRole("navigation", { name: "Lists" }),
          ...(path.startsWith("/collections") ? [] : [main.locator("h2").first()])
        ];
    const tops = () =>
      Promise.all(frame.map(async part => Math.round((await part.boundingBox())?.y ?? -1)));
    const drawn = await tops();
    let loads = 0;
    page.on("load", () => loads++);
    await answerCollections(page);
    await page.context().setOffline(false);
    await expect(main.locator("article").first()).toBeVisible();
    await expect(main.getByText("You're offline.")).toHaveCount(0);
    // the live page stands where its frame stood, and nothing loaded it again
    expect(await tops()).toEqual(drawn);
    expect(loads).toBe(0);
    expect(reports).toEqual([]);
  });

test("with no connection the page in view, refreshed after a new build's worker takes over, opens whole", {
  tag: "@served"
}, async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/palettes");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  // a page the last build's worker kept as it loaded
  await page.goto("/palettes");
  await expect(page.locator("main article").first()).toBeVisible();
  /* The next build takes over: its worker installs, and as it activates deletes the last build's files, shell and pages,
     while the page in view still runs the last build's scripts. The browser's check for a new worker passes through no
     route, so the same worker stands in under a second address, once the last build's caches are gone. */
  await page.evaluate(async () => {
    for (const key of await caches.keys())
      if (/^grabient-(assets|shells|pages)-/.test(key)) await caches.delete(key);
    const taken = new Promise(resolve =>
      navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true })
    );
    await navigator.serviceWorker.register("/sw.js?next");
    await taken;
    const worker = navigator.serviceWorker.controller;
    if (worker && worker.state !== "activated")
      await new Promise(resolve =>
        worker.addEventListener("statechange", () => worker.state === "activated" && resolve(null))
      );
  });
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator("main article").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Popular", level: 2 })).toBeVisible();
  await expect(page.locator("main").getByText("You're offline.")).toHaveCount(0);
});
