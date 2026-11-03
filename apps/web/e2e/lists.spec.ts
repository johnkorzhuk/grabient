import { expect, type Page, test } from "@playwright/test";
import { live } from "./live.ts";

/* The gallery's lists as a reader sets how they are drawn: the header's control, the address it writes, what the feed
   keeps through a change and the view the tab remembers. Then the home searched, which reads the collections list's
   own pages, and what a page keeps on screen when a read is cut short or fails. They read the palettes
   `pnpm db:setup` loads. */

const SEED = "kS7CQ31Do6asvY-";
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
  await live(page);
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
  await live(page);
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
  await live(page);
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
  await live(page);
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
   frame, with why it cannot be read in the list's place, until the connection returns and the list and its tags are
   read where they stand. So does a collection, at each of its orders. The collections' reads and the tags are answered
   here once the connection is back, so the tests stand whatever the local database holds. */
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
/** The collections' reads, answered with the one collection, and the tags under each search. */
async function answerReads(page: Page) {
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
  const colors = ["#3366cc"];
  await page.route("**/api/search-suggestions?*", route =>
    route.fulfill({
      json: { suggestions: [{ label: "deep sea", href: "/", colors, query: "deep sea" }] }
    })
  );
  await page.route("**/api/collections/suggest?*", route =>
    route.fulfill({
      json: { items: [{ title: group.title, slug: GROUP, href: `/${GROUP}`, colors }] }
    })
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
    await answerReads(page);
    await page.context().setOffline(false);
    await expect(main.locator("article").first()).toBeVisible();
    await expect(main.getByText("You're offline.")).toHaveCount(0);
    await expect(
      page.getByRole("toolbar", { name: "Tags" }).getByRole("link").first()
    ).toBeVisible();
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

test("a list plays the effect chosen in its menu, paints its stills from the first paint, and opens it", async ({
  page,
  request
}) => {
  const reports = reported(page);
  await page.goto("/palettes?style=radialSwatches&steps=9");
  await live(page);
  const appearance = page.getByRole("button", { name: /^Appearance/ });
  await appearance.click();
  await page.getByRole("button", { name: "Fluted glass", exact: true }).click();
  // the steps leave the address with the gradient, and every card plays the glass
  await expect(page).toHaveURL(/\/palettes\?style=glass$/);
  await expect(appearance).toHaveAccessibleName("Appearance: Fluted glass, 1×");
  const first = page.locator("main article").first();
  await expect(first.getByRole("img", { name: /, Fluted glass$/ })).toBeVisible();
  await page.keyboard.press("Escape");

  // the server answers the address as it stands, its first cards' stills in its head
  const sent = await request.get("/palettes?style=glass", { maxRedirects: 0 });
  expect(sent.status()).toBe(200);
  const html = await sent.text();
  const fields = /<style id="glass-fields" data-key="([^"]*)">/.exec(html)?.[1].split(" ") ?? [];
  expect(fields.length).toBeGreaterThan(3);
  for (const key of [...html.matchAll(/<span[^>]*data-glass-still="([^"]*)"/g)].slice(0, 4))
    expect(fields).toContain(key[1]);

  // a card opens the palette playing the glass, at the canonical address the editor keeps
  const edit = first.getByRole("link", { name: /^Edit/ });
  const href = (await edit.getAttribute("href")) ?? "";
  expect(href).toMatch(/^\/k[\w-]+\?style=glass(&angle=\d+)?$/);
  await first.hover();
  await edit.click();
  await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(href);
  await expect(page.getByRole("button", { name: /^Appearance/ })).toHaveAccessibleName(
    /^Appearance: Fluted glass/
  );

  // Back keeps the list's glass, and a style chosen gives back the steps the glass took the place of
  await page.goBack();
  await expect(page).toHaveURL(/\/palettes\?style=glass$/);
  await expect(first.getByRole("img", { name: /, Fluted glass$/ })).toBeVisible();
  await appearance.click();
  await page.getByRole("button", { name: "Radial bands", exact: true }).click();
  await expect(page).toHaveURL(/\/palettes\?style=radialSwatches&steps=9$/);
  await expect(first.getByRole("img", { name: /swatches$/ })).toBeVisible();
  expect(reports).toEqual([]);
});

test("an effect's tile rested on in a list's menu plays it on the cards in sight, as the editor's stage does, and lets it go", async ({
  page
}) => {
  const reports = reported(page);
  await page.goto("/palettes");
  await live(page);
  const first = page.locator("main article").first().getByRole("img").first();
  const before = await first.getAttribute("aria-label");
  await page.getByRole("button", { name: /^Appearance/ }).click();
  for (const name of ["Fluted glass", "Blob", "Silk", "Rosette", "Papercut"]) {
    await page.getByRole("button", { name, exact: true }).hover();
    await expect(first).toHaveAccessibleName(new RegExp(`, ${name}$`));
  }
  /* a style's tile takes the preview's place, and the menu closed lets every preview go; the address never moved */
  await page.getByRole("button", { name: "Radial bands", exact: true }).hover();
  await expect(first).toHaveAccessibleName(/ swatches$/);
  await page.getByRole("button", { name: "Silk", exact: true }).hover();
  await expect(first).toHaveAccessibleName(/, Silk$/);
  await page.keyboard.press("Escape");
  await expect(first).toHaveAccessibleName(before ?? "");
  await expect(page).toHaveURL(/\/palettes$/);
  expect(reports).toEqual([]);
});

test("a card opens the editor's glass for a reader whose own choice is the gradient", async ({
  page
}) => {
  const reports = reported(page);
  // the reader chose the gradient before, so a page whose address names no style is marked to hide the glass
  await page.addInitScript(() => {
    if (sessionStorage.getItem("kept")) return;
    sessionStorage.setItem("kept", "1");
    localStorage.setItem("grabient-effect", JSON.stringify({ kind: null, settings: {} }));
  });
  await page.goto("/palettes");
  await live(page);
  const mark = () => page.evaluate(() => document.documentElement.dataset.glass ?? null);
  expect(await mark()).toBe("off");
  await page.getByRole("button", { name: /^Appearance/ }).click();
  await page.getByRole("button", { name: "Fluted glass", exact: true }).click();
  await expect(page).toHaveURL(/\/palettes\?style=glass$/);
  await page.keyboard.press("Escape");

  // a card opens the palette on the glass, and the editor's glass shows over the mark the list left
  const first = page.locator("main article").first();
  await first.hover();
  await first.getByRole("link", { name: /^Edit/ }).click();
  await expect(page).toHaveURL(/\/k[\w-]+\?style=glass(&angle=\d+)?$/);
  // the list stands until the editor can draw: the editor's own still (GlassLayer.tsx) is the one to see
  await expect.poll(mark).toBeNull();
  await expect(page.locator('main [data-glass-still][elementtiming="effect-still"]')).toBeVisible();
  expect(reports).toEqual([]);
});

test("a list playing the blob is drawn with its stills, and its lists' links keep it", async ({
  page,
  request
}) => {
  const sent = await request.get("/collections?style=blob&frost=0.5", { maxRedirects: 0 });
  expect(sent.status()).toBe(200);
  const html = await sent.text();
  const stills = /<style id="blob-still" data-key="([^"]*)">/.exec(html)?.[1].split(" ") ?? [];
  const first = /<span[^>]*data-blob-still="([^"]*)"/.exec(html)?.[1];
  expect(stills).toContain(first);
  // every blob a card shows is its palette's own, at the list's frost
  expect(stills.every(key => key.split("|")[1] === "0.5")).toBe(true);
  // another spelling of the address is redirected to this one
  const other = await request.get("/collections?frost=0.50&style=blob&steps=9", {
    maxRedirects: 0
  });
  const to = new URL(other.headers().location ?? "", "http://localhost");
  expect([other.status(), to.pathname + to.search]).toEqual([
    301,
    "/collections?style=blob&frost=0.5"
  ]);

  await page.goto("/collections?style=blob&frost=0.5");
  await live(page);
  await expect(
    page
      .locator("main article")
      .first()
      .getByRole("img", { name: /, Blob$/ })
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Lists" })
    .getByRole("link", { name: "Palettes" })
    .click();
  await expect(page).toHaveURL(/\/palettes\?style=blob&frost=0\.5$/);
  await expect(
    page
      .locator("main article")
      .first()
      .getByRole("img", { name: /, Blob$/ })
  ).toBeVisible();
});

test("a glass list draws the glass on every card in view once it idles, with no move of the reader's", async ({
  page
}) => {
  for (const path of ["/palettes?style=glass", "/collections?style=glass"]) {
    await page.goto(path);
    await live(page);
    // the still each card draws itself, on the GPU or as its SVG, where the server's ribless field stood
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const shown = [...document.querySelectorAll("main article [role=img]")].filter(card => {
              const box = card.getBoundingClientRect();
              return box.width > 0 && box.bottom > 0 && box.top < innerHeight;
            });
            const drawn = shown.filter(card =>
              card.querySelector('canvas[data-painted], [data-glass-still][style*="url("]')
            );
            return shown.length > 1 && drawn.length === shown.length;
          }),
        { timeout: 15_000 }
      )
      .toBe(true);
  }
});

test("a glass list's cards in the window never go back from the glass to their fields as the page wakes them", async ({
  page
}) => {
  /* the stills drawn on the GPU here too, where the tests' browser draws on its processor: its renderer is said to be
     a GPU's (motion.spec.ts). Each card in the window is followed from the first frame, by its palette, whichever
     element holds it: the card the server drew still, then the live one the page wakes in its place */
  await page.addInitScript(() => {
    const own = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function (
      this: WebGL2RenderingContext,
      p: number
    ) {
      return p === 0x9246 ? "A GPU" : own.call(this, p);
    };
    localStorage.setItem("grabient-water", "software");
    const states: Record<string, string[]> = {};
    Object.assign(window, { glassStates: states });
    const look = () => {
      for (const art of document.querySelectorAll("main article span[data-glass-still]")) {
        const box = art.getBoundingClientRect();
        if (!(box.width > 0 && box.bottom > 0 && box.top < innerHeight)) continue;
        const link = art.closest("article")?.querySelector("a[href^='/k']");
        const seed = link?.getAttribute("href")?.split("?")[0] ?? "";
        /* its ribs: the GPU's still on its canvas, or the still's SVG, whose filter the field has none of */
        const svg = (art as HTMLElement).style.background.includes("feDisplacementMap");
        const now = art.querySelector("canvas[data-painted]") || svg ? "glass" : "field";
        states[seed] ??= [];
        if (states[seed].at(-1) !== now) states[seed].push(now);
      }
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  const states = () =>
    page.evaluate(
      () => (window as unknown as { glassStates: Record<string, string[]> }).glassStates
    );
  await page.goto("/palettes?style=glass");
  await live(page);
  await expect
    .poll(
      async () => {
        const all = Object.values(await states());
        return all.length > 1 && all.every(card => card.at(-1) === "glass");
      },
      { timeout: 20_000 }
    )
    .toBe(true);
  // the cards the server drew still, woken as the page idles
  await expect(page.locator("[data-still]")).toHaveCount(0, { timeout: 15_000 });
  for (const [seed, seen] of Object.entries(await states()))
    expect(seen.slice(seen.indexOf("glass")), seed).toEqual(["glass"]);
});

test("a glass list's Angle field keeps the keyboard through every press and follows a drag on", async ({
  page
}) => {
  await page.goto("/palettes?style=glass");
  await live(page);
  await page.getByRole("button", { name: /^Appearance/ }).click();
  const angle = page.getByRole("spinbutton", { name: /^Angle/ });
  await angle.focus();
  for (let press = 0; press < 5; press++) {
    await page.keyboard.press("ArrowUp");
    await expect(angle).toBeFocused();
  }
  // Auto stands under 0: five steps up from it are 4, which the address takes once the field rests
  await expect(angle).toHaveAttribute("aria-valuenow", "4");
  await expect(page).toHaveURL(/[?&]angle=4(&|$)/);
  await expect(angle).toBeFocused();
  // a drag across the field's box runs on with the hand, where the field drawn anew on every value let it go after a
  // step or two; a press on the focused field would type into it, so the keyboard leaves it first
  await angle.blur();
  const at = await angle.evaluate(field => {
    const box = (field.closest("[class*=scrub]") ?? field).getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  for (let step = 1; step <= 30; step++) {
    await page.mouse.move(at.x + step * 6, at.y);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await expect
    .poll(async () => Number(await angle.getAttribute("aria-valuenow")))
    .toBeGreaterThan(60);
});

test("a card's format strip keeps its names apart and inside the card at four and five columns", async ({
  page
}) => {
  for (const width of [1520, 1180]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/palettes?style=glass");
    await live(page);
    const card = page.locator("main article").first();
    await card.hover();
    const strip = card.getByRole("group", { name: "Copy" });
    await expect(strip).toBeVisible();
    const laid = await strip.evaluate(
      (el, cardEl) => {
        const presses = [...el.querySelectorAll("button, a")].filter(
          press => !press.closest("[data-unseen]") && press.getClientRects().length > 0
        );
        const boxes = presses.map(press => press.getBoundingClientRect());
        let overlaps = 0;
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const [a, b] = [boxes[i], boxes[j]];
            if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5)
              overlaps += b.top < a.bottom - 0.5 ? 1 : 0;
          }
        const own = el.getBoundingClientRect();
        const card = (cardEl as Element).getBoundingClientRect();
        return {
          presses: boxes.length,
          overlaps,
          inside: own.left >= card.left && own.right <= card.right
        };
      },
      await card.elementHandle()
    );
    expect(laid.presses, `${width}`).toBeGreaterThan(4);
    expect(laid, `${width}`).toMatchObject({ overlaps: 0, inside: true });
  }
});

test("the editor's Reset gives the lists back the effect the tab had as the palette opened", async ({
  page
}) => {
  await page.goto("/palettes");
  await live(page);
  const first = page.locator("main article").first();
  await first.hover();
  await first.getByRole("link", { name: /^Edit/ }).click();
  await expect(page).toHaveURL(/\/k[\w-]+/);
  /* the editor's own corner, as a reader would see it take the header: until the palette's page has loaded the router
     keeps the list on screen, its menu with it, whose press changes the address the editor then reads as no choice of
     the reader's (the corner's still before it is inert, out of reach) */
  await expect(page.getByRole("button", { name: /^(Hide|Show) panel/ })).toBeVisible();
  const appearance = page.getByRole("button", { name: /^Appearance/ });
  await appearance.click();
  await page.getByRole("button", { name: "Blob", exact: true }).click();
  await expect(appearance).toHaveAccessibleName(/^Appearance: Blob/);
  await expect
    .poll(async () => JSON.parse((await remembered(page)) ?? "{}").effect?.kind)
    .toBe("blob");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Reset appearance" }).click();
  await expect
    .poll(async () => JSON.parse((await remembered(page)) ?? "{}").effect ?? null)
    .toBeNull();
  // the list stands as the reader left it, with no effect the editor let go
  await page.goBack();
  await expect(page).toHaveURL(/\/palettes$/);
  await expect(page.getByRole("button", { name: /^Appearance/ })).toHaveAccessibleName(
    /^Appearance: As saved/
  );
});
