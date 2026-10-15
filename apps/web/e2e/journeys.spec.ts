import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  test
} from "@playwright/test";

/* The readers' journeys, each walked as a reader walks it, at a desk's width with a mouse and at a phone's with a
   finger: from every list into a palette or a collection and back, a search in four languages, the editor from a list,
   the frame's own pages, and an account's likes and collections. They read a copy of staging's data, with its test
   account verify-ada and her private collections. */

test.describe.configure({ timeout: 90_000 });

const WIDTHS = [
  { name: "a desk", viewport: { width: 1600, height: 1000 }, touch: false },
  { name: "a phone", viewport: { width: 390, height: 844 }, touch: true }
] as const;
type Width = (typeof WIDTHS)[number];

/** The Cookie verify-ada's browser sends: the session staging's copy keeps for her, signed with the secret the dev
    server reads from .dev.vars. */
function adaSession() {
  const token = "tokenadaverify000000000000000000";
  const vars = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  const secret = vars.match(/^BETTER_AUTH_SECRET=["']?(.*?)["']?$/m)?.[1] ?? "";
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return { name: "better-auth.session_token", value: encodeURIComponent(`${token}.${signature}`) };
}
const signIn = (context: BrowserContext, origin: string) =>
  context.addCookies([{ ...adaSession(), url: origin }]);

/** Everything the page says went wrong from now on: what it reports, what it throws and what it logs as an error. */
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

/** Opens a page, waits for the app to take over the server's document, and marks the document: a reload loses it. */
async function open(page: Page, address: string) {
  await page.goto(address);
  await page.waitForFunction(() => !("$_TSR" in window));
  await page.evaluate(() => Object.assign(window, { journey: true }));
}
const sameDocument = (page: Page) => page.evaluate(() => "journey" in window);

/** What the router says of where it stands: the address it reads, and the address whose pages it has drawn. */
type ResolvedState = {
  status: string;
  location: { href: string };
  resolvedLocation?: { href: string };
};
/** Opens `address` in a tab of its own on the document the server answers `served` with, as the edge serves it when it
    kept that address's document first, and says what the reader is left with once the app has taken it over: how many
    pages the document holds, and what Solid's development build says hydration left unclaimed. */
async function hydrated(context: BrowserContext, address: string, served = address) {
  const tab = await context.newPage();
  const unclaimed: string[] = [];
  tab.on("console", message => {
    if (/unclaimed/i.test(message.text())) unclaimed.push(message.text().split("\n")[0] ?? "");
  });
  if (served !== address)
    await tab.route(
      url => url.pathname + url.search === address,
      async route =>
        route.fulfill({
          response: await route.fetch({ url: new URL(served, route.request().url()).href })
        })
    );
  await open(tab, address);
  // a match the document did not carry loads once the app has started, and its page then draws beside the server's
  await tab.waitForFunction(() => {
    const router = (window as { __TSR_ROUTER__?: { state: ResolvedState } }).__TSR_ROUTER__;
    const at = router?.state;
    return at?.status === "idle" && at.resolvedLocation?.href === at.location.href;
  });
  await settled(tab);
  const pages = await tab.locator("main").count();
  await tab.close();
  return { pages, unclaimed };
}

/** Whether the site's stylesheet applies: the design system's tokens stand on the document. */
const styled = (page: Page) =>
  page.evaluate(
    () => getComputedStyle(document.documentElement).getPropertyValue("--space-s1") !== ""
  );

/** Where a list puts the parts above its grid, in the document: the field, the first tag, the lists row, the heading
    and the grid. */
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

/** The depth once the list has drawn the rows there, as it has by the time a reader's eyes land. */
const settled = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>(done =>
        requestAnimationFrame(() => requestAnimationFrame(() => done(scrollY)))
      )
  );
/** Goes down the page to where `target` stands, 400 pixels from the top, and returns that depth. */
async function reach(page: Page, target: Locator): Promise<number> {
  await target.evaluate(el =>
    scrollTo(0, Math.max(0, el.getBoundingClientRect().top + scrollY - 400))
  );
  return settled(page);
}

/** A press as the width's reader makes it: a click, or a finger's tap. */
const press = (link: Locator, width: Width) => (width.touch ? link.tap() : link.click());
/** A press where `target` stands, as a pointer or a finger meets it. The header and its menus stay at the top as the
    page scrolls, and a locator's own scroll into view would move the page to where they would stand unstuck. */
async function pressAt(page: Page, target: Locator, width: Width) {
  const box = await target.boundingBox();
  if (!box) throw new Error("nothing to press");
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await (width.touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
}
/** An item of the account's menu, from the header's corner. */
async function fromMenu(page: Page, item: string, width: Width) {
  await pressAt(
    page,
    page.locator("header").getByRole("button", { name: /^(Sign in|Your account)$/ }),
    width
  );
  await pressAt(page, page.getByRole("menuitem", { name: item }), width);
}
/** Whether the account's menu says changes made here wait for the server, read as it opens. */
async function waitingToSync(page: Page, width: Width): Promise<boolean> {
  await pressAt(page, page.locator("header").getByRole("button", { name: "Your account" }), width);
  await expect(page.getByRole("menuitem", { name: "Saved palettes" })).toBeVisible();
  const waiting = await page.getByRole("menuitem", { name: /changes? to sync$/ }).count();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: "Saved palettes" })).toHaveCount(0);
  return waiting > 0;
}

/** The address of the link at `at` among those of the list a reader sees at this width, or of its last. */
async function linkAt(page: Page, selector: string, at: number): Promise<string> {
  await expect(page.locator(selector).first()).toBeAttached();
  return page.evaluate(
    ([selector, at]) => {
      const all = [...document.querySelectorAll(selector)].filter(link =>
        (link.closest("article") ?? link).checkVisibility()
      );
      return all[Math.min(Number(at), all.length - 1)]?.getAttribute("href") ?? "";
    },
    [selector, String(at)]
  );
}
/** The card whose Edit leads there, held by its address: a list draws only the rows near the screen, so a place among
    them is no handle. */
const cardOf = (page: Page, href: string) =>
  page
    .locator("main article", { has: page.locator(`a[aria-label='Edit'][href="${href}"]`) })
    .filter({ visible: true })
    .first();
const EDIT = "main article a[aria-label='Edit']";
/** The palettes a list draws, in its order. */
const cards = (page: Page) => page.locator("main article:has(a[aria-label='Edit'])");

/** Every card a list draws, on screen or below it, as where its Edit leads and whether its press named `name` is
    pressed, to the eye or to a screen reader. */
const pressedOn = (page: Page, name: RegExp) =>
  page.evaluate(
    ([source, flags]) => {
      const named = new RegExp(source, flags);
      return [...document.querySelectorAll("main article")]
        .filter(card => card.checkVisibility())
        .flatMap(card => {
          const edit = card.querySelector("a[aria-label='Edit']")?.getAttribute("href");
          const press = [...card.querySelectorAll("button")].find(button =>
            named.test(button.getAttribute("aria-label") ?? "")
          );
          return edit && press
            ? [[edit, press.getAttribute("aria-pressed") === "true"] as const]
            : [];
        });
    },
    [name.source, name.flags]
  );
/** The cards whose heart says other than her account: each palette she likes has its heart pressed, and every other
    one not. */
const misdrawn = async (page: Page, liked: ReadonlySet<string>) =>
  (await pressedOn(page, /^Like/)).flatMap(([href, on]) =>
    on === liked.has(itemAt(href).kseed) ? [] : [`${href} ${on}`]
  );
/** The cards whose selection press says other than this browser's selection: each palette chosen, in the view its
    list draws it in, shows its check, and every other one its plus. */
const misselected = async (page: Page, chosen: ReadonlySet<string>) =>
  (await pressedOn(page, /selection$/)).flatMap(([href, on]) =>
    on === chosen.has(href) ? [] : [`${href} ${on}`]
  );
/** This browser's selection, as another tab leaves it: these palettes, each in the view its Edit leads to. */
const chosenHere = (page: Page, hrefs: Iterable<string>) =>
  page.evaluate(
    items =>
      localStorage.setItem("grabient-keyframe-exports", JSON.stringify({ version: 1, items })),
    [...hrefs].map(href => {
      const { kseed, ...view } = itemAt(href);
      return { seed: kseed, ...view };
    })
  );
/** What her browser sends for the palette's like next, once the server has answered the sync that carries it. */
const sentLike = (page: Page, seed: string) =>
  page
    .waitForResponse(
      response =>
        response.url().endsWith("/api/me/sync") &&
        (response.request().postData() ?? "").includes(`"seed":"${seed}"`)
    )
    .then(
      response =>
        (
          JSON.parse(response.request().postData() ?? "{}") as {
            mutations: { op: { seed?: string; liked?: boolean } }[];
          }
        ).mutations.find(change => change.op.seed === seed)?.op.liked
    );
/** Down the page to the card that leads there: a list draws only the rows near the screen. */
async function scrollToCard(page: Page, href: string): Promise<Locator> {
  const card = cardOf(page, href);
  for (let depth = 0; !(await card.count()) && depth < 20_000; depth += 300) {
    await page.evaluate(to => scrollTo(0, to), depth);
    await settled(page);
  }
  await reach(page, card);
  return card;
}
const GROUP_EDIT = "main section article a[aria-label='Edit']";
/* A card past a list's first row, or in the home's first collections: the server drew it, and it stands still until the
   reader moves. */
const STILL: { name: string; address: string; cards: [string, number][] }[] = [
  { name: "Palettes", address: "/palettes", cards: [[EDIT, 8]] },
  { name: "Rising", address: "/palettes/rising", cards: [[EDIT, 8]] },
  { name: "a palette search", address: "/palettes?q=blue", cards: [[EDIT, 8]] },
  {
    name: "the home",
    address: "/",
    cards: [
      [EDIT, 8],
      [GROUP_EDIT, 0]
    ]
  },
  { name: "Collections", address: "/collections", cards: [[GROUP_EDIT, 1]] }
];

/** Her account as her browser's copy hears it: she likes the palettes in `liked`, whatever the server holds, and each
    like her browser sends is taken here as the server takes one, dated when it came, so Saved lists it first. */
function likedHere(page: Page, liked: Set<string>) {
  const at = new Map<string, number>();
  return page.route("**/api/me/sync", route => {
    const { mutations } = JSON.parse(route.request().postData() ?? "{}") as {
      mutations: { id: number; op: { op: string; seed?: string; liked?: boolean } }[];
    };
    for (const { op } of mutations) {
      if (op.op !== "like" || !op.seed) continue;
      if (op.liked) {
        liked.add(op.seed);
        at.set(op.seed, Date.now());
      } else liked.delete(op.seed);
    }
    return route.fulfill({
      json: {
        cursor: 1,
        reset: true,
        likes: [...liked].map(seed => ({
          seed,
          style: "linearGradient",
          steps: 7,
          angle: 90,
          at: at.get(seed) ?? 1,
          likes: 1
        })),
        unliked: [],
        collections: [],
        removed: [],
        lastMutation: Math.max(0, ...mutations.map(change => change.id)),
        results: mutations.map(change => ({ id: change.id, ok: true })),
        admin: false
      }
    });
  });
}

type Opened = { href: string; depth: number; collection?: string };
/** The ways a list opens what it holds: a palette by its card's Edit from the keyboard and by a press on the card, a
    collection by a group's title and by a collection's card. Each says what it opened, from what depth. */
const OPENERS = {
  async edit(page: Page): Promise<Opened> {
    const href = await linkAt(page, EDIT, 8);
    // the focus comes as a screen reader's cursor brings it, the page following it down
    await cardOf(page, href)
      .locator("a[aria-label='Edit']")
      .evaluate(el => (el as HTMLElement).focus());
    const depth = await settled(page);
    await page.keyboard.press("Enter");
    return { href, depth };
  },
  async card(page: Page, width: Width): Promise<Opened> {
    const href = await linkAt(page, EDIT, 5);
    const card = cardOf(page, href);
    const depth = await reach(page, card);
    // a mouse finds Edit over the picture; a finger's tap on the picture shows it
    if (width.touch) await card.getByRole("img").first().tap();
    else await card.hover();
    await press(card.locator("a[aria-label='Edit']"), width);
    return { href, depth };
  },
  async title(page: Page, width: Width): Promise<Opened> {
    const href = await linkAt(page, "main section h2 a[href]", 2);
    const title = page.locator(`main section h2 a[href="${href}"]`).first();
    const depth = await reach(page, title);
    const collection = (await title.textContent())?.trim() ?? "";
    await press(title, width);
    return { href, depth, collection };
  },
  async mosaic(page: Page, width: Width): Promise<Opened> {
    const href = await linkAt(page, "main article a[aria-label^='Open ']", 1);
    const picture = page.locator(`main article a[aria-label^='Open '][href="${href}"]`).first();
    const depth = await reach(page, picture);
    const collection = ((await picture.getAttribute("aria-label")) ?? "").replace(/^Open /, "");
    await press(picture, width);
    return { href, depth, collection };
  }
};
type List = { name: string; address: string; opens: (keyof typeof OPENERS)[] };

/** Opens what the list offers, one way after another, and comes Back from each: the page that opens stands whole
    and styled in the same document, and the list comes back at the depth it was left at with nothing above its grid
    moved. */
async function walk(page: Page, width: Width, list: List) {
  const broken = watch(page);
  await open(page, list.address);
  const heading = (await page.locator("main h1").first().textContent()) ?? "";
  await expect(page.locator("main article").first()).toBeVisible();
  const before = await rhythm(page);
  for (const way of list.opens) {
    const opened = await OPENERS[way](page, width);
    await expect
      .poll(() => new URL(page.url()).pathname, way)
      .toBe(new URL(opened.href, page.url()).pathname);
    if (opened.collection) {
      await expect(page.locator("main h1"), way).toHaveText(opened.collection);
      await expect(page.locator("main article").first(), way).toBeVisible();
    } else {
      await expect(page.getByRole("complementary", { name: "Editor" }), way).toBeVisible();
      await expect(page.getByRole("img", { name: "The gradient" }), way).toBeVisible();
    }
    expect(await styled(page), way).toBe(true);
    await page.goBack();
    await expect(page.locator("main h1").first(), way).toHaveText(heading);
    await expect.poll(() => page.evaluate(() => scrollY), { message: way }).toBe(opened.depth);
    expect(await styled(page), way).toBe(true);
    expect(await rhythm(page), way).toEqual(before);
    expect(await sameDocument(page), way).toBe(true);
  }
  expect(broken).toEqual([]);
}

const LISTS: List[] = [
  { name: "the home", address: "/", opens: ["edit", "card", "title"] },
  { name: "Palettes", address: "/palettes", opens: ["edit", "card"] },
  { name: "Rising", address: "/palettes/rising", opens: ["edit", "card"] },
  { name: "a palette search", address: "/palettes?q=blue", opens: ["edit", "card"] },
  // words the palettes cannot answer signed out, which collections can
  { name: "a search answered by collections", address: "/palettes?q=midtones", opens: ["mosaic"] },
  { name: "Collections", address: "/collections", opens: ["edit", "card", "title"] },
  { name: "Rising collections", address: "/collections/rising", opens: ["edit", "card", "title"] },
  { name: "a collection", address: "/bright-gradients", opens: ["edit", "card"] }
];
const OWN: List[] = [
  { name: "Saved", address: "/palettes/saved", opens: ["edit", "card"] },
  { name: "a private collection", address: "/@ada-verify/my-blues", opens: ["edit", "card"] }
];

/* What the server never draws: the browser's own words (the selection) and a landing's campaign tags. The edge keeps
   one document for every address that differs by them alone, so each of these pages is drawn by documents the server
   rendered for another address of it. */
const KEPT_ALIKE = [
  "/",
  "/palettes",
  "/palettes/rising",
  "/collections",
  "/collections/rising",
  "/blue-swatches/rising"
];
const CAMPAIGN = "utm_source=newsletter&utm_medium=email";

/** A string of the site's English in the page's language, from the catalog the site translates with. */
function say(lang: string, english: string): string {
  if (lang === "en") return english;
  const url = new URL(`../../../packages/i18n/messages/${lang}.json`, import.meta.url);
  const catalog = JSON.parse(readFileSync(url, "utf8")) as Record<string, string>;
  return catalog[english] ?? english;
}
/** What a list says it shows, without the marks that keep words in their own direction: the address and its words,
    the field, the headings, the title and the first row's names. */
const shows = (page: Page) =>
  page.evaluate(() => {
    const bare = (text: string | null | undefined) =>
      (text ?? "").replace(/[\u2066-\u2069]/g, "").trim();
    const main = document.querySelector("main");
    return {
      address: location.pathname + location.search,
      words: new URLSearchParams(location.search).get("q") ?? "",
      field: main?.querySelector<HTMLInputElement>('input[type="search"]')?.value ?? null,
      headings: [...(main?.querySelectorAll("h1, h2") ?? [])]
        .slice(0, 2)
        .map(h => bare(h.textContent)),
      title: bare(document.title),
      cards: [...(main?.querySelectorAll("article") ?? [])]
        .slice(0, 4)
        .map(card => card.getAttribute("aria-label"))
    };
  });
/** Waits for the list to show what the same address shows when it is loaded whole, and returns that. */
async function agrees(page: Page) {
  const whole = await page.context().newPage();
  await whole.goto(page.url());
  await whole.waitForFunction(() => !("$_TSR" in window));
  await expect(whole.locator("main article").first()).toBeVisible();
  const drawn = await shows(whole);
  await whole.close();
  await expect.poll(() => shows(page)).toEqual(drawn);
  return drawn;
}

const SEED = "kS7CQ31Do6asvY-";
const LANGUAGES = [
  { lang: "en", prefix: "", words: "green" },
  { lang: "es", prefix: "/es", words: "verde" },
  { lang: "ja", prefix: "/ja", words: "緑" },
  { lang: "ar", prefix: "/ar", words: "أخضر" }
];

/** A drag along a control as the width's reader makes it: a mouse's, or a finger's. */
async function drag(page: Page, target: Locator, by: number, width: Width) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("nothing to drag");
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  if (!width.touch) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + by, y, { steps: 8 });
    await page.mouse.up();
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", at?: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: at === undefined ? [] : [{ x: x + at, y }]
    });
  await touch("touchStart", 0);
  for (let step = 1; step <= 8; step++) await touch("touchMove", (by * step) / 8);
  await touch("touchEnd");
}
/** A reader's first move down a page, `by` pixels, as the width's reader makes it: a finger set down low on the screen
    and drawn up it, held still before it lifts so the page does not fling on, or a mouse that comes over the page and
    turns its wheel. */
async function swipe(page: Page, by: number, width: Width) {
  const [x, y] = [width.viewport.width / 2, width.viewport.height - 100];
  if (!width.touch) {
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, by);
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", up?: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: up === undefined ? [] : [{ x, y: y - up }]
    });
  await touch("touchStart", 0);
  for (let step = 1; step <= 8; step++) await touch("touchMove", (by * step) / 8);
  await page.waitForTimeout(300);
  await touch("touchEnd");
}
/** From the next document on: the ResizeObserver loops the window hears, which the page reports as its own errors,
    and the groups of a feed that the page's observers were told the sizes of, by key. */
const observed = (page: Page) =>
  page.addInitScript(() => {
    const loops: string[] = [];
    const measured = new Set<string>();
    Object.assign(window, { loops, measured });
    addEventListener("error", event => {
      if (event.message.startsWith("ResizeObserver")) loops.push(event.message);
    });
    const Native = window.ResizeObserver;
    window.ResizeObserver = class extends Native {
      constructor(callback: ResizeObserverCallback) {
        super((entries, observer) => {
          for (const entry of entries) {
            const key = entry.target.getAttribute("data-group");
            if (key) measured.add(key);
          }
          callback(entries, observer);
        });
      }
    };
  });
const observations = (page: Page) =>
  page.evaluate(() => {
    const seen = window as unknown as { loops: string[]; measured: Set<string> };
    return { loops: seen.loops, measured: [...seen.measured] };
  });
const seedOf = (page: Page) => new URL(page.url()).pathname.slice(1);
/** The palette's seed once its address has taken an edit's last change: it follows them at most every 350 ms. */
async function edited(page: Page, was: string) {
  await expect.poll(() => seedOf(page)).not.toBe(was);
  await page.waitForTimeout(400);
  return seedOf(page);
}

for (const width of WIDTHS)
  test.describe(`on ${width.name}`, () => {
    test.use({ viewport: width.viewport, hasTouch: width.touch, isMobile: width.touch });
    for (const list of LISTS)
      test(`from ${list.name}, what a reader opens lands whole and Back returns to the list as it was`, ({
        page
      }) => walk(page, width, list));

    for (const address of KEPT_ALIKE)
      test(`${address} stands as one page from a campaign's link and from either document its selection shares`, async ({
        context
      }) => {
        const selected = `${address}?selection`;
        for (const [said, at, served] of [
          ["a campaign's link", `${address}?${CAMPAIGN}`],
          ["a campaign's link to the selection", `${selected}&${CAMPAIGN}`],
          ["kept with the selection", address, selected],
          ["kept without it", selected, address]
        ] as const)
          expect
            .soft(await hydrated(context, at, served), said)
            .toEqual({ pages: 1, unclaimed: [] });
      });

    test("an account's collection, signed out, stands as one page from a campaign's link", async ({
      context
    }) => {
      expect(await hydrated(context, `/@ada-verify/my-blues?${CAMPAIGN}`)).toEqual({
        pages: 1,
        unclaimed: []
      });
    });

    for (const { lang, prefix, words } of LANGUAGES)
      test(`a search in ${lang} by a tag, by words, by a palette's address and cleared shows what its address shows`, async ({
        page,
        context,
        baseURL
      }) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        const broken = watch(page);
        await open(page, `${prefix}/palettes`);
        await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
        await expect(page.locator("main article").first()).toBeVisible();
        const rest = await shows(page);
        const field = page.getByRole("searchbox");

        // a tag of the row at rest, in the page's language: it searches the words it shows, as a list writes words
        const tag = page.locator("main [role=toolbar] a").first();
        const label = ((await tag.textContent()) ?? "")
          .normalize("NFKC")
          .replace(/\s+/gu, " ")
          .trim()
          .toLowerCase();
        await press(tag, width);
        await expect(page).toHaveURL(/[?&]q=/);
        const tagged = await agrees(page);
        expect.soft(tagged.field, "the tag's field").toBe(label);
        expect.soft(tagged.headings[1], "the tag's heading").toContain(label);
        expect.soft(tagged.words, "the tag's address").toBe(label);

        await field.fill(words);
        await field.press("Enter");
        await expect(page).toHaveURL(new RegExp(`[?&]q=${encodeURIComponent(words)}$`));
        const typed = await agrees(page);
        expect(typed.field).toBe(words);
        expect(typed.words).toBe(words);
        expect(typed.headings[1]).toContain(words);

        // the link the editor copies, pasted over the words: the palettes like it
        await page.evaluate(
          address => navigator.clipboard.writeText(address),
          `${baseURL}${prefix}/${SEED}`
        );
        await field.focus();
        await page.keyboard.press("ControlOrMeta+A");
        await page.keyboard.press("ControlOrMeta+V");
        await expect(page).toHaveURL(new RegExp(`[?&]q=${SEED}$`));
        const pasted = await agrees(page);
        expect(pasted.field).toBe(SEED);
        expect(pasted.words).toBe(SEED);

        await press(page.getByRole("button", { name: say(lang, "Clear search") }), width);
        await expect(page).toHaveURL(new RegExp(`${prefix}/palettes$`));
        await expect.poll(() => shows(page)).toEqual(rest);
        expect(await sameDocument(page)).toBe(true);
        expect(broken).toEqual([]);
      });

    test("a palette's locks go along to another language from the footer's menu and the account's", async ({
      page
    }) => {
      const broken = watch(page);
      // the lock as each language names it
      const hue = (locale: string) =>
        page.getByRole("button", { name: say(locale, "Lock hue"), exact: true });
      const locked = (prefix: string) => new RegExp(`${prefix}/${SEED}\\?lock=hue$`);
      await open(page, `/es/${SEED}`);
      await press(hue("es"), width);
      await expect(page).toHaveURL(locked("/es"));

      await press(page.locator("footer button[aria-controls]"), width);
      await press(page.locator('footer ul a[hreflang="ja"]'), width);
      await expect(page).toHaveURL(locked("/ja"));
      await expect(hue("ja")).toHaveAttribute("aria-pressed", "true");

      await page.waitForFunction(() => !("$_TSR" in window));
      await pressAt(
        page,
        page.locator("header").getByRole("button", { name: say("ja", "Sign in") }),
        width
      );
      await pressAt(page, page.getByRole("menuitem", { name: say("ja", "Language") }), width);
      await pressAt(page, page.getByRole("menuitemradio", { name: "Español" }), width);
      await expect(page).toHaveURL(locked("/es"));
      await expect(hue("es")).toHaveAttribute("aria-pressed", "true");
      expect(broken).toEqual([]);
    });

    test("a palette opened from a list takes a key and a drag, walks them back and forth, gives its link and goes Back to the list", async ({
      page,
      context
    }) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      const broken = watch(page);
      await open(page, "/palettes");
      const heading = (await page.locator("main h1").first().textContent()) ?? "";
      const before = await rhythm(page);
      const { depth } = await OPENERS.card(page, width);
      await expect(page.getByRole("img", { name: "The gradient" })).toBeVisible();
      const seeds = [seedOf(page)];
      await page.keyboard.press("i");
      seeds.push(await edited(page, seeds[0]!));
      // the hue turns at any value, where a chroma may stand at its end
      await drag(page, page.getByRole("spinbutton", { name: "Hue", exact: true }), 60, width);
      seeds.push(await edited(page, seeds[1]!));
      // a phone's reader takes them back with the editor's own presses
      const walk = (back: boolean) =>
        width.touch
          ? press(page.getByRole("button", { name: back ? "Undo" : "Redo" }), width)
          : page.keyboard.press(back ? "ControlOrMeta+z" : "ControlOrMeta+Shift+z");
      for (const at of [1, 0]) {
        await walk(true);
        await expect.poll(() => seedOf(page)).toBe(seeds[at]);
      }
      for (const at of [1, 2]) {
        await walk(false);
        await expect.poll(() => seedOf(page)).toBe(seeds[at]);
      }
      // up to the picture, whose presses a finger's tap on it shows
      await page.evaluate(() => scrollTo(0, 0));
      if (width.touch) await page.getByRole("img", { name: "The gradient" }).tap();
      await press(page.getByRole("button", { name: "URL", exact: true }).first(), width);
      await expect
        .poll(
          async () => new URL(await page.evaluate(() => navigator.clipboard.readText())).pathname
        )
        .toBe(`/${seeds[2]}`);
      await page.goBack();
      await expect(page.locator("main h1").first()).toHaveText(heading);
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(depth);
      expect(await rhythm(page)).toEqual(before);
      expect(await sameDocument(page)).toBe(true);
      expect(broken).toEqual([]);
    });

    test("a palette's page says how many like it from its first frame, and keeps saying it with no answer to its ask", async ({
      page,
      request
    }) => {
      const broken = watch(page);
      // a palette no journey likes: none presses a heart on Popular's third page
      const listed = await request.get("/api/palettes?sort=popular&page=3&limit=24");
      const seed = ((await listed.json()) as { items: Item[] }).items[12]!.kseed;
      const asked = await request.get(`/api/like-counts?keys=${seed}`);
      const count = ((await asked.json()) as { counts: Record<string, number> }).counts[seed]!;
      expect(count).toBeGreaterThan(0);
      const said = `Like, ${count.toLocaleString("en")}`;
      // the page the server sends, which the service worker keeps for a visit with no connection
      expect(await (await request.get(`/${seed}`)).text()).toContain(`aria-label="${said}"`);
      // the editor, with every ask for counts unanswered
      await page.route("**/api/like-counts*", route => route.abort());
      await open(page, `/${seed}`);
      const heart = page.getByRole("button", { name: /^Like, / });
      await expect(heart).toHaveAttribute("aria-label", said);
      // past the editor's rest, when it asks
      await page.waitForTimeout(1500);
      await expect(heart).toHaveAttribute("aria-label", said);
      expect(broken).toEqual([]);
    });

    test("signed in, a reader's hearts on every list are her account's before she moves, and a press does what its heart shows", async ({
      page,
      context,
      baseURL
    }) => {
      await signIn(context, baseURL ?? "");
      const broken = watch(page);
      const liked = new Set<string>();
      await likedHere(page, liked);
      const picked: string[] = [];
      for (const list of STILL) {
        await open(page, list.address);
        // liked on another device: the page learns of them from her account alone
        for (const [card, at] of list.cards) {
          const href = await linkAt(page, card, at);
          picked.push(href);
          liked.add(itemAt(href).kseed);
        }
        await open(page, list.address);
        await expect
          .poll(() => misdrawn(page, liked), { message: list.name, timeout: 10_000 })
          .toEqual([]);
      }

      // on Popular, a press on the heart she liked takes it back, and one on a heart she has not liked likes it
      await open(page, "/palettes");
      let other = "";
      for (let at = 0; !other; at++) {
        const href = await linkAt(page, EDIT, at);
        if (!liked.has(itemAt(href).kseed)) other = href;
      }
      for (const [href, was] of [
        [picked[0]!, true],
        [other, false]
      ] as const) {
        const heart = (await scrollToCard(page, href)).getByRole("button", { name: /^Like/ });
        await expect(heart).toHaveAttribute("aria-pressed", String(was));
        const sent = sentLike(page, itemAt(href).kseed);
        await press(heart, width);
        expect(await sent).toBe(!was);
        await expect(heart).toHaveAttribute("aria-pressed", String(!was));
      }
      expect(broken).toEqual([]);
    });

    test("signed in, Saved two pages deep comes Back after a heart pressed elsewhere with every palette she likes, from its first frame", async ({
      page,
      context,
      baseURL,
      request
    }) => {
      await signIn(context, baseURL ?? "");
      const broken = watch(page);
      // twenty-five palettes she likes, as her account's copy hears them: two of Saved's pages
      const listed = await request.get("/api/palettes?sort=popular&page=2&limit=48");
      const liked = new Set(
        ((await listed.json()) as { items: Item[] }).items.slice(0, 25).map(item => item.kseed)
      );
      await likedHere(page, liked);
      await open(page, "/palettes/saved");
      const feed = page.locator("main [data-count]");
      await expect(feed).toHaveAttribute("data-count", "24");
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      await expect(feed).toHaveAttribute("data-count", "25");

      // a heart pressed on Popular, in the app: that palette leads Saved, and her first page's last moves to the second
      await press(
        page.getByRole("navigation", { name: "Order" }).getByRole("link", { name: /^Popular/ }),
        width
      );
      await expect(page.getByRole("heading", { name: "Popular", level: 2 })).toBeVisible();
      let other = "";
      for (let at = 0; !other; at++) {
        const href = await linkAt(page, EDIT, at);
        if (!liked.has(itemAt(href).kseed)) other = href;
      }
      const heart = cardOf(page, other).getByRole("button", { name: /^Like/ });
      await press(heart, width);
      await expect(heart).toHaveAttribute("aria-pressed", "true");

      /* Back, on a phone's slower processor: each frame Saved draws holds its cards, and both its pages hold every
         palette she likes */
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      const drawn = () => page.evaluate(() => (window as unknown as { saved: number[] }).saved);
      await page.evaluate(() => {
        const saved: number[] = [];
        Object.assign(window, { saved });
        const tick = () => {
          if (location.pathname.endsWith("/palettes/saved"))
            saved.push(document.querySelectorAll("main article").length);
          if (saved.length < 30) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await page.goBack();
      await expect.poll(async () => (await drawn()).length).toBe(30);
      expect(await drawn()).not.toContain(0);
      await expect(feed).toHaveAttribute("data-count", "26");
      expect(broken).toEqual([]);
    });

    test("a reader's selection shows on every list's cards before she moves", async ({ page }) => {
      const broken = watch(page);
      await open(page, STILL[0]!.address);
      for (const list of STILL) {
        // nothing chosen: the cards past the first row stand as the server drew them
        await chosenHere(page, []);
        await open(page, list.address);
        const chosen = new Set<string>();
        for (const [card, at] of list.cards) chosen.add(await linkAt(page, card, at));
        // chosen in another tab: the page learns of them from this browser's selection alone
        await chosenHere(page, chosen);
        await open(page, list.address);
        await expect
          .poll(() => misselected(page, chosen), { message: list.name, timeout: 10_000 })
          .toEqual([]);
      }
      expect(broken).toEqual([]);
    });

    /* The first move starts the list's window at the top of the page: it draws the groups near the reader by their
       estimated heights, measures them, and lays the column out again by what it measured. On a phone a card is
       taller than the estimate, so that second layout drops a group the first one drew. */
    for (const list of ["/collections", "/collections/rising"])
      test(`${list} lays out the groups a reader's first swipe brings by their measured heights, with nothing to report`, {
        tag: "@served"
      }, async ({ page }) => {
        const broken = watch(page);
        await observed(page);
        await open(page, list);
        await expect(page.locator("main [data-group]").first()).toBeVisible();
        await swipe(page, 600, width);
        await settled(page);
        await page.waitForLoadState("networkidle");
        const drawn = await page
          .locator("main [data-group]")
          .evaluateAll(groups => groups.map(group => group.getAttribute("data-group")));
        const { loops, measured } = await observations(page);
        // each group drawn where she stands was measured
        expect(drawn.length).toBeGreaterThan(0);
        expect(measured).toEqual(expect.arrayContaining(drawn));
        expect(loops).toEqual([]);
        expect(broken).toEqual([]);
      });

    test("the sign-in sheet, Settings, About and the newsletter open from the frame's menu and links, and Back returns to the list", async ({
      page
    }) => {
      const broken = watch(page);
      await open(page, "/palettes");
      const heading = (await page.locator("main h1").first().textContent()) ?? "";
      const depth = await reach(page, cardOf(page, await linkAt(page, EDIT, 8)));
      const before = await rhythm(page);
      /** Back from `from`, as many pages as were opened, to the list as it was left. */
      const back = async (from: string, pages = 1) => {
        for (let left = pages; left > 0; left--) await page.goBack();
        await expect(page.locator("main h1").first(), from).toHaveText(heading);
        await expect.poll(() => page.evaluate(() => scrollY), { message: from }).toBe(depth);
        // the header, taller over a brand page, eases back to a list's height
        await expect.poll(() => rhythm(page), { message: from }).toEqual(before);
      };

      await fromMenu(page, "Sign in", width);
      await expect(page).toHaveURL(/\/login\?redirect=%2Fpalettes$/);
      await expect(page.locator("main h1")).toHaveText("Sign in");
      await expect(page.getByRole("button", { name: "Send link" })).toBeEnabled();
      expect(await styled(page)).toBe(true);
      await back("the sign-in sheet");

      await fromMenu(page, "Settings", width);
      await expect(page).toHaveURL(/\/settings$/);
      await expect(page.locator("main h1")).toHaveText("Settings");
      await expect(page.locator('#privacy [role="switch"]').first()).toBeVisible();
      await back("Settings");

      await fromMenu(page, "About", width);
      await expect(page).toHaveURL(/\/about$/);
      await expect(page.locator("main h1")).toHaveText("About Grabient");
      await press(
        page
          .getByRole("navigation", { name: "About and account" })
          .getByRole("link", { name: "Newsletter" }),
        width
      );
      await expect(page).toHaveTitle("Newsletter | Grabient");
      await expect(page.locator("main article[data-issue]").first()).toBeVisible();
      expect(await styled(page)).toBe(true);
      await back("the newsletter", 2);
      expect(await sameDocument(page)).toBe(true);
      expect(broken).toEqual([]);
    });
  });

/** What a palette's page is called: its tab's title and its heading. */
const called = (page: Page) =>
  page.evaluate(() => ({
    title: document.title,
    heading: document.querySelector("h1")?.textContent
  }));

for (const list of ["/palettes", "/bright-gradients"])
  test(`a palette opened from ${list}, edited, taken back and left for one like it is called what each address is called loaded whole`, async ({
    page,
    context
  }) => {
    const whole = await context.newPage();
    /** The palette's page as the address it stands at is called when it is loaded whole. */
    const agrees = async (step: string) => {
      await open(whole, page.url());
      await expect(whole.getByRole("img", { name: "The gradient" })).toBeVisible();
      await expect.poll(() => called(page), { message: step }).toEqual(await called(whole));
    };
    await open(page, list);
    await OPENERS.edit(page);
    await expect(page.getByRole("img", { name: "The gradient" })).toBeVisible();
    const opened = seedOf(page);
    await agrees("opened");
    await page.keyboard.press("i");
    await edited(page, opened);
    await agrees("edited");
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => seedOf(page)).toBe(opened);
    await agrees("taken back");
    // a palette like it, from the sheet's own list, opens in place
    await page.mouse.move(200, 200);
    await page.mouse.wheel(0, 2000);
    const like = page.locator(`a[aria-label='Edit']:not([href*='${opened}'])`).first();
    await expect(like).toBeAttached({ timeout: 30_000 });
    const to = new URL((await like.getAttribute("href")) ?? "", page.url()).pathname.slice(1);
    await like.evaluate(el => (el as HTMLElement).focus());
    await page.keyboard.press("Enter");
    await expect.poll(() => seedOf(page)).toBe(to);
    await agrees("a palette like it");
  });

/** Records the editor's heading from now on: each name it shows, once in turn. */
const listen = (page: Page) =>
  page.evaluate(() => {
    const seen: string[] = [];
    let last = document.querySelector("h1")?.textContent;
    const read = () => {
      const heading = document.querySelector("h1")?.textContent;
      if (!heading || heading === last) return;
      last = heading;
      if (document.querySelector("[role='img'][aria-label='The gradient']")) seen.push(heading);
    };
    new MutationObserver(read).observe(document, {
      subtree: true,
      childList: true,
      characterData: true
    });
    Object.assign(window, { headings: seen });
  });
/** The headings recorded since `listen` or the last call. */
const heard = (page: Page) =>
  page.evaluate(() => (window as unknown as { headings: string[] }).headings.splice(0));
/** The palettes whose facts the server has answered for, by seed, from now on. */
function answered(page: Page): Set<string> {
  const seeds = new Set<string>();
  page.on("response", response => {
    const url = new URL(response.url());
    if (url.pathname === "/api/palette-facts" && response.ok())
      seeds.add(url.searchParams.get("seed") ?? "");
  });
  return seeds;
}
/** What the palette at the page's address is called loaded whole. */
async function calledWhole(context: BrowserContext, page: Page) {
  const whole = await context.newPage();
  await open(whole, page.url());
  await expect(whole.getByRole("img", { name: "The gradient" })).toBeVisible();
  const said = await called(whole);
  await whole.close();
  return said;
}
/** The seed a card's Edit opens. */
const seedAt = async (card: Locator) =>
  new URL(
    (await card.locator("a[aria-label='Edit']").getAttribute("href")) ?? "",
    "https://grabient.test"
  ).pathname.slice(1);

test("a palette whose card the pointer reached opens called what the server knows it as, from its first frame", async ({
  page,
  context
}) => {
  const facts = answered(page);
  await open(page, "/palettes");
  const card = cards(page).nth(2);
  const seed = await seedAt(card);
  await card.getByRole("img").first().hover();
  await expect.poll(() => facts.has(seed)).toBe(true);
  await listen(page);
  await card.locator("a[aria-label='Edit']").click();
  await expect(page.getByRole("img", { name: "The gradient" })).toBeVisible();
  const whole = await calledWhole(context, page);
  await expect.poll(() => called(page)).toEqual(whole);
  expect(await heard(page)).toEqual([whole.heading]);
});

test("a palette whose facts are slow to come opens at once, called by its colors, and takes its title as they come", async ({
  page,
  context
}) => {
  await open(page, "/palettes");
  // the editor's code, which the first palette opened waits for, is in
  await cards(page).first().getByRole("img").first().hover();
  await cards(page).first().locator("a[aria-label='Edit']").click();
  await expect(page.getByRole("img", { name: "The gradient" })).toBeVisible();
  await page.goBack();
  const card = cards(page).nth(3);
  await expect(card).toBeVisible();
  let answer = () => {};
  const held = new Promise<void>(done => {
    answer = done;
  });
  await page.route(
    url => url.pathname === "/api/palette-facts",
    async route => {
      await held;
      await route.continue();
    }
  );
  await page.evaluate(() =>
    addEventListener(
      "click",
      () => {
        const pressed = performance.now();
        const look = () => {
          if (document.querySelector("[role='img'][aria-label='The gradient']"))
            Object.assign(window, { opened: performance.now() - pressed });
          else requestAnimationFrame(look);
        };
        look();
      },
      { capture: true, once: true }
    )
  );
  await card.getByRole("img").first().hover();
  await card.locator("a[aria-label='Edit']").click();
  // the press waits a moment at most for the answer it asked for as the pointer came
  await expect
    .poll(() => page.evaluate(() => (window as { opened?: number }).opened ?? Infinity))
    .toBeLessThan(1000);
  const whole = await calledWhole(context, page);
  expect(await called(page)).not.toEqual(whole);
  answer();
  await expect.poll(() => called(page)).toEqual(whole);
});

test("an undo, Back or Forward to a palette the tab knows calls it that from the first frame", async ({
  page,
  context
}) => {
  await open(page, "/palettes");
  const card = cards(page).nth(2);
  const opened = await seedAt(card);
  await card.getByRole("img").first().hover();
  await card.locator("a[aria-label='Edit']").click();
  await expect.poll(() => seedOf(page)).toBe(opened);
  const own = await calledWhole(context, page);
  await expect.poll(() => called(page)).toEqual(own);

  // an edit taken back at once: its own name, then the palette's
  await listen(page);
  await page.keyboard.press("i");
  await page.waitForTimeout(120);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => seedOf(page)).toBe(opened);
  await expect.poll(() => called(page)).toEqual(own);
  const edits = await heard(page);
  expect.soft(edits, "the undo").toEqual([edits[0], own.heading]);

  // one like it, from the sheet's own list, then Back to the palette and Forward to it
  await page.mouse.move(200, 200);
  await page.mouse.wheel(0, 2000);
  const like = page.locator(`a[aria-label='Edit']:not([href*='${opened}'])`).first();
  await expect(like).toBeAttached({ timeout: 30_000 });
  const to = new URL((await like.getAttribute("href")) ?? "", page.url()).pathname.slice(1);
  await like.evaluate(el => (el as HTMLElement).focus());
  await page.keyboard.press("Enter");
  await expect.poll(() => seedOf(page)).toBe(to);
  const other = await calledWhole(context, page);
  await expect.poll(() => called(page)).toEqual(other);
  for (const [step, at, said] of [
    ["Back", opened, own],
    ["Forward", to, other]
  ] as const) {
    await heard(page);
    await (step === "Back" ? page.goBack() : page.goForward());
    await expect.poll(() => seedOf(page), step).toBe(at);
    await expect.poll(() => called(page), step).toEqual(said);
    expect.soft(await heard(page), step).toEqual([said.heading]);
  }
});

test("a link to Rising in a frame an admin turned off leads to the week's in the reader's language, the selection still open", async ({
  page,
  request,
  baseURL
}) => {
  const { frames } = (await (await request.get("/api/frames")).json()) as { frames: string[] };
  const off = ["3m", "1y"].find(frame => !frames.includes(frame));
  expect(off, "a longer frame staging's copy has turned off").toBeDefined();
  for (const [list, query, lang] of [
    ["palettes", "q=blue", "ja"],
    ["collections", "q=sea+sky", "de"]
  ] as const) {
    const from = `/${lang}/${list}/rising/${off}?${query}&selection`;
    const answer = await request.get(from, { maxRedirects: 0 });
    const to = new URL(answer.headers().location ?? "", baseURL);
    expect([answer.status(), to.pathname + to.search]).toEqual([
      302,
      `/${lang}/${list}/rising?${query}&selection`
    ]);
    // an empty selection closes as the page opens
    await open(page, from);
    await expect(page).toHaveURL(
      new RegExp(`/${lang}/${list}/rising\\?${query.replace("+", "\\+")}$`)
    );
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
  }
});

type Item = { kseed: string; style: string; steps: number; angle: number };
const likes = (items: Item[], liked: boolean) =>
  items.map(({ kseed, style, steps, angle }) => ({
    op: "like",
    seed: kseed,
    liked,
    style,
    steps,
    angle
  }));
/** Sends changes to verify-ada's account as her browser's copy would, and checks each was taken. A limit reached stops
    the turn, and the rest go once it has passed. */
async function sync(api: APIRequestContext, ops: object[]) {
  const client = `journeys-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  let sent = 0;
  while (sent < ops.length) {
    const answer = await api.post("/api/me/sync", {
      data: {
        client,
        cursor: null,
        mutations: ops.slice(sent).map((op, i) => ({ id: sent + i + 1, op }))
      }
    });
    expect(answer.ok()).toBe(true);
    const turn = (await answer.json()) as {
      results: { ok: boolean }[];
      lastMutation: number;
      retryAfter?: number;
    };
    expect(turn.results.every(result => result.ok)).toBe(true);
    sent = turn.lastMutation;
    if (sent < ops.length)
      await new Promise(done => setTimeout(done, (turn.retryAfter ?? 1) * 1000));
  }
}
/** Her account as staging's copy holds it, whatever a journey that stopped short left: no likes, and none of the
    collections the journeys make. */
async function reset(api: APIRequestContext) {
  const read = async <T>(address: string) =>
    ((await (await api.get(address)).json()) as { items: T[] }).items;
  const liked = await read<Item>("/api/saved?page=1&limit=96");
  const own = await read<{ slug: string; title: string }>("/api/me/collections?page=1&limit=96");
  await sync(api, [
    ...likes(liked, false),
    ...own
      .filter(({ title }) => title.startsWith(MADE))
      .map(({ slug }) => ({ op: "collection.delete", slug }))
  ]);
}
const MADE = "Journey ";

/** The palettes she likes, as the server holds them. */
const herLikes = async (api: APIRequestContext) =>
  new Set(
    ((await (await api.get("/api/saved?page=1&limit=96")).json()) as { items: Item[] }).items.map(
      item => item.kseed
    )
  );
/** A palette as its card's Edit leads to it: its seed, in the view the list draws it in. */
function itemAt(href: string): Item {
  const url = new URL(href, "https://grabient.test");
  return {
    kseed: url.pathname.slice(1),
    style: url.searchParams.get("style") ?? "linearGradient",
    steps: Number(url.searchParams.get("steps") ?? 7),
    angle: Number(url.searchParams.get("angle") ?? 90)
  };
}
/* Her journeys change what her account holds, so they take turns, and Saved holds palettes she liked for them. */
test.describe("signed in as verify-ada", () => {
  test.describe.configure({ mode: "serial" });
  let api: APIRequestContext;
  test.beforeAll(async ({ playwright, baseURL }) => {
    const session = adaSession();
    api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Cookie: `${session.name}=${session.value}`, Origin: baseURL ?? "" }
    });
    await reset(api);
    const listed = await api.get("/api/palettes?sort=popular&page=5&limit=24");
    await sync(api, likes(((await listed.json()) as { items: Item[] }).items.slice(0, 6), true));
  });
  test.afterAll(async () => {
    await reset(api);
    await api.dispose();
  });

  for (const width of WIDTHS)
    test.describe(`on ${width.name}`, () => {
      test.use({ viewport: width.viewport, hasTouch: width.touch, isMobile: width.touch });
      test.beforeEach(({ context, baseURL }) => signIn(context, baseURL ?? ""));

      test("she likes a palette and finds it on Saved, keeps two as a new collection and takes it back, and opens her own", async ({
        page
      }) => {
        const broken = watch(page);
        const said = page.locator("main p[aria-live]").first();

        await open(page, "/palettes/rising");
        const heading = (await page.locator("main h1").first().textContent()) ?? "";

        // a heart on a palette she has not liked, then on Saved
        const href = await linkAt(page, EDIT, 1);
        const heart = (from: Page) => cardOf(from, href).getByRole("button", { name: /^Like/ });
        await expect(heart(page)).toHaveAttribute("aria-pressed", "false");
        await press(heart(page), width);
        await expect(heart(page)).toHaveAttribute("aria-pressed", "true");
        await press(
          page.getByRole("navigation", { name: "Order" }).getByRole("button", { name: "Saved" }),
          width
        );
        await expect(page).toHaveURL(/\/palettes\/saved$/);
        await expect(cards(page).first()).toHaveAttribute(
          "aria-label",
          (await cardOf(page, href).getAttribute("aria-label")) ?? ""
        );
        await expect(heart(page)).toHaveAttribute("aria-pressed", "true");
        await press(heart(page), width);
        await expect(heart(page)).toHaveAttribute("aria-pressed", "false");
        await page.goBack();
        await expect(page.locator("main h1").first()).toHaveText(heading);
        await expect(heart(page)).toHaveAttribute("aria-pressed", "false");

        // two palettes in the selection, kept as a new collection from its screen
        const title = `${MADE}${Date.now().toString(36)}`;
        for (const at of [2, 3]) {
          const card = cardOf(page, await linkAt(page, EDIT, at));
          if (width.touch) await card.getByRole("img").first().tap();
          else await card.hover();
          await press(card.getByRole("button", { name: "Add to selection" }), width);
        }
        await press(page.getByRole("button", { name: "Selection 2" }).first(), width);
        await press(page.getByRole("radio", { name: "Save" }), width);
        const saveTo = page.getByRole("group", { name: "Save to" });
        await press(saveTo.getByRole("button", { name: "New collection" }), width);
        await saveTo.getByRole("textbox", { name: "Title" }).fill(title);
        await saveTo.getByRole("textbox", { name: "Title" }).press("Enter");
        await expect(said).toHaveText(`Added to ${title}.`);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("button", { name: "Close selection" })).toHaveCount(0);

        // where her collections are, from the frame's menu
        await fromMenu(page, "Your collections", width);
        await expect(page).toHaveURL(/\/collections\/saved$/);
        const made = page.getByRole("region", { name: title });
        await expect(made).toContainText("2 palettes");
        await press(made.getByRole("link", { name: title }), width);
        await expect(page.locator("main h1")).toHaveText(title);
        await expect(page.locator("main article")).toHaveCount(2);

        // Back where it was made, an undo takes it back
        await page.goBack();
        await page.goBack();
        await expect(page.locator("main h1").first()).toHaveText(heading);
        await page.keyboard.press("ControlOrMeta+z");
        await expect(
          page.getByRole("status").filter({ hasText: `${title} deleted.` })
        ).toBeVisible();

        // and her own private collection opens from the same menu
        await fromMenu(page, "Your collections", width);
        await expect(page.getByRole("region", { name: "My blues" })).toBeVisible();
        await expect(page.getByRole("region", { name: title })).toHaveCount(0);
        await press(page.getByRole("link", { name: "My blues" }), width);
        await expect(page).toHaveURL(/\/@ada-verify\/my-blues$/);
        await expect(page.locator("main h1")).toHaveText("My blues");
        await expect(page.locator("main article").first()).toBeVisible();
        expect(await styled(page)).toBe(true);
        expect(await sameDocument(page)).toBe(true);
        expect(broken).toEqual([]);
      });

      test("a heart pressed on another page is on Saved when she comes back, and one taken back is gone from it", async ({
        page
      }) => {
        const broken = watch(page);
        /** To the list in the app, as she presses its order, once its own page stands. */
        const to = async (name: "Popular" | "Saved") => {
          await press(
            page
              .getByRole("navigation", { name: "Order" })
              .getByRole(name === "Saved" ? "button" : "link", { name: new RegExp(`^${name}`) }),
            width
          );
          await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
          await expect(cards(page).first()).toBeVisible();
        };
        await open(page, "/palettes/saved");
        await expect(cards(page).first()).toBeVisible();
        await to("Popular");
        const href = await linkAt(page, EDIT, 2);
        if ((await herLikes(api)).has(itemAt(href).kseed))
          await sync(api, likes([itemAt(href)], false));
        const name = (await cardOf(page, href).getAttribute("aria-label")) ?? "";
        const heart = cardOf(page, href).getByRole("button", { name: /^Like/ });
        await press(heart, width);
        await expect(heart).toHaveAttribute("aria-pressed", "true");

        await to("Saved");
        await expect(cards(page).first()).toHaveAttribute("aria-label", name);
        await open(page, "/palettes/saved");
        await expect(cards(page).first()).toHaveAttribute("aria-label", name);

        await to("Popular");
        await expect(heart).toHaveAttribute("aria-pressed", "true");
        await press(heart, width);
        await expect(heart).toHaveAttribute("aria-pressed", "false");
        await to("Saved");
        await expect(page.locator(`main article[aria-label="${name}"]`)).toHaveCount(0);
        await open(page, "/palettes/saved");
        await expect(cards(page).first()).toBeVisible();
        await expect(page.locator(`main article[aria-label="${name}"]`)).toHaveCount(0);
        expect(broken).toEqual([]);
      });

      test("when the server ends her session with a like not yet sent, the heart goes out and its count with it", async ({
        page
      }) => {
        const broken = watch(page);
        const synced = page.waitForResponse(
          response => response.url().endsWith("/api/me/sync") && response.ok()
        );
        await open(page, "/palettes");
        await synced;
        const href = await linkAt(page, EDIT, 1);
        const heart = cardOf(page, href).getByRole("button", { name: /^Like/ });
        await expect(heart).toHaveAttribute("aria-pressed", "false");
        const count = (await heart.getAttribute("aria-label")) ?? "";
        // the server ended the session: the sync is refused, and the session check finds none
        await page.route("**/api/me/sync", route =>
          route.fulfill({ status: 401, json: { error: "Sign in to continue." } })
        );
        await page.route("**/api/auth/get-session*", route => route.fulfill({ json: null }));
        await press(heart, width);
        await expect(
          page.locator("header").getByRole("button", { name: "Sign in", exact: true })
        ).toBeVisible();
        await expect(heart).toHaveAttribute("aria-pressed", "false");
        await expect(heart).toHaveAttribute("aria-label", count);
        expect(broken).toEqual([]);
      });

      test("her like on a palette's page counts at once, and a copy of the page kept from before it shows the like and its count while no count or sync is answered", async ({
        page
      }) => {
        const broken = watch(page);
        // a palette deep in Popular, which no other journey shows or likes
        const listed = await api.get("/api/palettes?sort=popular&page=8&limit=24");
        const item = ((await listed.json()) as { items: Item[] }).items[5]!;
        const address = `/${item.kseed}`;
        const asked = await api.get(`/api/like-counts?keys=${item.kseed}`);
        const count = ((await asked.json()) as { counts: Record<string, number> }).counts[
          item.kseed
        ]!;
        const said = (n: number) => `Like, ${n.toLocaleString("en")}`;
        /* the page as the server sends it before her like, kept as the service worker keeps it. A document the test
           hands over has no address of its own, so the browser lets it reach the dev server only when allowed. */
        await page.context().grantPermissions(["local-network-access"]);
        let kept = "";
        await page.route(
          url => url.pathname === address,
          async route => {
            kept ||= await (await route.fetch()).text();
            await route.fulfill({ body: kept, contentType: "text/html; charset=utf-8" });
          }
        );
        await open(page, address);
        const heart = page.getByRole("button", { name: /^Like, / });
        /* a finger's tap on the picture shows its presses */
        const pressHeart = async () => {
          if (width.touch) await page.getByRole("img", { name: "The gradient" }).tap();
          await press(heart, width);
        };
        await expect(heart).toHaveAttribute("aria-label", said(count));
        const sent = sentLike(page, item.kseed);
        await pressHeart();
        await expect(heart).toHaveAttribute("aria-pressed", "true");
        await expect(heart).toHaveAttribute("aria-label", said(count + 1));
        expect(await sent).toBe(true);
        await expect.poll(() => waitingToSync(page, width)).toBe(false);

        // the kept copy again, with no count or sync answered: her like and its count, and a press moves the count
        await page.route("**/api/like-counts*", route => route.abort());
        await page.route("**/api/me/sync", route => route.abort());
        await open(page, address);
        await expect(heart).toHaveAttribute("aria-pressed", "true");
        await expect(heart).toHaveAttribute("aria-label", said(count + 1));
        await pressHeart();
        await expect(heart).toHaveAttribute("aria-pressed", "false");
        await expect(heart).toHaveAttribute("aria-label", said(count));
        await sync(api, likes([item], false));
        expect(broken).toEqual([]);
      });

      for (const list of OWN)
        test(`from ${list.name}, what she opens lands whole and Back returns to the list as it was`, ({
          page
        }) => walk(page, width, list));
    });
});
