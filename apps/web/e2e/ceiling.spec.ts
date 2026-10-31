import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

/* The site past its ceilings on work no cache holds (server/ceiling.ts), on the build a deploy serves: off production a
   request with this header meets every ceiling spent. Each page's navigation carries it, and what the page then asks
   for goes as it always does. Every page answers with the app's frame as a 503, and the browser draws the page into
   it where a normal load of the same address draws it. No service worker answers here: each load is the network's. */

test.use({ serviceWorkers: "block" });
test.describe.configure({ timeout: 90_000 });

const SPENT = { "x-grabient-ceiling": "spent" };
const WIDTHS = [
  { width: 1600, height: 1000 },
  { width: 390, height: 844 }
] as const;
/** The cards of a list's first row at a desk's width. */
const ROW = 4;

/** Every navigation from now on carries the header; every other request goes as it does. */
async function pastCeiling(page: Page) {
  await page.route("**/*", route => {
    const request = route.request();
    return request.isNavigationRequest()
      ? route.continue({ headers: { ...request.headers(), ...SPENT } })
      : route.continue();
  });
}

/** Everything the page says went wrong from now on: what it reports, throws or logs as an error, but the frame's own
    503, which the browser logs as a resource it could not load. */
function watch(page: Page): string[] {
  const broken: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/client-error")
      broken.push(`reported ${request.postData()}`);
  });
  page.on("pageerror", error => broken.push(`threw ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource"))
      broken.push(`logged ${message.text()}`);
  });
  return broken;
}

/** Where a list puts the parts above its grid: the field, the first tag, the lists row, the heading and the grid. */
const rhythm = (page: Page) =>
  page.evaluate(() => {
    const main = document.querySelector("main");
    const top = (el: Element | null | undefined) =>
      el ? Math.round(el.getBoundingClientRect().top + scrollY) : null;
    const shown = (el: Element) => el.checkVisibility() && el.getBoundingClientRect().height > 0;
    const field = main?.querySelector('input[type="search"]');
    const nav = main?.querySelector("nav");
    const heading = [...(main?.querySelectorAll("h1, h2") ?? [])].find(
      el => shown(el) && Number.parseFloat(getComputedStyle(el).fontSize) >= 24
    );
    const tag = [...(main?.querySelectorAll("a, button") ?? [])].find(el => {
      const at = top(el) ?? 0;
      return shown(el) && at > (top(field) ?? 0) && at < (top(nav) ?? 0);
    });
    const grid = main?.querySelector("[data-count]") ?? main?.querySelector("article");
    return {
      field: top(field),
      tag: top(tag),
      row: top(nav),
      heading: top(heading),
      grid: top(grid)
    };
  });

/** The page as a reader finds it once it stands: its title and heading, and on a list or a collection its first row
    of cards in order and where the parts above them stand. The browser draws a list's cards in batches where the
    server sends them all, so the first row is what both have drawn. A palette's page is the editor's, which the
    browser draws either way. */
async function standing(page: Page, ready: (page: Page) => Promise<void>) {
  await page.waitForFunction(() => {
    const state = (
      window as {
        __TSR_ROUTER__?: {
          state: {
            status: string;
            location: { href: string };
            resolvedLocation?: { href: string };
          };
        };
      }
    ).__TSR_ROUTER__?.state;
    return state?.status === "idle" && state.resolvedLocation?.href === state.location.href;
  });
  await ready(page);
  // two frames more, as a reader's eyes land
  await page.evaluate(
    () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))
  );
  const shown = {
    title: await page.title(),
    heading: await page
      .locator("main h1")
      .first()
      .textContent({ timeout: 1000 })
      .catch(() => null)
  };
  if (ready === editor) return shown;
  return {
    ...shown,
    cards: await page
      .locator("main article")
      .evaluateAll(
        (articles, row) =>
          articles
            .slice(0, row)
            .map(article => article.querySelector("a[href]")?.getAttribute("href")),
        ROW
      ),
    rhythm: await rhythm(page)
  };
}

const listed = async (page: Page) => {
  await expect.poll(() => page.locator("main article").count()).toBeGreaterThanOrEqual(ROW);
  await expect(page.getByRole("toolbar", { name: "Tags" }).getByRole("link").first()).toBeVisible();
};
const headed = async (page: Page) => {
  await expect(page.locator("main h1").first()).toBeVisible();
};
const collection = async (page: Page) => {
  await headed(page);
  await expect(page.locator("main article").first()).toBeVisible();
};
const editor = async (page: Page) => {
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
};

/** Each page to load past the ceiling, how it stands ready, and the address it writes for itself once it stands, where
    it writes one. */
const PAGES: readonly (readonly [string, (page: Page) => Promise<void>, string?])[] = [
  ["/", listed],
  ["/palettes?q=blue&page=2&style=linearSwatches&steps=6", listed],
  ["/palettes/rising", listed],
  ["/collections", listed],
  ["/collections?q=pastel", listed],
  ["a public collection", collection],
  // a palette's own address plays its fluted glass, whose still the browser draws in the frame, which holds none
  ["/kS7CQ31Do6asvY-", editor, "/kS7CQ31Do6asvY-?style=glass"],
  ["/kS7CQ31Do6asvY-?style=linearSwatches&steps=6", editor],
  ["/about", headed],
  ["/de/palettes", listed],
  ["/settings", headed],
  ["/login", headed]
];

/** The address a page settles on, its canonical redirects followed with HEADs: a HEAD's answer is kept by no cache. */
async function settledAddress(request: APIRequestContext, address: string): Promise<string> {
  for (let hops = 0; hops < 3; hops++) {
    const answered = await request.head(address, { maxRedirects: 0 });
    const to = answered.headers().location;
    if (answered.status() < 300 || answered.status() >= 400 || !to) return address;
    const url = new URL(to, "http://localhost");
    address = url.pathname + url.search;
  }
  return address;
}

const here = (page: Page) => new URL(page.url()).pathname + new URL(page.url()).search;

/* Each address is loaded past the ceiling first, at a desk's width and a phone's: the frame is kept by no cache, so
   each is a miss, as a page past the ceiling is. Then a normal load at each width, to compare with. */
for (const [named, ready, writes] of PAGES)
  test(`past the ceiling ${named} answers the frame, which becomes the page a normal load draws, at a desk's width and a phone's`, {
    tag: "@served"
  }, async ({ page, request }) => {
    let address = named;
    if (named === "a public collection") {
      const lists = (await (await request.get("/api/collections")).json()) as {
        items: { slug: string }[];
      };
      address = `/${lists.items[0]?.slug}`;
    }
    address = await settledAddress(request, address);
    const broken = watch(page);
    // a palette's static page, which a reader with JavaScript never sees, in no frame the browser paints
    if (ready === editor)
      await page.addInitScript(() => {
        const shown: boolean[] = [];
        Object.assign(window, { shown });
        const record = () => {
          const fallback = document.querySelector(".palette-static");
          if (fallback && shown.length < 2000) shown.push(fallback.checkVisibility());
          requestAnimationFrame(record);
        };
        requestAnimationFrame(record);
      });
    await pastCeiling(page);
    const framed = [];
    for (const viewport of WIDTHS) {
      await page.setViewportSize(viewport);
      const answered = await page.goto(address);
      expect(answered?.status()).toBe(503);
      expect(answered?.headers()).toMatchObject({
        "x-grabient-cache": "SHELL",
        "x-grabient-paused": "draw-past-ceiling",
        "cache-control": "no-store"
      });
      expect(Number(answered?.headers()["retry-after"])).toBeGreaterThan(0);
      framed.push(await standing(page, ready));
      if (writes) await expect.poll(() => here(page)).toBe(writes);
      else expect(here(page)).toBe(address);
      expect(
        await page.evaluate(() => (window as { shown?: boolean[] }).shown ?? [])
      ).not.toContain(true);
    }
    await page.unrouteAll({ behavior: "ignoreErrors" });
    const normal = [];
    for (const viewport of WIDTHS) {
      await page.setViewportSize(viewport);
      await page.goto(address);
      normal.push(await standing(page, ready));
      if (writes) await expect.poll(() => here(page)).toBe(writes);
    }
    expect(framed).toEqual(normal);
    expect(broken).toEqual([]);
  });

test("past the ceiling a one-segment address that holds nothing lands on its search, with no reload after", {
  tag: "@served"
}, async ({ page }) => {
  const broken = watch(page);
  await pastCeiling(page);
  const documents: string[] = [];
  page.on("request", request => {
    if (request.resourceType() === "document") documents.push(request.url());
  });
  await page.goto("/zz-ceiling-words");
  await expect(page).toHaveURL(/\/palettes\?q=zz\+ceiling\+words$/);
  await expect(page.locator("main h1").first()).toBeVisible();
  await page.waitForTimeout(2000);
  expect(documents.map(url => new URL(url).pathname)).toEqual(["/zz-ceiling-words", "/palettes"]);
  expect(broken).toEqual([]);
});

test("past the ceiling a public collection the browser finds gone loads whole once, then says it is not here", {
  tag: "@served"
}, async ({ page, request }) => {
  const lists = (await (await request.get("/api/collections")).json()) as {
    items: { slug: string }[];
  };
  // in a view no other load asks for, so no cache holds its page
  const at = `/${lists.items.at(-1)?.slug}`;
  const address = await settledAddress(request, `${at}?style=angularSwatches&steps=7`);
  const broken = watch(page);
  await pastCeiling(page);
  // the browser's read finds nothing, as one from a replica that already holds the collection's removal would
  await page.route(
    url => url.pathname === `/api/collections${at}`,
    route =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Not found" })
      })
  );
  const documents: [string, number][] = [];
  page.on("response", response => {
    if (response.request().resourceType() === "document")
      documents.push([new URL(response.url()).pathname, response.status()]);
  });
  await page.goto(address);
  await expect(page.locator("main h1").first()).toHaveText("Collection not found");
  await page.waitForTimeout(2000);
  expect(documents).toEqual([
    [at, 503],
    [at, 503]
  ]);
  expect(broken).toEqual([]);
});

test("past the ceiling the home draws itself inside a partner's frame", { tag: "@served" }, async ({
  page
}) => {
  const broken = watch(page);
  await pastCeiling(page);
  await page.route(
    url => url.pathname === "/e2e-partner",
    route =>
      route.fulfill({
        contentType: "text/html",
        body: '<!DOCTYPE html><iframe src="/ko" width="1200" height="900"></iframe>'
      })
  );
  // the Korean home, which no other test here loads, so no cache holds it
  const answered = page.waitForResponse(
    response =>
      new URL(response.url()).pathname === "/ko" && response.request().isNavigationRequest()
  );
  await page.goto("/e2e-partner");
  expect((await answered).status()).toBe(503);
  const framed = page.frameLocator("iframe");
  await expect(framed.locator("main article").first()).toBeVisible();
  await expect(framed.locator("main h1").first()).toBeVisible();
  expect(broken).toEqual([]);
});

test("an old link the Worker did not fit, answered with the frame, is fitted in the browser", {
  tag: "@served"
}, async ({ page, request }) => {
  const broken = watch(page);
  // the frame as any page past the ceiling gets it: Settings', which no cache holds
  const frame = await request.get("/settings", { headers: SPENT });
  expect(frame.status()).toBe(503);
  const body = await frame.text();
  const old = "/_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKa";
  await page.route(
    url => url.pathname === old,
    route =>
      route.request().isNavigationRequest()
        ? route.fulfill({ status: 503, contentType: "text/html", body })
        : route.continue()
  );
  await page.goto(old);
  await expect.poll(() => new URL(page.url()).pathname).toBe("/kYq5wTxGc3MlDuPtT7O58281NAs8");
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
  expect(broken).toEqual([]);
});

/** The Cookie verify-ada's browser sends to the served build, which signs in as staging does: the session the local
    copy of staging's data keeps for her, signed with the secret the servers read (playwright.config.ts). */
function adaCookie() {
  const token = "tokenadaverify000000000000000000";
  let vars = "";
  try {
    vars = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  } catch {
    /* a clone with no .dev.vars */
  }
  const secret =
    vars.match(/^BETTER_AUTH_SECRET=["']?(.*?)["']?$/m)?.[1] ?? process.env.E2E_AUTH_SECRET ?? "";
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return `__Secure-better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

test("past the ceiling a reader signed in is drawn by the server, and a cookie no session stands behind gets the frame", {
  tag: "@served"
}, async ({ request }) => {
  const asAda = await request.get("/settings", { headers: { ...SPENT, Cookie: adaCookie() } });
  expect([asAda.status(), asAda.headers()["x-grabient-cache"]]).toEqual([200, undefined]);
  const forged = await request.get("/settings", {
    headers: { ...SPENT, Cookie: "__Secure-better-auth.session_token=forged.forged" }
  });
  expect([forged.status(), forged.headers()["x-grabient-cache"]]).toEqual([503, "SHELL"]);
  // data past its ceiling: JSON a page shows with Retry
  const search = await request.get("/api/search.json?query=zz-ceiling", { headers: SPENT });
  expect([search.status(), await search.json()]).toEqual([
    429,
    { error: "Search is busy. Try again later." }
  ]);
});
